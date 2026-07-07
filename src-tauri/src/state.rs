use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub app_data_dir: PathBuf,
}

impl AppState {
    pub fn new(db: Connection, app_data_dir: PathBuf) -> Self {
        Self {
            db: Mutex::new(db),
            app_data_dir,
        }
    }

    pub fn db(&self) -> Result<std::sync::MutexGuard<'_, Connection>, crate::error::AppError> {
        self.db
            .lock()
            .map_err(|e| crate::error::AppError::Lock(e.to_string()))
    }
}
