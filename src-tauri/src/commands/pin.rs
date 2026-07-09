use std::path::Path;

use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, WebviewUrl,
    WebviewWindowBuilder,
};

use crate::commands::now_ts;
use crate::db;
use crate::error::{AppError, Result};
use crate::models::pin::{PinRecord, PinRect, PinTransform};
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

/// 判断旋转角度是否为 90° 或 270°（需要交换窗口宽高的角度）
fn is_quarter_turn(rotation: f64) -> bool {
    let normalized = ((rotation % 360.0) + 360.0) % 360.0;
    (normalized - 90.0).abs() < 0.001 || (normalized - 270.0).abs() < 0.001
}

/// 根据基准尺寸、缩放和旋转角度计算实际窗口尺寸
fn compute_pin_window_size_for_transform(
    base_w: f64,
    base_h: f64,
    scale: f64,
    rotation: f64,
) -> (f64, f64) {
    let scaled_w = (base_w * scale).round().max(1.0);
    let scaled_h = (base_h * scale).round().max(1.0);
    if is_quarter_turn(rotation) {
        (scaled_h, scaled_w)
    } else {
        (scaled_w, scaled_h)
    }
}

/// 解析贴图的未旋转基准显示尺寸：优先使用 DB 持久化值，否则从图片尺寸计算
fn resolve_pin_base_size(pin: &PinRecord, image_width: u32, image_height: u32) -> (f64, f64) {
    if let (Some(w), Some(h)) = (pin.base_width, pin.base_height) {
        if w.is_finite() && h.is_finite() && w >= 1.0 && h >= 1.0 {
            return (w.round(), h.round());
        }
    }
    compute_pin_window_size(image_width, image_height)
}

/// 激活已存在的热备窗口显示指定贴图：设置尺寸/位置/置顶，show 后 emit 通知前端加载 pin 数据。
/// 窗口需已预创建（visible:false），此函数只做显示前的配置，不新建窗口，因此极快。
fn activate_pin_window(
    app: &AppHandle,
    app_data_dir: &Path,
    pin: &PinRecord,
    label: &str,
) -> Result<()> {
    let window = app
        .get_webview_window(label)
        .ok_or_else(|| AppError::General(format!("pin window {} not found", label)))?;

    let abs_image_path = app_data_dir.join(&pin.file_path);
    // 仅当 DB 未持久化基准尺寸时才读取图片尺寸，避免每次激活都解码图片头
    let (base_w, base_h) = if pin.base_width.is_some() && pin.base_height.is_some() {
        resolve_pin_base_size(pin, 0, 0)
    } else {
        let (image_width, image_height) = image::image_dimensions(&abs_image_path)?;
        resolve_pin_base_size(pin, image_width, image_height)
    };
    let scale = pin.scale.clamp(0.1, 5.0);
    let (win_w, win_h) = compute_pin_window_size_for_transform(base_w, base_h, scale, pin.rotation);

    // 先配置尺寸和位置再 show，避免窗口闪现旧尺寸
    window.set_size(LogicalSize::new(win_w, win_h))?;
    if let (Some(x), Some(y)) = (pin.pos_x, pin.pos_y) {
        window.set_position(LogicalPosition::new(x, y))?;
    }
    window.set_always_on_top(pin.always_on_top)?;
    window.show()?;
    window.set_focus()?;

    // 通知前端加载该 pin 的数据并渲染
    app.emit_to(label, "pin:activate", &pin.id)?;
    Ok(())
}

/// 同步构建一个隐藏的贴图窗口（visible:false），用作热备或兜底创建。
fn build_pin_window_sync(app: &AppHandle, label: &str) -> Result<()> {
    WebviewWindowBuilder::new(app, label, WebviewUrl::App("index.html".into()))
        .title("Pin")
        .transparent(true)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .visible(false)
        .inner_size(160.0, 160.0)
        .build()?;
    Ok(())
}

/// 确保指定 label 的热备窗口存在；若并发路径已创建该窗口则直接复用。
fn build_staging_window(app: &AppHandle, label: &str) {
    if app.get_webview_window(label).is_some() {
        return;
    }
    if let Err(e) = build_pin_window_sync(app, label) {
        tracing::warn!("Failed to build staging window {}: {}", label, e);
        return;
    }
}

