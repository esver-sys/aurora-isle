use std::path::PathBuf;

use arboard::{Clipboard, ImageData};
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
    let filename = format!("capture_{}.bmp", now_ts());
    let temp_path = snip_dir.join(filename);
    img.save_with_format(&temp_path, ImageFormat::Bmp)
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

fn image_data_from_path(path: &PathBuf) -> Result<ImageData<'static>> {
    let img = image::open(path)?.to_rgba8();
    let width = img.width() as usize;
    let height = img.height() as usize;

    Ok(ImageData {
        width,
        height,
        bytes: std::borrow::Cow::Owned(img.into_raw()),
    })
}

#[tauri::command]
pub async fn copy_image_to_clipboard(image_path: String) -> Result<()> {
    let data = image_data_from_path(&PathBuf::from(image_path))?;
    let mut clipboard = Clipboard::new().map_err(|e| AppError::Clipboard(e.to_string()))?;
    clipboard
        .set_image(data)
        .map_err(|e| AppError::Clipboard(e.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{ImageBuffer, Rgba};

    #[test]
    fn image_data_from_path_returns_rgba_clipboard_payload() {
        let path = std::env::temp_dir().join(format!("aurora_test_{}.png", now_ts()));
        let img = ImageBuffer::from_fn(2, 1, |x, _| {
            if x == 0 {
                Rgba([255u8, 0, 0, 255])
            } else {
                Rgba([0u8, 255, 0, 128])
            }
        });
        img.save_with_format(&path, ImageFormat::Png).unwrap();

        let data = image_data_from_path(&path).unwrap();

        assert_eq!(data.width, 2);
        assert_eq!(data.height, 1);
        assert_eq!(data.bytes.len(), 8);

        let _ = std::fs::remove_file(path);
    }
}
