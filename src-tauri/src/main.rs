#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::webview::{DownloadEvent, NewWindowResponse, Url};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

type SharedChild = Arc<Mutex<Option<Child>>>;

struct Sidecar(SharedChild);

#[cfg(target_os = "linux")]
fn configure_linux_webview_env() {
    for (key, value) in [
        ("WEBKIT_DISABLE_COMPOSITING_MODE", "1"),
        ("WEBKIT_DISABLE_DMABUF_RENDERER", "1"),
    ] {
        if std::env::var_os(key).is_none() {
            std::env::set_var(key, value);
        }
    }
}

fn stop_sidecar(slot: &SharedChild) {
    if let Some(mut child) = slot.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn env_path(key: &str) -> Option<PathBuf> {
    std::env::var(key)
        .ok()
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)
}

fn node_path(resource_dir: &std::path::Path) -> PathBuf {
    if let Some(path) = env_path("RORILO_NODE") {
        return path;
    }

    #[cfg(windows)]
    {
        resource_dir.join("node").join("node.exe")
    }

    #[cfg(not(windows))]
    {
        resource_dir.join("node").join("bin").join("node")
    }
}

fn resource_candidates(resource_dir: &Path) -> Vec<PathBuf> {
    let mut candidates = vec![
        resource_dir.to_path_buf(),
        resource_dir.join("resources"),
        resource_dir.join("Rorilo").join("resources"),
        resource_dir.join("rorilo").join("resources"),
        resource_dir.join("lib").join("Rorilo").join("resources"),
        resource_dir.join("lib").join("rorilo").join("resources"),
    ];

    if let Some(parent) = resource_dir.parent() {
        candidates.push(parent.join("Rorilo").join("resources"));
        candidates.push(parent.join("rorilo").join("resources"));
        candidates.push(parent.join("lib").join("Rorilo").join("resources"));
        candidates.push(parent.join("lib").join("rorilo").join("resources"));
    }

    if let Some(app_dir) = env_path("APPDIR") {
        candidates.push(
            app_dir
                .join("usr")
                .join("lib")
                .join("Rorilo")
                .join("resources"),
        );
        candidates.push(
            app_dir
                .join("usr")
                .join("lib")
                .join("rorilo")
                .join("resources"),
        );
    }

    candidates
}

fn resolve_resource_dir(resource_dir: &Path) -> Result<PathBuf, String> {
    let candidates = resource_candidates(resource_dir);

    for candidate in &candidates {
        if candidate.join("schema.sql").is_file()
            && candidate.join("server").join("server.js").is_file()
            && candidate
                .join("server")
                .join("migrate-desktop-database.mjs")
                .is_file()
            && node_path(candidate).is_file()
        {
            return Ok(candidate.to_path_buf());
        }
    }

    let searched = candidates
        .iter()
        .map(|path| path.display().to_string())
        .collect::<Vec<_>>()
        .join(", ");

    Err(format!(
        "Could not find bundled Rorilo resources. Searched: {searched}"
    ))
}

fn wait_ready(port: u16, timeout: Duration) -> bool {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            std::thread::sleep(Duration::from_millis(800));
            return true;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    false
}

fn is_internal_url(url: &Url, port: u16) -> bool {
    let host = url.host_str().unwrap_or_default();
    let is_local_host = matches!(host, "127.0.0.1" | "localhost" | "::1");
    is_local_host && url.port_or_known_default() == Some(port)
}

fn open_system_url(raw_url: &str) {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = Command::new("open");
        cmd.arg(raw_url);
        cmd
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "start", "", raw_url]);
        cmd
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(raw_url);
        cmd
    };

    let _ = command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn();
}

fn should_open_with_system(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https" | "mailto")
}

fn clean_download_filename(raw: &str) -> String {
    let name = raw
        .split('/')
        .next_back()
        .unwrap_or("rorilo-download")
        .split('?')
        .next()
        .unwrap_or("rorilo-download")
        .trim();
    let cleaned: String = name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
                ch
            } else {
                '_'
            }
        })
        .collect();

    if cleaned.is_empty() {
        "rorilo-download".to_string()
    } else {
        cleaned
    }
}

