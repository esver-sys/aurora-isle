use std::path::PathBuf;

use arboard::{Clipboard, ImageData};
use image::ImageFormat;
use tauri::{AppHandle, Manager, State};

use crate::commands::now_ts;
use crate::db;
use crate::error::{AppError, Result};
use crate::models::screenshot::ScreenshotHistoryEntry;
use crate::state::AppState;

#[derive(serde::Serialize)]
pub struct CaptureResult {
    pub temp_path: String,
    pub width: u32,
    pub height: u32,
    pub scale_factor: f64,
}

#[tauri::command]
pub async fn capture_screen(
    state: State<'_, AppState>,
    monitor_x: Option<i32>,
    monitor_y: Option<i32>,
) -> Result<CaptureResult> {
    let monitors = xcap::Monitor::all().map_err(|e| AppError::General(e.to_string()))?;

    // 按物理坐标匹配目标显示器，未传坐标时取第一个
    let monitor = if let (Some(mx), Some(my)) = (monitor_x, monitor_y) {
        monitors
            .into_iter()
            .find(|m| m.x() == mx && m.y() == my)
            .ok_or_else(|| AppError::General("Monitor not found at given position".into()))?
    } else {
        monitors
            .into_iter()
            .next()
            .ok_or_else(|| AppError::General("No monitor found".into()))?
    };

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

fn infer_format(path: &PathBuf) -> Result<ImageFormat> {
    match path.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref() {
        Some("png") => Ok(ImageFormat::Png),
        Some("jpg") | Some("jpeg") => Ok(ImageFormat::Jpeg),
        Some("webp") => Ok(ImageFormat::WebP),
        Some("bmp") => Ok(ImageFormat::Bmp),
        _ => Ok(ImageFormat::Png),
    }
}

#[tauri::command]
pub async fn save_image_to_path(src_path: String, dest_path: String) -> Result<String> {
    let src = PathBuf::from(&src_path);
    let dest = PathBuf::from(&dest_path);
    let img = image::open(&src)?;
    let format = infer_format(&dest)?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)?;
    }
    img.save_with_format(&dest, format)?;
    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn quick_save_image(app: AppHandle, state: State<'_, AppState>, src_path: String) -> Result<String> {
    let conn = state.db()?;
    let save_dir = db::repository::get_config(&conn, "quick_save_dir")?;
    let dir = match save_dir {
        Some(d) if !d.is_empty() => PathBuf::from(d),
        _ => app.path().picture_dir().unwrap_or_else(|_| PathBuf::from(".")),
    };
    let screenshots_dir = dir.join("Screenshots");
    std::fs::create_dir_all(&screenshots_dir)?;

    let src = PathBuf::from(&src_path);
    let img = image::open(&src)?;
    let filename = format!("screenshot_{}.png", now_ts());
    let dest = screenshots_dir.join(filename);
    img.save_with_format(&dest, ImageFormat::Png)?;
    Ok(dest.to_string_lossy().to_string())
}

#[derive(serde::Serialize)]
pub struct WindowRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn get_window_at_point(x: f64, y: f64, scale_factor: f64) -> Result<Option<WindowRect>> {
    use windows_sys::Win32::Foundation::{BOOL, HWND, LPARAM, POINT, RECT};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowRect, GetWindowThreadProcessId, IsWindowVisible,
    };

    struct EnumData {
        pt: POINT,
        my_pid: u32,
        best_rect: RECT,
        best_area: i64,
        found: bool,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let data = &mut *(lparam as *mut EnumData);

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == data.my_pid {
            return 1;
        }

        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }

        let mut rect: RECT = std::mem::zeroed();
        if GetWindowRect(hwnd, &mut rect) == 0 {
            return 1;
        }

        if data.pt.x >= rect.left
            && data.pt.x < rect.right
            && data.pt.y >= rect.top
            && data.pt.y < rect.bottom
        {
            let area = ((rect.right - rect.left) as i64) * ((rect.bottom - rect.top) as i64);
            if area < data.best_area {
                data.best_area = area;
                data.best_rect = rect;
                data.found = true;
            }
        }

        1
    }

    let pt = POINT {
        x: (x * scale_factor) as i32,
        y: (y * scale_factor) as i32,
    };

    let mut data = EnumData {
        pt,
        my_pid: std::process::id(),
        best_rect: RECT { left: 0, top: 0, right: 0, bottom: 0 },
        best_area: i64::MAX,
        found: false,
    };

    unsafe {
        EnumWindows(
            Some(enum_proc),
            &mut data as *mut _ as isize,
        );
    }

    if data.found {
        let r = data.best_rect;
        Ok(Some(WindowRect {
            x: r.left as f64 / scale_factor,
            y: r.top as f64 / scale_factor,
            width: (r.right - r.left) as f64 / scale_factor,
            height: (r.bottom - r.top) as f64 / scale_factor,
        }))
    } else {
        Ok(None)
    }
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub async fn get_window_at_point(_x: f64, _y: f64, _scale_factor: f64) -> Result<Option<WindowRect>> {
    Ok(None)
}

#[tauri::command]
pub async fn save_image_bytes(state: State<'_, AppState>, bytes: Vec<u8>) -> Result<String> {
    let snip_dir = state.app_data_dir.join("snips");
    std::fs::create_dir_all(&snip_dir)?;
    let filename = format!("annotated_{}.png", now_ts());
    let path = snip_dir.join(filename);
    std::fs::write(&path, &bytes)?;
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn add_screenshot_history(
    state: State<'_, AppState>,
    region_x: f64,
    region_y: f64,
    region_width: f64,
    region_height: f64,
    scale_factor: f64,
    file_path: Option<String>,
) -> Result<()> {
    let conn = state.db()?;
    db::repository::insert_screenshot_history(
        &conn,
        region_x,
        region_y,
        region_width,
        region_height,
        scale_factor,
        file_path.as_deref(),
    )?;
    Ok(())
}

#[tauri::command]
pub async fn get_screenshot_history(state: State<'_, AppState>, limit: Option<u32>) -> Result<Vec<ScreenshotHistoryEntry>> {
    let conn = state.db()?;
    let limit = limit.unwrap_or(20);
    db::repository::get_screenshot_history(&conn, limit)
}

#[tauri::command]
pub async fn clear_screenshot_history(state: State<'_, AppState>) -> Result<()> {
    let conn = state.db()?;
    db::repository::clear_screenshot_history(&conn)
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
