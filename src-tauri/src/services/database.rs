use std::path::Path;

use rusqlite::Connection;

use crate::error::Result;

pub fn init_database(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.execute_batch("PRAGMA journal_mode = WAL;")?;
    crate::db::migrations::run_migrations(&conn)?;
    Ok(conn)
}
