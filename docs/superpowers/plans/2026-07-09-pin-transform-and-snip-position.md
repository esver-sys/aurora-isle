# 贴图变换裁切修复与截图贴图位置匹配 - 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复贴图旋转 90° 时的裁切问题（窗口尺寸跟随旋转交换），并使截图贴图出现在选区位置且尺寸匹配。

**Architecture:** 新增持久化字段 `base_width/base_height` 记录贴图显示基准尺寸；Rust 端新增旋转感知的窗口尺寸计算函数；前端 `PinWindow.tsx` 重构变换逻辑，旋转/缩放时同步调整窗口尺寸；截图流程传入选区坐标和尺寸。

**Tech Stack:** Rust + Tauri v2 + React 18 + TypeScript + SQLite (rusqlite)

**Spec:** `docs/superpowers/specs/2026-07-09-pin-transform-and-snip-position-design.md`

---

## 文件结构

| 文件 | 职责 | 操作 |
|------|------|------|
| `src-tauri/src/db/migrations.rs` | SCHEMA_V3 迁移 | 修改 |
| `src-tauri/src/models/pin.rs` | `PinRecord` 新增 base 字段 + `PinRect` 结构体 | 修改 |
| `src-tauri/src/db/repository.rs` | CRUD 适配新字段 + 测试 | 修改 |
| `src-tauri/src/commands/pin.rs` | 辅助函数 + `pin_image`/`create_pin_window` 改造 | 修改 |
| `src/types/index.ts` | `PinRect` 接口 + `PinRecord` 新字段 | 修改 |
| `src/api/pin.ts` | `pinImage` 增加 `pinRect` 参数 | 修改 |
| `src/components/pin/PinWindow.module.css` | visualLayer/pinImage 样式调整 | 修改 |
| `src/components/pin/PinWindow.tsx` | 旋转/缩放/初始化/render 全部改造 | 修改 |
| `src/components/snip/SnipWindow.tsx` | `handleAction` 计算 `pinRect` | 修改 |
| `src/hooks/useScreenshot.ts` | 传递 `pinRect` 给 `pinImage` | 修改 |

---

### Task 1: DB 迁移 V3 + PinRecord 模型 + repository 适配

**Files:**
- Modify: `src-tauri/src/db/migrations.rs`
- Modify: `src-tauri/src/models/pin.rs`
- Modify: `src-tauri/src/db/repository.rs`

- [ ] **Step 1: 添加 SCHEMA_V3 迁移**

在 `src-tauri/src/db/migrations.rs` 中，在 `SCHEMA_V2` 常量之后添加 V3 常量：

```rust
/// V3 迁移：为 pins 表新增 base_width/base_height，持久化贴图显示基准尺寸
const SCHEMA_V3: &str = r#"
    ALTER TABLE pins ADD COLUMN base_width REAL;
    ALTER TABLE pins ADD COLUMN base_height REAL;
"#;
```

- [ ] **Step 2: 在 run_migrations 中添加 V3 逻辑**

将 `run_migrations` 函数替换为：

```rust
pub fn run_migrations(conn: &Connection) -> Result<()> {
    // V1: 基础表结构（幂等，IF NOT EXISTS 保证可重复执行）
    conn.execute_batch(SCHEMA_V1)?;

    // V2: 新增贴图字段，仅在版本 < 2 时执行，避免 ALTER TABLE 重复加列报错
    let current = get_db_version(conn);
    if current < 2 {
        conn.execute_batch(SCHEMA_V2)?;
        conn.execute("INSERT OR IGNORE INTO schema_version (version) VALUES (2)", [])?;
        tracing::info!("Database migrations applied (v1 -> v2)");
    }

    // V3: 新增 base_width/base_height，仅在版本 < 3 时执行
    let current = get_db_version(conn);
    if current < 3 {
        conn.execute_batch(SCHEMA_V3)?;
        conn.execute("INSERT OR IGNORE INTO schema_version (version) VALUES (3)", [])?;
        tracing::info!("Database migrations applied (v{} -> v3)", current);
    } else {
        tracing::info!("Database already at v{}", current);
    }

    Ok(())
}
```

- [ ] **Step 3: PinRecord 新增 base_width/base_height 字段**

