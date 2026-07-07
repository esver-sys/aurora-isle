use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

use crate::error::{AppError, Result};

#[tauri::command]
pub async fn toggle_autostart(app: AppHandle, enabled: bool) -> Result<()> {
    let autostart = app.autolaunch();
    if enabled {
        autostart
            .enable()
            .map_err(|e| AppError::General(e.to_string()))?;
    } else {
        autostart
            .disable()
            .map_err(|e| AppError::General(e.to_string()))?;
    }
    Ok(())
}

#[tauri::command]
pub async fn is_autostart_enabled(app: AppHandle) -> Result<bool> {
    let autostart = app.autolaunch();
    Ok(autostart.is_enabled().unwrap_or(false))
}
