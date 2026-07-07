use std::path::PathBuf;

use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::commands::now_ts;
use crate::db;
use crate::error::Result;
use crate::models::pin::{PinRecord, PinTransform};
use crate::services;
use crate::state::AppState;

#[tauri::command]
pub async fn pin_image(
    app: AppHandle,
    state: State<'_, AppState>,
    temp_path: String,
) -> Result<String> {
    let id = uuid::Uuid::new_v4().to_string();

    let file_rel = services::storage::save_pin_image(&state.app_data_dir, &temp_path, &id)?;

    let abs_image_path = state.app_data_dir.join(&file_rel);
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
        .inner_size(300.0, 300.0)
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