在 `src-tauri/src/models/pin.rs` 中，在 `PinRecord` 结构体的 `flip_v` 字段之后、`created_at` 之前添加两个字段：

```rust
    pub flip_v: bool,
    pub base_width: Option<f64>,
    pub base_height: Option<f64>,
    pub created_at: i64,
    pub updated_at: i64,
```

- [ ] **Step 4: 新增 PinRect 结构体**

在 `src-tauri/src/models/pin.rs` 文件末尾（`PinImagePayload` 之后）添加：

```rust
/// 截图选区的屏幕位置和尺寸（逻辑像素），用于创建位置匹配的贴图
#[derive(Debug, Clone, Deserialize)]
pub struct PinRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
```

- [ ] **Step 5: 更新 repository.rs 的 PIN_COLUMNS**

在 `src-tauri/src/db/repository.rs` 中，将 `PIN_COLUMNS` 常量替换为（在 `flip_v` 之后插入 `base_width, base_height`）：

```rust
const PIN_COLUMNS: &str =
    "id, file_path, thumb_path, pos_x, pos_y, scale, rotation, \
     opacity, always_on_top, locked, pinned_open, hidden, flip_h, flip_v, \
     base_width, base_height, created_at, updated_at";
```

- [ ] **Step 6: 更新 row_to_pin 函数**

将 `row_to_pin` 替换为（索引顺移：原 14/15 变为 16/17，新字段在 14/15）：

```rust
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
```

- [ ] **Step 7: 更新 insert_pin 函数**

将 `insert_pin` 替换为（SQL 和 params 均增加 base_width/base_height）：

```rust
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
```

- [ ] **Step 8: 更新测试中的 sample_pin**

在 `src-tauri/src/db/repository.rs` 的 `#[cfg(test)]` 模块中，将 `sample_pin` 替换为：

```rust
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
```

- [ ] **Step 9: 编译并运行 Rust 测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 所有现有测试通过（`show_pin_reopens_closed_pin_as_visible` 等），编译无错误。

- [ ] **Step 10: Commit**

```bash
git add src-tauri/src/db/migrations.rs src-tauri/src/models/pin.rs src-tauri/src/db/repository.rs
git commit -m "feat: add base_width/base_height DB fields and PinRect struct"
```

---

### Task 2: Rust 辅助函数 - 旋转感知尺寸计算

**Files:**
- Modify: `src-tauri/src/commands/pin.rs`

- [ ] **Step 1: 添加辅助函数**

在 `src-tauri/src/commands/pin.rs` 中，在 `compute_pin_window_size` 函数之后（`create_pin_window` 之前）添加以下三个函数：

```rust
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
```

- [ ] **Step 2: 更新 import**

在 `src-tauri/src/commands/pin.rs` 顶部，将 models 导入行改为：

```rust
use crate::models::pin::{PinRecord, PinRect, PinTransform};
```

- [ ] **Step 3: 添加单元测试**

在 `src-tauri/src/commands/pin.rs` 的 `#[cfg(test)]` 模块中添加以下测试：

```rust
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
```

- [ ] **Step 4: 运行测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml -- is_quarter_turn compute_pin_window_size_for_transform resolve_pin_base_size`
Expected: 3 个新测试全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/pin.rs
git commit -m "feat: add rotation-aware pin window size computation helpers"
```

---

### Task 3: Rust pin_image + create_pin_window 改造

**Files:**
- Modify: `src-tauri/src/commands/pin.rs`

- [ ] **Step 1: 改造 create_pin_window 使用新辅助函数**

将 `create_pin_window` 函数替换为：

