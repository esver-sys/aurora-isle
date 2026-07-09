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

    CREATE TABLE IF NOT EXISTS screenshot_history (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        region_x      REAL NOT NULL,
        region_y      REAL NOT NULL,
        region_width  REAL NOT NULL,
        region_height REAL NOT NULL,
        scale_factor  REAL NOT NULL,
        file_path     TEXT,
        created_at    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schema_version (
        version INTEGER PRIMARY KEY
    );
    INSERT OR IGNORE INTO schema_version (version) VALUES (1);
"#;

/// V2 迁移：为 pins 表新增 hidden / flip_h / flip_v 字段，支持贴图隐藏与翻转功能
const SCHEMA_V2: &str = r#"
    ALTER TABLE pins ADD COLUMN hidden INTEGER DEFAULT 0;
    ALTER TABLE pins ADD COLUMN flip_h INTEGER DEFAULT 0;
    ALTER TABLE pins ADD COLUMN flip_v INTEGER DEFAULT 0;
"#;

/// 读取当前数据库版本号；若 schema_version 表不存在则返回 0
fn get_db_version(conn: &Connection) -> i64 {
    conn.query_row("SELECT MAX(version) FROM schema_version", [], |row| row.get(0))
        .unwrap_or(0)
}

pub fn run_migrations(conn: &Connection) -> Result<()> {
    // V1: 基础表结构（幂等，IF NOT EXISTS 保证可重复执行）
    conn.execute_batch(SCHEMA_V1)?;

    // V2: 新增贴图字段，仅在版本 < 2 时执行，避免 ALTER TABLE 重复加列报错
    let current = get_db_version(conn);
    if current < 2 {
        conn.execute_batch(SCHEMA_V2)?;
        conn.execute("INSERT OR IGNORE INTO schema_version (version) VALUES (2)", [])?;
        tracing::info!("Database migrations applied (v1 -> v2)");
    } else {
        tracing::info!("Database already at v{}", current);
    }

    Ok(())
}
