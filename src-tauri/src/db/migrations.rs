use rusqlite::Connection;

use crate::error::Result;

const SCHEMA_V1: &str = r#"
    CREATE TABLE IF NOT EXISTS config (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pins (
        id            TEXT PRIMARY KEY,
        file_path     TEXT NOT NULL,
        thumb_path    TEXT,
        pos_x         REAL,
        pos_y         REAL,
        scale         REAL DEFAULT 1.0,
        rotation      REAL DEFAULT 0.0,
        opacity       REAL DEFAULT 1.0,
        always_on_top INTEGER DEFAULT 1,
        locked        INTEGER DEFAULT 0,
        pinned_open   INTEGER DEFAULT 1,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
    );
    INSERT OR IGNORE INTO schema_version (version) VALUES (1);
"#;

pub fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch(SCHEMA_V1)?;
    tracing::info!("Database migrations applied (v1)");
    Ok(())
}