```rust
/// 创建贴图窗口的通用辅助函数，供 pin_image / show_pin / restore_pins_on_startup 复用。
/// 读取图片尺寸，通过 resolve_pin_base_size 解析基准尺寸，并根据旋转角度计算窗口大小。
fn create_pin_window(app: &AppHandle, app_data_dir: &Path, pin: &PinRecord) -> Result<()> {
    let label = format!("pin-{}", pin.id);
    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    let abs_image_path = app_data_dir.join(&pin.file_path);
    let (image_width, image_height) = image::image_dimensions(&abs_image_path)?;
    let (base_w, base_h) = resolve_pin_base_size(pin, image_width, image_height);
    let scale = pin.scale.clamp(0.1, 5.0);
    let (win_w, win_h) = compute_pin_window_size_for_transform(base_w, base_h, scale, pin.rotation);

    let builder = WebviewWindowBuilder::new(app, &label, WebviewUrl::App("index.html".into()))
        .title("Pin")
        .transparent(true)
        .decorations(false)
        .always_on_top(pin.always_on_top)
        .skip_taskbar(true)
        .resizable(true)
        .inner_size(win_w, win_h);

    let builder = if let (Some(x), Some(y)) = (pin.pos_x, pin.pos_y) {
        builder.position(x, y)
    } else {
        builder
    };

    builder.build()?;
    Ok(())
}
```

- [ ] **Step 2: 改造 pin_image 接受 pin_rect 参数**

将 `pin_image` 函数替换为：

```rust
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
    let thumb_rel = services::thumbnail::generate_thumbnail(
        &abs_image_path,
        &state.app_data_dir.join("thumbs"),
        &id,
        256,
    )
    .ok();

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
        thumb_path: thumb_rel,
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

    create_pin_window(&app, &state.app_data_dir, &pin)?;

    Ok(id)
}
```

- [ ] **Step 3: 编译验证**

Run: `cargo build --manifest-path src-tauri/Cargo.toml`
Expected: 编译成功，无错误。

- [ ] **Step 4: 运行全部 Rust 测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 所有测试通过。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/pin.rs
git commit -m "feat: pin_image accepts pin_rect; create_pin_window rotation-aware"
```

---

### Task 4: 前端类型 + API 层

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/api/pin.ts`

- [ ] **Step 1: types/index.ts 新增 PinRect 和 PinRecord 字段**

在 `src/types/index.ts` 中，将 `PinRecord` 接口替换为（在 `flip_v` 之后添加 `base_width/base_height`）：

```typescript
export interface PinRecord {
  id: string;
  file_path: string;
  thumb_path: string | null;
  pos_x: number | null;
  pos_y: number | null;
  scale: number;
  rotation: number;
  opacity: number;
  always_on_top: boolean;
  locked: boolean;
  pinned_open: boolean;
  hidden: boolean;
  flip_h: boolean;
  flip_v: boolean;
  base_width: number | null;
  base_height: number | null;
  created_at: number;
  updated_at: number;
}
```

在文件末尾添加 `PinRect` 接口：

```typescript
export interface PinRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
```

- [ ] **Step 2: api/pin.ts 更新 pinImage 签名**

将 `src/api/pin.ts` 的 import 行和 `pinImage` 函数替换为：

```typescript
import type { PinRecord, PinTransform, PinRect } from "../types";

export async function pinImage(tempPath: string, pinRect?: PinRect): Promise<string> {
  return await invoke("pin_image", { tempPath, pinRect });
}
```

- [ ] **Step 3: 类型检查**

Run: `pnpm typecheck`
Expected: 无类型错误。

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/api/pin.ts
git commit -m "feat: add PinRect type and base_width/base_height to PinRecord"
```

---

### Task 5: PinWindow.module.css 样式调整

**Files:**
- Modify: `src/components/pin/PinWindow.module.css`

- [ ] **Step 1: 修改 visualLayer 和 pinImage 样式**

将 `src/components/pin/PinWindow.module.css` 替换为：

```css
.container {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  cursor: move;
  overflow: hidden;
}

.visualLayer {
  /* 宽高由内联样式显式设置，不取 100%，确保旋转后视觉层尺寸不随窗口交换 */
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  transform-origin: center;
  transition: transform 0.1s ease, opacity 0.15s ease;
}

