use tauri::State;

use crate::db;
use crate::error::Result;
use crate::state::AppState;

#[tauri::command]
pub async fn get_config(state: State<'_, AppState>, key: String) -> Result<Option<String>> {
    let conn = state.db()?;
    db::repository::get_config(&conn, &key)
}

#[tauri::command]
pub async fn set_config(state: State<'_, AppState>, key: String, value: String) -> Result<()> {
    let conn = state.db()?;
    db::repository::set_config(&conn, &key, &value)?;
    Ok(())
}
