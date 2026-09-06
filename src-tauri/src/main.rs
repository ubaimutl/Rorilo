#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpStream;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

type SharedChild = Arc<Mutex<Option<Child>>>;

struct Sidecar(SharedChild);

fn stop_sidecar(slot: &SharedChild) {
    if let Some(mut child) = slot.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn env_path(key: &str) -> Option<PathBuf> {
    std::env::var(key).ok().filter(|value| !value.is_empty()).map(PathBuf::from)
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

fn init_database(db_path: &PathBuf, schema_path: &PathBuf) -> Result<(), String> {
    if db_path.metadata().map(|metadata| metadata.len() > 0).unwrap_or(false) {
        return Ok(());
    }

    let schema = std::fs::read_to_string(schema_path)
        .map_err(|error| format!("Could not read bundled database schema: {error}"))?;
    let connection = rusqlite::Connection::open(db_path)
        .map_err(|error| format!("Could not create local database: {error}"))?;
    connection
        .execute_batch(&schema)
        .map_err(|error| format!("Could not initialize local database: {error}"))?;
    Ok(())
}

fn main() {
    let sidecar: SharedChild = Arc::new(Mutex::new(None));

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
            let data_dir = env_path("RORILO_DATA_DIR")
                .unwrap_or_else(|| app.path().app_data_dir().expect("app data dir"));
            std::fs::create_dir_all(&data_dir).expect("create data dir");

            let server_dir = env_path("RORILO_SERVER_DIR")
                .unwrap_or_else(|| resource_dir.join("server"));
            let node = node_path(&resource_dir);
            let port = std::env::var("RORILO_PORT").unwrap_or_else(|_| "43827".to_string());
            let port_num: u16 = port.parse().expect("RORILO_PORT must be numeric");
            let db_path = data_dir.join("rorilo.db");
            let database_url = format!("file:{}", db_path.display());
            let schema_path = env_path("RORILO_SCHEMA")
                .unwrap_or_else(|| resource_dir.join("schema.sql"));

            init_database(&db_path, &schema_path).expect("prepare database");

            let child = Command::new(&node)
                .arg("server.js")
                .current_dir(&server_dir)
                .env("PORT", &port)
                .env("DATABASE_URL", &database_url)
                .env("HOSTNAME", "127.0.0.1")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .expect("spawn Rorilo server");

            *sidecar.lock().unwrap() = Some(child);

            if !wait_ready(port_num, Duration::from_secs(90)) {
                stop_sidecar(&sidecar);
                std::process::exit(1);
            }

            let url = format!("http://127.0.0.1:{port}");
            WebviewWindowBuilder::new(
                app,
                "main",
                WebviewUrl::External(url.parse().expect("valid url")),
            )
            .title("Rorilo")
            .inner_size(1280.0, 860.0)
            .min_inner_size(900.0, 600.0)
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