.pinImage {
  width: 100%;
  height: 100%;
  user-select: none;
  -webkit-user-drag: none;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/pin/PinWindow.module.css
git commit -m "refactor: visualLayer uses inline dimensions; pinImage fills visualLayer"
```

---

### Task 6: PinWindow.tsx - 辅助函数 + baseDimsRef + resizeWindowForScale + applyScale

**Files:**
- Modify: `src/components/pin/PinWindow.tsx`

> 此 Task 完成后文件可独立通过 typecheck。ref 重命名和其所有消费者在同一步骤内完成。

- [ ] **Step 1: 在文件顶部（组件外部）添加辅助函数**

在 `src/components/pin/PinWindow.tsx` 中，在 `OPACITY_PRESETS` 常量之后、`export function PinWindow` 之前添加：

```typescript
/** 将旋转角度归一化到 [0, 360) */
function normalizeRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

/** 判断旋转角度是否为 90° 或 270°（需要交换宽高的角度） */
function isQuarterTurn(rotation: number): boolean {
  const n = normalizeRotation(rotation);
  return Math.abs(n - 90) < 0.001 || Math.abs(n - 270) < 0.001;
}

/** 根据旋转角度和缩放计算窗口尺寸（逻辑像素） */
function computeWindowSize(
  rotation: number,
  scale: number,
  baseW: number,
  baseH: number
): { width: number; height: number } {
  const w = Math.max(1, Math.round(baseW * scale));
  const h = Math.max(1, Math.round(baseH * scale));
  return isQuarterTurn(rotation) ? { width: h, height: w } : { width: w, height: h };
}
```

- [ ] **Step 2: 将 baseWindowSizeRef 替换为 baseDimsRef**

在组件内，将 `baseWindowSizeRef` 的声明替换为：

```typescript
  // 缓存未旋转、未缩放的基准显示尺寸 { baseW, baseH }（逻辑像素），旋转/缩放都基于此计算
  const baseDimsRef = useRef<{ baseW: number; baseH: number } | null>(null);
```

- [ ] **Step 3: 更新初始化逻辑使用 DB base 字段或反推**

在 `useEffect` 的异步初始化块中，将设置 `baseWindowSizeRef.current` 的部分替换为：

```typescript
        // 应用置顶状态到窗口
        await win.setAlwaysOnTop(record.always_on_top);
        const safeScale = Math.max(record.scale, SCALE_MIN);
        scaleRef.current = safeScale;

        // 优先使用 DB 持久化的基准尺寸；无值时从当前窗口尺寸反推（已旋转时需反交换）
        const dbBaseW = record.base_width;
        const dbBaseH = record.base_height;
        if (
          dbBaseW != null &&
          dbBaseH != null &&
          Number.isFinite(dbBaseW) &&
          Number.isFinite(dbBaseH) &&
          dbBaseW >= 1 &&
          dbBaseH >= 1
        ) {
          baseDimsRef.current = { baseW: dbBaseW, baseH: dbBaseH };
        } else {
          const currentW = window.innerWidth / safeScale;
          const currentH = window.innerHeight / safeScale;
          baseDimsRef.current = isQuarterTurn(record.rotation)
            ? { baseW: currentH, baseH: currentW }
            : { baseW: currentW, baseH: currentH };
        }
```

- [ ] **Step 4: 重写 resizeWindowForScale 支持 rotation**

将 `resizeWindowForScale` 函数替换为（增加 `rotation` 参数，使用 `baseDimsRef` 和 `computeWindowSize`）：

```typescript
  const resizeWindowForScale = useCallback(
    async (scale: number, anchor: { x: number; y: number } | undefined, rotation: number) => {
      const baseDims = baseDimsRef.current;
      if (!baseDims) return;

      const win = getCurrentWindow();
      const oldWidth = window.innerWidth;
      const oldHeight = window.innerHeight;
      const size = computeWindowSize(rotation, scale, baseDims.baseW, baseDims.baseH);
      const nextWidth = size.width;
      const nextHeight = size.height;
      const pos = anchor && oldWidth > 0 && oldHeight > 0 ? await win.outerPosition() : null;

      await win.setSize(new LogicalSize(nextWidth, nextHeight));

      if (!anchor || !pos || oldWidth <= 0 || oldHeight <= 0) return;

      // 滚轮缩放时根据光标在窗口内的比例反推左上角偏移，尽量保持光标下的图片位置不跳动
      const ratioX = anchor.x / oldWidth;
      const ratioY = anchor.y / oldHeight;
      const dpr = window.devicePixelRatio || 1;
      const deltaX = Math.round((nextWidth - oldWidth) * ratioX * dpr);
      const deltaY = Math.round((nextHeight - oldHeight) * ratioY * dpr);
      await win.setPosition(new PhysicalPosition(pos.x - deltaX, pos.y - deltaY));
    },
    []
  );
```

- [ ] **Step 5: 重写 applyScale 传入 rotation**

将 `applyScale` 函数替换为：

```typescript
  const applyScale = useCallback(
    async (nextScale: number, anchor?: { x: number; y: number }) => {
      if (!pin) return;
      const previousScale = scaleRef.current;
      scaleRef.current = nextScale;
      await resizeWindowForScale(nextScale, anchor, pin.rotation);
      const ok = await updateTransform({ scale: nextScale }, { scale: nextScale });
      if (!ok) {
        scaleRef.current = previousScale;
        await resizeWindowForScale(previousScale, undefined, pin.rotation);
      }
    },
    [pin, resizeWindowForScale, updateTransform]
  );
```

- [ ] **Step 6: 类型检查**

Run: `pnpm typecheck`
Expected: 无类型错误。

- [ ] **Step 7: Commit**

```bash
git add src/components/pin/PinWindow.tsx
git commit -m "feat: add rotation helpers, baseDimsRef, rotation-aware scale"
```

---

### Task 7: PinWindow.tsx - applyRotation + handleRotate90 + 快捷键 + render

**Files:**
- Modify: `src/components/pin/PinWindow.tsx`

- [ ] **Step 1: 新增 applyRotation 函数**

在 `applyScale` 之后添加 `applyRotation` 函数：

```typescript
  // 统一的旋转处理：新旧旋转的「是否交换」状态不同时，交换窗口尺寸并保持中心不动
  const applyRotation = useCallback(
    async (nextRotation: number) => {
      if (!pin) return;
      const prevRotation = pin.rotation;

      // 仅在交换状态切换时调整窗口尺寸和位置
      if (isQuarterTurn(prevRotation) !== isQuarterTurn(nextRotation)) {
        const baseDims = baseDimsRef.current;
        if (baseDims) {
          const oldSize = computeWindowSize(prevRotation, scaleRef.current, baseDims.baseW, baseDims.baseH);
          const nextSize = computeWindowSize(nextRotation, scaleRef.current, baseDims.baseW, baseDims.baseH);
          const win = getCurrentWindow();
          const pos = await win.outerPosition();
          const dpr = window.devicePixelRatio || 1;
          // 物理 delta = 逻辑 delta × DPR，保持窗口中心不动
          const deltaX = Math.round(((oldSize.width - nextSize.width) / 2) * dpr);
          const deltaY = Math.round(((oldSize.height - nextSize.height) / 2) * dpr);
          await win.setSize(new LogicalSize(nextSize.width, nextSize.height));
          await win.setPosition(new PhysicalPosition(pos.x + deltaX, pos.y + deltaY));
        }
      }

      await updateTransform({ rotation: nextRotation }, { rotation: nextRotation });
    },
    [pin, updateTransform]
  );
```

- [ ] **Step 2: 修改 handleRotate90 使用 applyRotation**

将 `handleRotate90` 替换为：

```typescript
  const handleRotate90 = useCallback(() => {
    if (!pin) return;
    const newRotation = (pin.rotation + 90) % 360;
    applyRotation(newRotation);
  }, [pin, applyRotation]);
```

- [ ] **Step 3: 修改键盘快捷键 [ 和 ] 使用 applyRotation**

在 `handleKeyDown` 的 switch 中，将 `case "["` 和 `case "]"` 分支替换为：

```typescript
        case "[": {
          e.preventDefault();
          const newRotation = (pin.rotation - 90 + 360) % 360;
          applyRotation(newRotation);
          break;
        }
        case "]": {
          e.preventDefault();
          const newRotation = (pin.rotation + 90) % 360;
          applyRotation(newRotation);
          break;
        }
```

- [ ] **Step 4: 更新 useEffect 依赖数组**

将键盘快捷键 `useEffect` 的依赖数组中的 `applyScale` 之后添加 `applyRotation`：

```typescript
  }, [pin, updateTransform, applyScale, applyRotation, handleCopy, handleHide]);
