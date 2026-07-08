use std::path::PathBuf;

use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::commands::now_ts;
use crate::db;
use crate::error::Result;
use crate::models::pin::{PinRecord, PinTransform};
use crate::services;
use crate::state::AppState;

const PIN_WINDOW_MIN_SIDE: f64 = 160.0;
const PIN_WINDOW_MAX_SIDE: f64 = 480.0;

fn compute_pin_window_size(image_width: u32, image_height: u32) -> (f64, f64) {
    let width = image_width.max(1) as f64;
    let height = image_height.max(1) as f64;
    let longest_side = width.max(height);

    // 核心逻辑：贴图窗口按图片比例初始化，过大的图收敛到最大边，过小的图放大到最小可操作边。
    let scale = if longest_side > PIN_WINDOW_MAX_SIDE {
        PIN_WINDOW_MAX_SIDE / longest_side
    } else if longest_side < PIN_WINDOW_MIN_SIDE {
        PIN_WINDOW_MIN_SIDE / longest_side
    } else {
        1.0
    };

    ((width * scale).round(), (height * scale).round())
}

#[tauri::command]
pub async fn pin_image(
    app: AppHandle,
    state: State<'_, AppState>,
    temp_path: String,
) -> Result<String> {
    let id = uuid::Uuid::new_v4().to_string();

    let file_rel = services::storage::save_pin_image(&state.app_data_dir, &temp_path, &id)?;

    let abs_image_path = state.app_data_dir.join(&file_rel);
    let (image_width, image_height) = image::image_dimensions(&abs_image_path)?;
    let (pin_window_width, pin_window_height) = compute_pin_window_size(image_width, image_height);
    let thumb_rel = services::thumbnail::generate_thumbnail(
        &abs_image_path,
        &state.app_data_dir.join("thumbs"),
        &id,
        256,
    )
    .ok();

    let now = now_ts();
    let pin = PinRecord {
        id: id.clone(),
        file_path: file_rel,
        thumb_path: thumb_rel,
        pos_x: None,
        pos_y: None,
        scale: 1.0,
        rotation: 0.0,
        opacity: 1.0,
        always_on_top: true,
        locked: false,
        pinned_open: true,
        created_at: now,
        updated_at: now,
    };

    {
        let conn = state.db()?;
        db::repository::insert_pin(&conn, &pin)?;
    }

    let label = format!("pin-{}", id);
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("index.html".into()))
        .title("Pin")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .inner_size(pin_window_width, pin_window_height)
        .build()?;

    Ok(id)
}

#[tauri::command]
pub async fn unpin_image(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<()> {
    {
        let conn = state.db()?;
        db::repository::close_pin(&conn, &id)?;
    }

    let label = format!("pin-{}", id);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.close();
    }

    Ok(())
}

#[tauri::command]
pub async fn update_pin_transform(
    state: State<'_, AppState>,
    id: String,
    transform: PinTransform,
) -> Result<()> {
    let conn = state.db()?;
    db::repository::update_pin_transform(
        &conn,
        &id,
        transform.pos_x,
        transform.pos_y,
        transform.scale,
        transform.rotation,
        transform.opacity,
    )?;
    Ok(())
}

#[tauri::command]
pub async fn get_open_pins(state: State<'_, AppState>) -> Result<Vec<PinRecord>> {
    let conn = state.db()?;
    db::repository::get_open_pins(&conn)
}

#[tauri::command]
pub async fn get_pin_by_id(state: State<'_, AppState>, id: String) -> Result<PinRecord> {
    let conn = state.db()?;
    db::repository::get_pin_by_id(&conn, &id)
}

#[tauri::command]
pub async fn get_image_path(state: State<'_, AppState>, file_rel: String) -> Result<String> {
    let abs_path = state.app_data_dir.join(&file_rel);
    Ok(abs_path.to_string_lossy().to_string())
}

pub fn resolve_pin_path(state: &AppState, file_rel: &str) -> PathBuf {
    state.app_data_dir.join(file_rel)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compute_pin_window_size_keeps_image_aspect_ratio_within_bounds() {
        let (width, height) = compute_pin_window_size(1200, 600);

        assert_eq!((width, height), (480.0, 240.0));
    }

    #[test]
    fn compute_pin_window_size_enforces_minimum_interactive_area() {
        let (width, height) = compute_pin_window_size(32, 16);

        assert_eq!((width, height), (160.0, 80.0));
    }
}
