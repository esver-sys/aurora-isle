use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};

use crate::error::{AppError, Result};
use crate::models::pin::PinRecord;

fn now_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

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
            opacity, always_on_top, locked, pinned_open, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)"#,
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
            pin.created_at,
            pin.updated_at,
        ],
    )?;
    Ok(())
}

pub fn get_pin_by_id(conn: &Connection, id: &str) -> Result<PinRecord> {
    let mut stmt = conn.prepare(
        r#"SELECT id, file_path, thumb_path, pos_x, pos_y, scale, rotation,
                  opacity, always_on_top, locked, pinned_open, created_at, updated_at
           FROM pins WHERE id = ?1"#,
    )?;
    let pin = stmt
        .query_row(params![id], |row| {
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
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })
        .map_err(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => AppError::PinNotFound(id.to_string()),
            other => AppError::Database(other),
        })?;
    Ok(pin)
}

pub fn get_open_pins(conn: &Connection) -> Result<Vec<PinRecord>> {
    let mut stmt = conn.prepare(
        r#"SELECT id, file_path, thumb_path, pos_x, pos_y, scale, rotation,
                  opacity, always_on_top, locked, pinned_open, created_at, updated_at
           FROM pins WHERE pinned_open = 1 ORDER BY created_at"#,
    )?;
    let pins = stmt
        .query_map([], |row| {
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
                created_at: row.get(11)?,
                updated_at: row.get(12)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(pins)
}

pub fn update_pin_transform(
    conn: &Connection,
    id: &str,
    pos_x: Option<f64>,
    pos_y: Option<f64>,
    scale: Option<f64>,
    rotation: Option<f64>,
    opacity: Option<f64>,
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

    sets.push("updated_at = ?");
    params_vec.push(Box::new(now));

    params_vec.push(Box::new(id.to_string()));

    let sql = format!("UPDATE pins SET {} WHERE id = ?", sets.join(", "));
    let param_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, param_refs.as_slice())?;
    Ok(())
}

pub fn close_pin(conn: &Connection, id: &str) -> Result<()> {
    let now = now_timestamp();
    conn.execute(
        "UPDATE pins SET pinned_open = 0, updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    Ok(())
}
