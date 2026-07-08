use std::path::PathBuf;

use image::ImageFormat;
use tauri::State;

use crate::commands::now_ts;
use crate::error::{AppError, Result};
use crate::state::AppState;

#[derive(serde::Serialize)]
pub struct CaptureResult {
    pub temp_path: String,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

#[tauri::command]
pub async fn capture_screen(state: State<'_, AppState>) -> Result<CaptureResult> {
    let monitors = xcap::Monitor::all().map_err(|e| AppError::General(e.to_string()))?;
    let monitor = monitors
        .into_iter()
        .next()
        .ok_or_else(|| AppError::General("No monitor found".into()))?;

    let img = monitor
        .capture_image()
        .map_err(|e| AppError::General(e.to_string()))?;

    let width = img.width();
    let height = img.height();
    let scale_factor = monitor.scale_factor() as f64;

    let snip_dir = state.app_data_dir.join("snips");
    std::fs::create_dir_all(&snip_dir)?;
    let filename = format!("capture_{}.png", now_ts());
    let temp_path = snip_dir.join(filename);
    img.save_with_format(&temp_path, ImageFormat::Png)
        .map_err(|e| AppError::General(e.to_string()))?;

    Ok(CaptureResult {
        temp_path: temp_path.to_string_lossy().to_string(),
        width,
        height,
        scale_factor,
    })
}

#[derive(serde::Deserialize)]
pub struct CropRegion {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[tauri::command]
pub async fn crop_image(source_path: String, region: CropRegion) -> Result<String> {
    let src = PathBuf::from(&source_path);
    let img = image::open(&src)?;

    let cropped = img.crop_imm(region.x, region.y, region.width, region.height);

    let temp_dir = std::env::temp_dir();
    let filename = format!("aurora_crop_{}.png", now_ts());
    let out_path = temp_dir.join(filename);
    cropped.save_with_format(&out_path, ImageFormat::Png)?;

    Ok(out_path.to_string_lossy().to_string())
}
