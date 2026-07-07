use tauri::AppHandle;

use crate::error::Result;

pub fn start_listener(_app: AppHandle) -> Result<()> {
    tracing::info!("Clipboard listener stub - will be implemented with windows crate");
    Ok(())
}