```

- [ ] **Step 5: 修改 render 中的 visualLayer 和提前返回条件**

将组件 return 之前的部分（从 `if (!pin || !imageUrl) return null;` 到 return 结束）替换为：

```typescript
  const baseDims = baseDimsRef.current;
  if (!pin || !imageUrl || !baseDims) return null;

  // CSS 视觉层负责翻转和旋转；visualLayer 尺寸始终为未旋转的基准×缩放，窗口尺寸负责交换
  const transform = `scale(${pin.flip_h ? -1 : 1}, ${pin.flip_v ? -1 : 1}) rotate(${pin.rotation}deg)`;
  const visualWidth = baseDims.baseW * pin.scale;
  const visualHeight = baseDims.baseH * pin.scale;

  return (
    <div
      className={styles.container}
      onPointerDown={handlePointerDown}
      onContextMenu={handleContextMenu}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
    >
      <div
        className={styles.visualLayer}
        style={{ transform, opacity: pin.opacity, width: visualWidth, height: visualHeight }}
      >
        <img src={imageUrl} className={styles.pinImage} draggable={false} />
      </div>
    </div>
  );
```

- [ ] **Step 6: 类型检查**

Run: `pnpm typecheck`
Expected: 无类型错误。

- [ ] **Step 7: Commit**

```bash
git add src/components/pin/PinWindow.tsx
git commit -m "feat: rotation swaps window dimensions, preserves center, explicit visualLayer size"
```

---

### Task 8: SnipWindow.tsx - 计算 pinRect 并统一 payload

**Files:**
- Modify: `src/components/snip/SnipWindow.tsx`

- [ ] **Step 1: 修改 handleAction 计算 pinRect 并统一 emit**

在 `src/components/snip/SnipWindow.tsx` 中，将 `handleAction` 函数替换为：

```typescript
  const handleAction = async (action: SnipAction) => {
    const { start: s, end: e, capture: cap } = dragRef.current;
    if (!s || !e || !cap || dragRef.current.mode === "processing") return;

    const rect = getSelectionRect(s, e);
    const sf = cap.scaleFactor;
    const region: CropRegion = {
      x: Math.round(rect.left * sf),
      y: Math.round(rect.top * sf),
      width: Math.round(rect.width * sf),
      height: Math.round(rect.height * sf),
    };

    try {
      setMode("processing");
      const msgMap: Record<SnipAction, string> = {
        pin: "正在贴到桌面...",
        copy: "正在复制到剪贴板...",
        save: "正在保存...",
        quick_save: "正在快速保存...",
      };
      setMessage(msgMap[action]);
      const croppedPath = await cropImage(cap.tempPath, region);

      const historyInfo = {
        regionX: rect.left,
        regionY: rect.top,
        regionWidth: rect.width,
        regionHeight: rect.height,
        scaleFactor: sf,
      };

      // 仅在贴图操作时传入选区屏幕坐标和尺寸，使贴图窗口出现在选区位置
      const pinRect =
        action === "pin"
          ? {
              x: (cap.monitorX ?? 0) + rect.left,
              y: (cap.monitorY ?? 0) + rect.top,
              width: rect.width,
              height: rect.height,
            }
          : undefined;

      const completePayload = { action, croppedPath, historyInfo, pinRect };

      if (annotationRef.current?.hasAnnotations()) {
        const annotatedPath = await annotationRef.current.exportImage();
        if (annotatedPath) {
          await emit("snip:complete", { ...completePayload, croppedPath: annotatedPath });
          return;
        }
      }

      await emit("snip:complete", completePayload);
    } catch (err) {
      console.error("Crop failed:", err);
      await emit("snip:complete", { action, croppedPath: null, historyInfo: null, pinRect: undefined });
    }
  };
