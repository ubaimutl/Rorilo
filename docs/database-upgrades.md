# Desktop database upgrades

Desktop startup runs the bundled `migrate-desktop-database.mjs` helper with the bundled Node 22 runtime before starting the web server. The helper compares the existing SQLite database with the packaged schema.

Missing tables, indexes, nullable columns, and columns with declared defaults are added in a transaction. Existing rows, settings, extra tables, and extra columns are retained. Fields that require an explicit data migration fail without guessing replacement values.

When an existing database needs changes, SQLite first creates a consistent backup beside it, named `rorilo.db.before-upgrade-<timestamp>-<identifier>.db`. Committed WAL data is included. A failed upgrade rolls back its changes and retains the backup. Starting an already upgraded database does not create more backups.

The v0.1.0-to-current upgrade adds `CV.fileData`, `CV.mimeType`, and `CV.fileSize` as nullable columns. Existing CV text stays available, and downloading an older CV continues to use its stored text when original file bytes are absent.

## Regression checks

After generating the desktop server bundle, run:

```sh
npm run desktop:test-upgrades
npm run desktop:prepare-node
npm run desktop:test-database
```

Upgrade tests cover the released v0.1.0 schema, data retention, repeat startup, WAL backups, transactional rollback, and unsafe required-column changes. Packaged-runtime tests query every Prisma model and exercise profile/settings writes, CV file storage, tracker relationships, and cascade deletion on both fresh and upgraded databases. Linux CI repeats those checks in both supported OpenSSL environments and against the extracted AppImage.

CV replacement also uses a database transaction, so a failed write retains the previous active CV. Backup import restores JSON-encoded CV bytes before replacing any data.