/// 取当前热备窗口 label，激活显示指定贴图，并同步补充下一个热备窗口。
/// 统一入口，供 pin_image / show_pin / restore 复用。
fn activate_and_replenish(app: &AppHandle, state: &AppState, pin: &PinRecord) -> Result<String> {
    if let Some(label) = state.pin_pool.label_for_pin(&pin.id) {
        if app.get_webview_window(&label).is_some() {
            activate_pin_window(app, &state.app_data_dir, pin, &label)?;
            return Ok(label);
        }
        // 映射存在但窗口已不存在（例如窗口被系统关闭），清理后重新分配热备窗口。
        state.pin_pool.remove_pin_label(&pin.id);
    }

    let label = state.pin_pool.reserve_staging_label();
    // 兜底：若热备窗口意外不存在（如被手动关闭），同步重建当前 label
    if app.get_webview_window(&label).is_none() {
        build_pin_window_sync(app, &label)?;
    }
    state.pin_pool.assign_pin_label(&pin.id, &label);

    // 先激活显示贴图（用户立即看到结果），再同步补充下一个热备
    if let Err(e) = activate_pin_window(app, &state.app_data_dir, pin, &label) {
        state.pin_pool.remove_pin_label(&pin.id);
        return Err(e);
    }
    let next_label = state.pin_pool.current_staging_label();
    build_staging_window(app, &next_label);
    Ok(label)
}

/// 后台线程生成缩略图并回填 DB，避免阻塞贴图窗口创建
fn spawn_thumbnail(app: &AppHandle, app_data_dir: &Path, id: &str, abs_image_path: &Path) {
    let app = app.clone();
    let app_data_dir = app_data_dir.to_path_buf();
    let id = id.to_string();
    let abs_image_path = abs_image_path.to_path_buf();

    std::thread::spawn(move || {
        match services::thumbnail::generate_thumbnail(
            &abs_image_path,
            &app_data_dir.join("thumbs"),
            &id,
            256,
        ) {
            Ok(thumb_rel) => {
                if let Some(state) = app.try_state::<AppState>() {
                    if let Ok(conn) = state.db() {
                        match db::repository::update_pin_thumb_path(&conn, &id, &thumb_rel) {
                            Ok(true) => {}
                            Ok(false) => {
                                // 贴图可能在缩略图后台生成期间已被删除；此时 DB 无记录可回填，
                                // 需要删除刚生成的文件，避免 thumbs 目录留下孤儿文件。
                                let _ = std::fs::remove_file(app_data_dir.join(&thumb_rel));
                            }
                            Err(e) => {
                                tracing::warn!("Failed to update pin thumb_path {}: {}", id, e);
                            }
                        }
                    }
                }
            }
            Err(e) => tracing::warn!("Failed to generate thumbnail for pin {}: {}", id, e),
        }
    });
}

#[tauri::command]
pub async fn pin_image(
    app: AppHandle,
    state: State<'_, AppState>,
    temp_path: String,
    pin_rect: Option<PinRect>,
) -> Result<String> {
    let id = uuid::Uuid::new_v4().to_string();

    let file_rel = services::storage::save_pin_image(&state.app_data_dir, &temp_path, &id)?;

    let abs_image_path = state.app_data_dir.join(&file_rel);

    // 解析截图贴图的位置和基准尺寸：有 pin_rect 时使用选区坐标和尺寸，否则为 None 走默认逻辑
    let (pos_x, pos_y, base_width, base_height) = if let Some(ref rect) = pin_rect {
        if !rect.x.is_finite()
            || !rect.y.is_finite()
            || !rect.width.is_finite()
            || !rect.height.is_finite()
        {
            return Err(crate::error::AppError::General(
                "pin_rect contains non-finite values".into(),
            ));
        }
        if rect.width < 1.0 || rect.height < 1.0 {
            return Err(crate::error::AppError::General(
                "pin_rect width/height must be >= 1.0".into(),
            ));
        }
        (
            Some(rect.x),
            Some(rect.y),
            Some(rect.width),
            Some(rect.height),
        )
    } else {
        (None, None, None, None)
    };

    let now = now_ts();
    let pin = PinRecord {
        id: id.clone(),
        file_path: file_rel,
        thumb_path: None,
        pos_x,
        pos_y,
        scale: 1.0,
        rotation: 0.0,
        opacity: 1.0,
        always_on_top: true,
        locked: false,
        pinned_open: true,
        hidden: false,
        flip_h: false,
        flip_v: false,
        base_width,
        base_height,
        created_at: now,
        updated_at: now,
    };

    {
        let conn = state.db()?;
        db::repository::insert_pin(&conn, &pin)?;
    }

    // 激活热备窗口显示该贴图，并同步补充下一个热备窗口
    activate_and_replenish(&app, &state, &pin)?;

    // 缩略图仅供贴图管理面板使用，不阻塞贴图窗口显示；放后台线程生成后回填 DB
    spawn_thumbnail(&app, &state.app_data_dir, &id, &abs_image_path);

    Ok(id)
}

#[tauri::command]
pub async fn unpin_image(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<()> {
    {
        let conn = state.db()?;
        db::repository::close_pin(&conn, &id)?;
    }

    // 通过池映射定位窗口 label 并关闭
    let label = state.pin_pool.remove_pin_label(&id);
    if let Some(label) = label {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
        }
    }

    Ok(())
}