```

- [ ] **Step 2: 类型检查**

Run: `pnpm typecheck`
Expected: 无类型错误。

- [ ] **Step 3: Commit**

```bash
git add src/components/snip/SnipWindow.tsx
git commit -m "feat: SnipWindow computes pinRect and unifies complete payload"
```

---

### Task 9: useScreenshot.ts - 传递 pinRect

**Files:**
- Modify: `src/hooks/useScreenshot.ts`

- [ ] **Step 1: 更新 import 添加 PinRect 类型**

将 `src/hooks/useScreenshot.ts` 的 import 区域中 pin 相关行改为：

```typescript
import { pinImage } from "../api/pin";
import type { PinRect } from "../types";
```

- [ ] **Step 2: 更新 snip:complete 监听器类型和逻辑**

将 `snip:complete` 的 `listen` 调用替换为（在事件类型中新增 `pinRect?: PinRect`，并在 pin 分支传入）：

```typescript
        listen<{
          action: "pin" | "copy" | "save" | "quick_save";
          croppedPath: string | null;
          historyInfo: HistoryInfo | null;
          pinRect?: PinRect;
        }>("snip:complete", async (event) => {
          cleanup();
          cleanupRef.current = null;
          await snipWin.hide();
          if (event.payload.croppedPath) {
            try {
              const { action, croppedPath, historyInfo, pinRect } = event.payload;
              if (action === "pin") {
                await pinImage(croppedPath, pinRect);
              } else if (action === "copy") {
                await copyImageToClipboard(croppedPath);
              } else if (action === "save") {
                const destPath = await save({
                  defaultPath: `screenshot_${Date.now()}.png`,
                  filters: [
                    { name: "PNG", extensions: ["png"] },
                    { name: "JPEG", extensions: ["jpg", "jpeg"] },
                    { name: "WebP", extensions: ["webp"] },
                    { name: "BMP", extensions: ["bmp"] },
                  ],
                });
                if (destPath) {
                  await saveImageToPath(croppedPath, destPath);
                }
              } else if (action === "quick_save") {
                await quickSaveImage(croppedPath);
              }

              if (historyInfo) {
                await addScreenshotHistory(
                  historyInfo.regionX,
                  historyInfo.regionY,
                  historyInfo.regionWidth,
                  historyInfo.regionHeight,
                  historyInfo.scaleFactor,
                  croppedPath
                );
              }
            } catch (e) {
              console.error("Screenshot action failed:", e);
            }
          }
        }),