fn download_filename(url: &Url) -> String {
    let path = url.path();
    if path.contains("/api/data/export") {
        return "rorilo-backup.json".to_string();
    }
    if url.scheme() == "blob" {
        return "rorilo-download.pdf".to_string();
    }

    let mut filename = clean_download_filename(path);
    if !filename.contains('.') {
        filename.push_str(".download");
    }
    filename
}

fn handle_download(app: AppHandle, event: DownloadEvent<'_>) -> bool {
    if let DownloadEvent::Requested { url, destination } = event {
        if destination.as_os_str().is_empty() || !destination.is_absolute() {
            if let Ok(download_dir) = app.path().download_dir() {
                *destination = download_dir.join(download_filename(&url));
            }
        }
    }

    true
}

fn spawn_server(
    node: &Path,
    server_dir: &Path,
    port: &str,
    database_url: &str,
) -> Result<Child, String> {
    let mut command = Command::new(node);
    command
        .arg("server.js")
        .current_dir(server_dir)
        .env("PORT", port)
        .env("DATABASE_URL", database_url)
        .env("HOSTNAME", "127.0.0.1")
        .env("RORILO_DISABLE_AUTH", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    command.spawn().map_err(|error| {
        format!(
            "Could not start Rorilo server with node '{}' in '{}': {error}",
            node.display(),
            server_dir.display()
        )
    })
}

fn init_database(
    node: &Path,
    server_dir: &Path,
    db_path: &Path,
    schema_path: &Path,
) -> Result<(), String> {
    let mut command = Command::new(node);
    command
        .arg(server_dir.join("migrate-desktop-database.mjs"))
        .arg(db_path)
        .arg(schema_path);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = command
        .output()
        .map_err(|error| format!("Could not start database preparation: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "Could not prepare local database: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }
    Ok(())
}

fn main() {
    #[cfg(target_os = "linux")]
    configure_linux_webview_env();

    let sidecar: SharedChild = Arc::new(Mutex::new(None));

    #[cfg(not(windows))]
    {
        let sidecar = sidecar.clone();
        std::thread::spawn(move || {
            let mut signals = signal_hook::iterator::Signals::new([
                signal_hook::consts::SIGTERM,
                signal_hook::consts::SIGINT,
            ])
            .expect("signal handler");
            for _ in signals.forever() {
                stop_sidecar(&sidecar);
                std::process::exit(0);
            }
        });
    }

    let managed = sidecar.clone();
    tauri::Builder::default()
        .manage(Sidecar(managed))
        .setup(move |app| {
            let resource_dir = app.path().resource_dir().expect("resource dir");
            let resource_dir = resolve_resource_dir(&resource_dir).expect("find bundled resources");
            let data_dir = env_path("RORILO_DATA_DIR")
                .unwrap_or_else(|| app.path().app_data_dir().expect("app data dir"));
            std::fs::create_dir_all(&data_dir).expect("create data dir");

            let server_dir =
                env_path("RORILO_SERVER_DIR").unwrap_or_else(|| resource_dir.join("server"));
            let node = node_path(&resource_dir);
            let port = std::env::var("RORILO_PORT").unwrap_or_else(|_| "43827".to_string());
            let port_num: u16 = port.parse().expect("RORILO_PORT must be numeric");
            let db_path = data_dir.join("rorilo.db");
            let database_url = format!("file:{}", db_path.display());
            let schema_path =
                env_path("RORILO_SCHEMA").unwrap_or_else(|| resource_dir.join("schema.sql"));

            init_database(&node, &server_dir, &db_path, &schema_path).expect("prepare database");

            let child = spawn_server(&node, &server_dir, &port, &database_url)?;

            *sidecar.lock().unwrap() = Some(child);

            if !wait_ready(port_num, Duration::from_secs(90)) {
                stop_sidecar(&sidecar);
                std::process::exit(1);
            }

            let url = format!("http://127.0.0.1:{port}");
            let app_for_download = app.handle().clone();
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(url.parse().expect("valid url")),
            )
            .title("Rorilo")
            .inner_size(1280.0, 860.0)
            .min_inner_size(900.0, 600.0)
            .on_navigation(move |url| {
                if is_internal_url(url, port_num) {
                    return true;
                }

                if should_open_with_system(url) {
                    open_system_url(url.as_str());
                }
                false
            })
            .on_new_window(move |url, _features| {
                if should_open_with_system(&url) {
                    open_system_url(url.as_str());
                }
                NewWindowResponse::Deny
            })
            .on_download(move |_webview, event| handle_download(app_for_download.clone(), event))
            .build()?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::Destroyed) && window.label() == "main" {
                stop_sidecar(&window.state::<Sidecar>().0);
            }
        })
        .run(tauri::generate_context!())
        .expect("run app");
}

