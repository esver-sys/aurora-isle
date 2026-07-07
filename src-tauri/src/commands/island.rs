use serde::Serialize;
use tauri::{AppHandle, LogicalPosition, LogicalSize, Manager};

use crate::error::{AppError, Result};

#[derive(Serialize)]
pub struct MonitorInfo {
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

fn get_island_window(app: &AppHandle) -> Result<tauri::WebviewWindow> {
    app.get_webview_window("island")
        .ok_or_else(|| AppError::Window("island window not found".into()))
}

#[tauri::command]
pub async fn set_window_size(app: AppHandle, width: u32, height: u32) -> Result<()> {
    let window = get_island_window(&app)?;
    window.set_size(LogicalSize::new(width, height))?;
    Ok(())
}

#[tauri::command]
pub async fn set_window_position(app: AppHandle, x: i32, y: i32) -> Result<()> {
    let window = get_island_window(&app)?;
    window.set_position(LogicalPosition::new(x, y))?;
    Ok(())
}

#[tauri::command]
pub async fn get_window_position(app: AppHandle) -> Result<(i32, i32)> {
    let window = get_island_window(&app)?;
    let pos = window.outer_position()?;
    Ok((pos.x, pos.y))
}

#[tauri::command]
pub async fn get_monitor_info(app: AppHandle) -> Result<MonitorInfo> {
    let window = get_island_window(&app)?;
    let monitor = window
        .current_monitor()?
        .ok_or_else(|| AppError::Window("no monitor found".into()))?;
    let size = monitor.size();
    Ok(MonitorInfo {
        width: size.width,
        height: size.height,
        scale_factor: monitor.scale_factor(),
    })
}