/// 隐藏贴图：标记 hidden=1 并关闭窗口，不删除数据，可从贴图列表面板恢复
#[tauri::command]
pub async fn hide_pin(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<()> {
    {
        let conn = state.db()?;
        db::repository::set_pin_hidden(&conn, &id, true)?;
    }

    // 通过池映射定位窗口 label 并关闭（释放资源；show_pin 时重新分配窗口）
    let label = state.pin_pool.remove_pin_label(&id);
    if let Some(label) = label {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
        }
    }

    Ok(())
}

/// 显示已隐藏的贴图：标记 hidden=0 并重新分配窗口激活，恢复保存的位置和变换
#[tauri::command]
pub async fn show_pin(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<()> {
    let pin = {
        let conn = state.db()?;
        db::repository::show_pin(&conn, &id)?;
        db::repository::get_pin_by_id(&conn, &id)?
    };

    // 冷路径：分配新窗口并激活
    activate_and_replenish(&app, &state, &pin)?;
    Ok(())
}

/// 永久删除贴图：关闭窗口 + 删除图片/缩略图文件 + 删除 DB 记录
#[tauri::command]
pub async fn delete_pin(app: AppHandle, state: State<'_, AppState>, id: String) -> Result<()> {
    // 先通过池映射定位并关闭窗口
    let label = state.pin_pool.remove_pin_label(&id);
    if let Some(label) = label {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.close();
        }
    }

    // 获取贴图记录以清理文件，然后删除 DB 行
    let pin = {
        let conn = state.db()?;
        let pin = db::repository::get_pin_by_id(&conn, &id)?;
        db::repository::delete_pin(&conn, &id)?;
        pin
    };

    // 删除图片文件
    let image_path = state.app_data_dir.join(&pin.file_path);
    let _ = std::fs::remove_file(&image_path);

    // 删除缩略图文件（若存在）
    if let Some(thumb) = &pin.thumb_path {
        let thumb_path = state.app_data_dir.join(thumb);
        let _ = std::fs::remove_file(&thumb_path);
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
        transform.always_on_top,
        transform.locked,
        transform.flip_h,
        transform.flip_v,
    )?;
    Ok(())
}

#[tauri::command]
pub async fn get_open_pins(state: State<'_, AppState>) -> Result<Vec<PinRecord>> {
    let conn = state.db()?;
    db::repository::get_open_pins(&conn)
}

/// 获取所有贴图记录（含已关闭），用于贴图管理面板
#[tauri::command]
pub async fn get_all_pins(state: State<'_, AppState>) -> Result<Vec<PinRecord>> {
    let conn = state.db()?;
    db::repository::get_all_pins(&conn)
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

/// 应用启动时恢复可见贴图窗口：pinned_open=1 且 hidden=0 的记录。
/// 冷路径：为每个贴图分配窗口并激活。
pub fn restore_pins_on_startup(app: &AppHandle, state: &AppState) -> Result<()> {
    let pins = {
        let conn = state.db()?;
        db::repository::get_restorable_pins(&conn)?
    };

    for pin in &pins {
        if let Err(e) = activate_and_replenish(app, state, pin) {
            tracing::warn!("Failed to restore pin {}: {}", pin.id, e);
        }
    }

    tracing::info!("Restored {} pin(s) on startup", pins.len());
    Ok(())
}

pub fn resolve_pin_path(state: &AppState, file_rel: &str) -> std::path::PathBuf {
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

    #[test]
    fn is_quarter_turn_correctly_identifies_swap_angles() {
        assert!(!is_quarter_turn(0.0));
        assert!(is_quarter_turn(90.0));
        assert!(!is_quarter_turn(180.0));
        assert!(is_quarter_turn(270.0));
        assert!(!is_quarter_turn(360.0));
        assert!(is_quarter_turn(450.0));
        assert!(is_quarter_turn(-90.0));
    }

    #[test]
    fn compute_pin_window_size_for_transform_swaps_on_quarter_turn() {
        let (w, h) = compute_pin_window_size_for_transform(400.0, 200.0, 1.0, 0.0);
        assert_eq!((w, h), (400.0, 200.0));

        let (w, h) = compute_pin_window_size_for_transform(400.0, 200.0, 1.0, 90.0);
        assert_eq!((w, h), (200.0, 400.0));

        let (w, h) = compute_pin_window_size_for_transform(400.0, 200.0, 2.0, 90.0);
        assert_eq!((w, h), (400.0, 800.0));
    }

    #[test]
    fn resolve_pin_base_size_prefers_db_fields_over_computed() {
        let mut pin = PinRecord {
            id: "test".to_string(),
            file_path: "test.png".to_string(),
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
            base_width: Some(300.0),
            base_height: Some(150.0),
            created_at: 0,
            updated_at: 0,
        };

        let (w, h) = resolve_pin_base_size(&pin, 1200, 600);
        assert_eq!((w, h), (300.0, 150.0));

        pin.base_width = None;
        pin.base_height = None;
        let (w, h) = resolve_pin_base_size(&pin, 1200, 600);
        assert_eq!((w, h), (480.0, 240.0));
    }
}