#[cfg(test)]
mod tests {
    use super::{init_database, node_path, resolve_resource_dir};
    use std::fs;
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_resource_dir(path: &Path) {
        fs::create_dir_all(path.join("server")).unwrap();
        let node = if cfg!(windows) {
            path.join("node").join("node.exe")
        } else {
            path.join("node").join("bin").join("node")
        };
        fs::create_dir_all(node.parent().unwrap()).unwrap();
        fs::write(path.join("schema.sql"), "").unwrap();
        fs::write(path.join("server").join("server.js"), "").unwrap();
        fs::write(path.join("server").join("migrate-desktop-database.mjs"), "").unwrap();
        fs::write(node, "").unwrap();
    }

    #[test]
    fn resolves_direct_resource_dir() {
        let root = std::env::temp_dir().join(format!(
            "rorilo-resource-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let resources = root.join("resources");
        make_resource_dir(&resources);

        let resolved = resolve_resource_dir(&resources).unwrap();

        assert_eq!(resolved, resources);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn resolves_linux_appimage_usr_lib_layout() {
        let root = std::env::temp_dir().join(format!(
            "rorilo-appdir-test-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let resources = root
            .join("usr")
            .join("lib")
            .join("Rorilo")
            .join("resources");
        make_resource_dir(&resources);

        let resolved = resolve_resource_dir(&root.join("usr")).unwrap();

        assert_eq!(resolved, resources);
        fs::remove_dir_all(root).unwrap();
    }

    fn database_test_dir(label: &str) -> std::path::PathBuf {
        let root = std::env::temp_dir().join(format!(
            "rorilo-db-{label}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }

    #[test]
    fn initializes_fresh_database_through_the_bundled_runtime() {
        let resources = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
        let root = database_test_dir("fresh");
        let database = root.join("rorilo.db");
        init_database(
            &node_path(&resources),
            &resources.join("server"),
            &database,
            &resources.join("schema.sql"),
        )
        .unwrap();
        {
            let db = rusqlite::Connection::open(&database).unwrap();
            let exists: i64 = db
                .query_row(
                    "SELECT COUNT(*) FROM pragma_table_info('CV') WHERE name = 'fileData'",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(exists, 1);
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn upgrades_existing_database_without_losing_the_cv() {
        let resources = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
        let root = database_test_dir("legacy");
        let database = root.join("rorilo.db");
        {
            let db = rusqlite::Connection::open(&database).unwrap();
            db.execute_batch(include_str!("../../tests/fixtures/database-v0.1.0.sql"))
                .unwrap();
            db.execute("INSERT INTO CV (id, originalFilename, extractedText, updatedAt) VALUES ('legacy', 'old.txt', 'Keep old CV', '2026-01-01')", []).unwrap();
        }
        for _ in 0..2 {
            init_database(
                &node_path(&resources),
                &resources.join("server"),
                &database,
                &resources.join("schema.sql"),
            )
            .unwrap();
        }
        {
            let db = rusqlite::Connection::open(&database).unwrap();
            let cv: (String, Option<Vec<u8>>) = db
                .query_row(
                    "SELECT extractedText, fileData FROM CV WHERE id = 'legacy'",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();
            assert_eq!(cv, ("Keep old CV".to_string(), None));
        }
        let backups = fs::read_dir(&root)
            .unwrap()
            .filter(|entry| {
                entry
                    .as_ref()
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .contains(".before-upgrade-")
            })
            .count();
        assert_eq!(backups, 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn reports_database_preparation_failure_before_server_start() {
        let resources = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
        let root = database_test_dir("invalid");
        let schema = root.join("invalid.sql");
        fs::write(&schema, "not valid SQL").unwrap();
        let error = init_database(
            &node_path(&resources),
            &resources.join("server"),
            &root.join("rorilo.db"),
            &schema,
        )
        .unwrap_err();
        assert!(error.contains("Could not prepare local database"));
        fs::remove_dir_all(root).unwrap();
    }
}
