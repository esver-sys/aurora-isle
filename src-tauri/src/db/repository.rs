use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, Row};

use crate::error::{AppError, Result};
use crate::models::pin::PinRecord;
use crate::models::screenshot::ScreenshotHistoryEntry;

fn now_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// 从数据库行解析 PinRecord，统一字段映射避免重复代码
fn row_to_pin(row: &Row) -> rusqlite::Result<PinRecord> {
    Ok(PinRecord {
        id: row.get(0)?,
        file_path: row.get(1)?,
        thumb_path: row.get(2)?,
        pos_x: row.get(3)?,
        pos_y: row.get(4)?,
        scale: row.get(5)?,
        rotation: row.get(6)?,
        opacity: row.get(7)?,
        always_on_top: row.get::<_, i32>(8)? != 0,
        locked: row.get::<_, i32>(9)? != 0,
        pinned_open: row.get::<_, i32>(10)? != 0,
        hidden: row.get::<_, i32>(11)? != 0,
        flip_h: row.get::<_, i32>(12)? != 0,
        flip_v: row.get::<_, i32>(13)? != 0,
        base_width: row.get(14)?,
        base_height: row.get(15)?,
        created_at: row.get(16)?,
        updated_at: row.get(17)?,
    })
}

/// 所有贴图字段的 SELECT 片段，保证 row_to_pin 索引一致
const PIN_COLUMNS: &str =
    "id, file_path, thumb_path, pos_x, pos_y, scale, rotation, \
     opacity, always_on_top, locked, pinned_open, hidden, flip_h, flip_v, \
     base_width, base_height, created_at, updated_at";

pub fn get_config(conn: &Connection, key: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare("SELECT value FROM config WHERE key = ?1")?;
    let mut rows = stmt.query(params![key])?;
    match rows.next()? {
        Some(row) => Ok(Some(row.get(0)?)),
        None => Ok(None),
    }
}

pub fn set_config(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT OR REPLACE INTO config (key, value) VALUES (?1, ?2)",
        params![key, value],
    )?;
    Ok(())
}

pub fn insert_pin(conn: &Connection, pin: &PinRecord) -> Result<()> {
    conn.execute(
        r#"INSERT INTO pins
           (id, file_path, thumb_path, pos_x, pos_y, scale, rotation,
            opacity, always_on_top, locked, pinned_open, hidden, flip_h, flip_v,
            base_width, base_height, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)"#,
        params![
            pin.id,
            pin.file_path,
            pin.thumb_path,
            pin.pos_x,
            pin.pos_y,
            pin.scale,
            pin.rotation,
            pin.opacity,
            pin.always_on_top as i32,
            pin.locked as i32,
            pin.pinned_open as i32,
            pin.hidden as i32,
            pin.flip_h as i32,
            pin.flip_v as i32,
            pin.base_width,
            pin.base_height,
            pin.created_at,
            pin.updated_at,
        ],
    )?;
    Ok(())
}

pub fn get_pin_by_id(conn: &Connection, id: &str) -> Result<PinRecord> {
    let sql = format!("SELECT {} FROM pins WHERE id = ?1", PIN_COLUMNS);
    let mut stmt = conn.prepare(&sql)?;
    let pin = stmt
        .query_row(params![id], row_to_pin)
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::PinNotFound(id.to_string()),
            other => AppError::Database(other),
        })?;
    Ok(pin)
}

/// 获取所有 pinned_open=1 的贴图（含隐藏状态），按创建时间排序
pub fn get_open_pins(conn: &Connection) -> Result<Vec<PinRecord>> {
    let sql = format!(
        "SELECT {} FROM pins WHERE pinned_open = 1 ORDER BY created_at",
        PIN_COLUMNS
    );
    let mut stmt = conn.prepare(&sql)?;
    let pins = stmt
        .query_map([], row_to_pin)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(pins)
}

/// 获取所有贴图记录（含已关闭），按创建时间倒序，用于贴图管理面板
pub fn get_all_pins(conn: &Connection) -> Result<Vec<PinRecord>> {
    let sql = format!(
        "SELECT {} FROM pins ORDER BY created_at DESC",
        PIN_COLUMNS
    );
    let mut stmt = conn.prepare(&sql)?;
    let pins = stmt
        .query_map([], row_to_pin)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(pins)
}

/// 获取可恢复的贴图：pinned_open=1 且未隐藏，用于应用启动时重开窗口
pub fn get_restorable_pins(conn: &Connection) -> Result<Vec<PinRecord>> {
    let sql = format!(
        "SELECT {} FROM pins WHERE pinned_open = 1 AND hidden = 0 ORDER BY created_at",
        PIN_COLUMNS
    );
    let mut stmt = conn.prepare(&sql)?;
    let pins = stmt
        .query_map([], row_to_pin)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(pins)
}