```

- [ ] **Step 3: 类型检查**

Run: `pnpm typecheck`
Expected: 无类型错误。

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useScreenshot.ts
git commit -m "feat: useScreenshot passes pinRect to pinImage"
```

---

### Task 10: 全量验证

- [ ] **Step 1: Rust 全量测试**

Run: `cargo test --manifest-path src-tauri/Cargo.toml`
Expected: 所有测试通过，包括新增的 3 个辅助函数测试和原有的 repository/pin 测试。

- [ ] **Step 2: TypeScript 类型检查**

Run: `pnpm typecheck`
Expected: 无类型错误。

- [ ] **Step 3: 前端构建**

Run: `pnpm build`
Expected: 构建成功。

- [ ] **Step 4: 手动验证 - 旋转裁切**

启动 `pnpm tauri dev`，贴一张非正方形图片（如 400×200），右键 → 旋转 90°，验证：
- 图片不被裁切
- 窗口宽高交换（变为 200×400 逻辑像素）
- 窗口中心位置不变

- [ ] **Step 5: 手动验证 - 缩放 + 旋转**

在上一张贴图上先滚轮缩放到 2x，再旋转 90°，验证：
- 窗口尺寸正确（交换后 × 2）
- 继续滚轮缩放不裁切

- [ ] **Step 6: 手动验证 - 截图贴图位置**

触发截图（灵动岛展开 → 截图），在屏幕特定位置拖选区域，点击贴图按钮，验证：
- 贴图窗口出现在选区位置
- 窗口尺寸等于选区尺寸

- [ ] **Step 7: 手动验证 - 标注后截图贴图**

截图后添加任意标注（矩形/箭头/画笔等），然后贴图，验证：
- 贴图位置和尺寸仍匹配选区

- [ ] **Step 8: 手动验证 - 截图贴图恢复**

截图贴图后，右键 → 隐藏，再从贴图列表面板恢复显示，验证：
- 尺寸仍等于原选区尺寸

- [ ] **Step 9: 手动验证 - 旋转后重启恢复**

将一张贴图旋转 90° 后关闭并重启应用，验证：
- 窗口尺寸正确（交换后）
- 图片显示正常
- 中心位置符合预期

- [ ] **Step 10: Final commit（如有未提交的修复）**

```bash
git add -A
git commit -m "fix: verification adjustments"
```