/// 动态更新贴图字段：仅更新传入的字段，未传字段保持原值
pub fn update_pin_transform(
    conn: &Connection,
    id: &str,
    pos_x: Option<f64>,
    pos_y: Option<f64>,
    scale: Option<f64>,
    rotation: Option<f64>,
    opacity: Option<f64>,
    always_on_top: Option<bool>,
    locked: Option<bool>,
    flip_h: Option<bool>,
    flip_v: Option<bool>,
) -> Result<()> {
    let now = now_timestamp();
    let mut sets: Vec<&str> = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if pos_x.is_some() {
        sets.push("pos_x = ?");
        params_vec.push(Box::new(pos_x));
    }
    if pos_y.is_some() {
        sets.push("pos_y = ?");
        params_vec.push(Box::new(pos_y));
    }
    if scale.is_some() {
        sets.push("scale = ?");
        params_vec.push(Box::new(scale));
    }
    if rotation.is_some() {
        sets.push("rotation = ?");
        params_vec.push(Box::new(rotation));
    }
    if opacity.is_some() {
        sets.push("opacity = ?");
        params_vec.push(Box::new(opacity));
    }
    if let Some(v) = always_on_top {
        sets.push("always_on_top = ?");
        params_vec.push(Box::new(v as i32));
    }
    if let Some(v) = locked {
        sets.push("locked = ?");
        params_vec.push(Box::new(v as i32));
    }
    if let Some(v) = flip_h {
        sets.push("flip_h = ?");
        params_vec.push(Box::new(v as i32));
    }
    if let Some(v) = flip_v {
        sets.push("flip_v = ?");
        params_vec.push(Box::new(v as i32));
    }

    sets.push("updated_at = ?");
    params_vec.push(Box::new(now));

    params_vec.push(Box::new(id.to_string()));

    let sql = format!("UPDATE pins SET {} WHERE id = ?", sets.join(", "));
    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())?;
    Ok(())
}

/// 标记贴图为已关闭（pinned_open=0）
pub fn close_pin(conn: &Connection, id: &str) -> Result<()> {
    let now = now_timestamp();
    conn.execute(
        "UPDATE pins SET pinned_open = 0, updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}

/// 设置贴图隐藏状态：hidden=1 隐藏，hidden=0 恢复显示
pub fn set_pin_hidden(conn: &Connection, id: &str, hidden: bool) -> Result<()> {
    let now = now_timestamp();
    conn.execute(
        "UPDATE pins SET hidden = ?1, updated_at = ?2 WHERE id = ?3",
        params![hidden as i32, now, id],
    )?;
    Ok(())
}

/// 恢复贴图显示：关闭状态的贴图也需要重新标记为打开，列表面板才能一键恢复窗口
pub fn show_pin(conn: &Connection, id: &str) -> Result<()> {
    let now = now_timestamp();
    conn.execute(
        "UPDATE pins SET pinned_open = 1, hidden = 0, updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}

/// 永久删除贴图记录（仅删 DB 行，文件由调用方负责清理）
pub fn delete_pin(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM pins WHERE id = ?1", params![id])?;
    Ok(())
}

pub fn insert_screenshot_history(
    conn: &Connection,
    region_x: f64,
    region_y: f64,
    region_width: f64,
    region_height: f64,
    scale_factor: f64,
    file_path: Option<&str>,
) -> Result<()> {
    let now = now_timestamp();
    conn.execute(
        r#"INSERT INTO screenshot_history
           (region_x, region_y, region_width, region_height, scale_factor, file_path, created_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"#,
        params![region_x, region_y, region_width, region_height, scale_factor, file_path, now],
    )?;
    Ok(())
}

pub fn get_screenshot_history(conn: &Connection, limit: u32) -> Result<Vec<ScreenshotHistoryEntry>> {
    let mut stmt = conn.prepare(
        r#"SELECT id, region_x, region_y, region_width, region_height, scale_factor, file_path, created_at
           FROM screenshot_history ORDER BY created_at DESC LIMIT ?1"#,
    )?;
    let entries = stmt
        .query_map(params![limit], |row| {
            Ok(ScreenshotHistoryEntry {
                id: row.get(0)?,
                region_x: row.get(1)?,
                region_y: row.get(2)?,
                region_width: row.get(3)?,
                region_height: row.get(4)?,
                scale_factor: row.get(5)?,
                file_path: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(entries)
}

pub fn clear_screenshot_history(conn: &Connection) -> Result<()> {
    conn.execute("DELETE FROM screenshot_history", [])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::migrations::run_migrations;

    fn sample_pin() -> PinRecord {
        PinRecord {
            id: "pin-test".to_string(),
            file_path: "pins/pin-test.png".to_string(),
            thumb_path: None,
            pos_x: None,
            pos_y: None,
            scale: 1.0,
            rotation: 0.0,
            opacity: 1.0,
            always_on_top: true,
            locked: false,
            pinned_open: true,
            hidden: false,
            flip_h: false,
            flip_v: false,
            base_width: None,
            base_height: None,
            created_at: 1,
            updated_at: 1,
        }
    }

    #[test]
    fn show_pin_reopens_closed_pin_as_visible() {
        let conn = Connection::open_in_memory().expect("open in-memory database");
        run_migrations(&conn).expect("run migrations");
        insert_pin(&conn, &sample_pin()).expect("insert pin");
        close_pin(&conn, "pin-test").expect("close pin");

        show_pin(&conn, "pin-test").expect("show pin");

        let pin = get_pin_by_id(&conn, "pin-test").expect("load pin");
        assert!(pin.pinned_open);
        assert!(!pin.hidden);
    }
}
