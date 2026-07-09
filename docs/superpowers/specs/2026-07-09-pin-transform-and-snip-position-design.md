# 贴图变换裁切修复与截图贴图位置匹配

> 版本: v1.1 · 日期: 2026-07-09 · 状态: 待实现
> 关联文档: `docs/superpowers/specs/2026-07-07-aurora-isle-phase1-design.md`
> 涉及模块: 贴图窗口 (pin) · 截图选区 (snip)

---

## 1. 问题背景

### 1.1 旋转裁切

当前 `PinWindow.tsx` 中，旋转和翻转通过 CSS `transform` 应用在 `visualLayer` div 上，窗口尺寸不变。当非正方形图片旋转 90°/270° 时，图片长轴对齐窗口短轴，被窗口边界裁切。

**根因**：`visualLayer` 宽高为 `100%`（等于窗口尺寸），`object-fit: contain` 根据窗口尺寸缩放图片。旋转后图片视觉包围盒与窗口不匹配。

**影响范围**：`PinWindow.tsx` 的 `handleRotate90`（右键菜单 + `[`/`]` 快捷键）。

### 1.2 截图贴图位置与尺寸不匹配

截图选区贴图时，`useScreenshot.ts` 调用 `pinImage(croppedPath)` 未传入选区位置和尺寸。Rust 端 `pin_image` 将 `pos_x/pos_y` 设为 `None`，窗口由系统决定默认位置；尺寸经过 `compute_pin_window_size` 的 160-480px 钳制，不匹配选区大小。

**期望行为**（类似 Snipaste）：贴图窗口出现在选区所在屏幕位置，首次尺寸等于选区尺寸。

### 1.3 显示基准尺寸缺失

旋转、缩放和截图贴图都需要一个稳定的“未旋转显示基准尺寸”。当前 DB 只保存图片路径、位置、缩放和旋转角度。若截图贴图首次用选区尺寸创建窗口，但不持久化该尺寸，隐藏/显示或应用重启后仍会回到 `compute_pin_window_size` 的钳制尺寸，无法恢复选区大小。

---

## 2. 设计方案

### 2.1 新增可持久化的贴图显示基准尺寸

#### 核心思路

为每张贴图记录保存可选的 `base_width/base_height`（逻辑像素），表示图片在 `scale = 1`、未旋转时的视觉层尺寸：

- 截图贴图：`base_width/base_height = pinRect.width/height`，保证首次贴图和恢复后都等于选区尺寸。
- 剪贴板或普通图片贴图：`base_width/base_height = None`，继续通过 `compute_pin_window_size(image_width, image_height)` 计算 160-480px 的默认显示尺寸。
- 旧数据：没有 `base_width/base_height` 时走默认计算，不做破坏性迁移。

#### DB 迁移（SCHEMA_V3）

```sql
ALTER TABLE pins ADD COLUMN base_width REAL;
ALTER TABLE pins ADD COLUMN base_height REAL;
```

`run_migrations` 按版本顺序执行：新库先建 V1，再补 V2、V3；已有 V2 库仅执行 V3，并写入 `schema_version = 3`。不要把 V3 字段直接塞进 V1 表定义后跳过版本记录，否则旧库和新库的 `schema_version` 会不一致。

#### 模型字段

`PinRecord` 增加：

```rust
pub base_width: Option<f64>,
pub base_height: Option<f64>,
```

前端 `PinRecord` 同步增加：

```typescript
base_width: number | null;
base_height: number | null;
```

#### 基准尺寸解析规则

Rust 侧新增复用函数：

```rust
fn resolve_pin_base_size(pin: &PinRecord, image_width: u32, image_height: u32) -> (f64, f64) {
    if let (Some(w), Some(h)) = (pin.base_width, pin.base_height) {
        if w.is_finite() && h.is_finite() && w >= 1.0 && h >= 1.0 {
            return (w.round(), h.round());
        }
    }
    compute_pin_window_size(image_width, image_height)
}
```

**核心逻辑说明**：`base_width/base_height` 是恢复截图贴图尺寸的唯一持久化来源；不要把 `pin_rect` 作为只在创建窗口时临时使用的参数，否则关闭/恢复后尺寸会丢失。

### 2.2 旋转裁切修复：窗口尺寸跟随旋转

#### 尺寸计算规则

设 `baseW/baseH` 为 2.1 得到的未旋转基准尺寸（逻辑像素），`scale` 为缩放倍数：

| rotation | 窗口尺寸 (W×H) | visualLayer 尺寸 |
|----------|----------------|-----------------|
| 0° / 180° | `baseW×scale × baseH×scale` | `baseW×scale × baseH×scale` |
| 90° / 270° | `baseH×scale × baseW×scale` | `baseW×scale × baseH×scale` |

`visualLayer` 尺寸始终使用未交换的 `baseW×scale × baseH×scale`。CSS `rotate()` 旋转后，视觉包围盒刚好填满交换后的窗口。

#### Rust 初始窗口尺寸

`create_pin_window` 不再直接使用 `compute_pin_window_size` 结果作为窗口尺寸，而是：

1. 读取图片尺寸。
2. 通过 `resolve_pin_base_size` 得到 `base_w/base_h`。
3. 根据 `pin.rotation` 和 `pin.scale` 计算真实窗口尺寸。
4. 传给 `WebviewWindowBuilder::inner_size(win_w, win_h)`。

```rust
fn is_quarter_turn(rotation: f64) -> bool {
    let normalized = ((rotation % 360.0) + 360.0) % 360.0;
    (normalized - 90.0).abs() < 0.001 || (normalized - 270.0).abs() < 0.001
}

fn compute_pin_window_size_for_transform(base_w: f64, base_h: f64, scale: f64, rotation: f64) -> (f64, f64) {
    let scaled_w = (base_w * scale).round().max(1.0);
    let scaled_h = (base_h * scale).round().max(1.0);
    if is_quarter_turn(rotation) {
        (scaled_h, scaled_w)
    } else {
        (scaled_w, scaled_h)
    }
}
```

#### PinWindow.tsx 初始化

前端新增 `baseDimsRef`，优先使用 DB 字段：

```typescript
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

**核心逻辑说明**：当窗口启动时已经处于 90°/270°，当前 `window.innerWidth/innerHeight` 已经是交换后的尺寸，必须反交换后才能得到未旋转基准尺寸。直接用当前宽高初始化会把 `baseW/baseH` 记反，导致恢复后再次旋转裁切。

#### 旋转时窗口中心保持不动

旋转导致窗口宽高交换时，调整窗口左上角使中心点不变。前端当前可稳定读取的是 `win.outerPosition()` 的物理坐标，因此位置 delta 也按物理像素计算：

```typescript
const oldSize = computeWindowSize(oldRotation, scale, baseW, baseH); // 逻辑像素
const nextSize = computeWindowSize(nextRotation, scale, baseW, baseH); // 逻辑像素
const pos = await win.outerPosition(); // 物理像素
const dpr = window.devicePixelRatio || 1;
const deltaX = Math.round(((oldSize.width - nextSize.width) / 2) * dpr);
const deltaY = Math.round(((oldSize.height - nextSize.height) / 2) * dpr);
await win.setSize(new LogicalSize(nextSize.width, nextSize.height));
await win.setPosition(new PhysicalPosition(pos.x + deltaX, pos.y + deltaY));
```

不要把逻辑像素的 delta 直接加到 `PhysicalPosition`。若后续统一改为逻辑坐标持久化，则旋转位置计算也应整体切到 `LogicalPosition`。

#### CSS 调整

`PinWindow.module.css` 变更：

- `.visualLayer`：移除 `width: 100%; height: 100%`，改为由内联样式显式设置宽高。保留 `transform-origin: center` 和 `transition`。
- `.pinImage`：将 `max-width: 100%; max-height: 100%; object-fit: contain` 改为 `width: 100%; height: 100%; object-fit: fill` 或仅保留 `width/height: 100%`。因为 `baseW:baseH` 等于实际显示比例，不应再二次 contain。

#### PinWindow.tsx 变更

1. **新增 helper**：`normalizeRotation`、`isQuarterTurn`、`computeWindowSize`。
2. **新增 ref**：`baseDimsRef` 存储 `{ baseW: number; baseH: number }`。
3. **修改 `handleRotate90` 与 `[`/`]` 快捷键**：统一走 `applyRotation(nextRotation)`，计算新窗口尺寸并按物理 delta 保持中心。
4. **修改 `applyScale`**：缩放时使用 `computeWindowSize(pin.rotation, nextScale, baseW, baseH)`，支持旋转状态下继续缩放。
5. **render**：`visualLayer` 的 `style` 增加 `width` 和 `height`，值为 `baseW×scale × baseH×scale`。

#### 边界情况

- **旋转 180°/360°(=0°)**：不交换窗口尺寸，仅 CSS 旋转。
- **初始化时已有旋转**：Rust 用保存的 `rotation` 创建正确窗口尺寸；前端从 DB base 字段或反交换后的窗口尺寸初始化 `baseDimsRef`。
- **缩放 + 旋转组合**：`computeWindowSize` 同时接收 `rotation` 和 `scale`。
- **旧数据无 base 字段**：Rust 用图片比例计算；前端若 DB 字段为空则从当前窗口尺寸反推。

### 2.3 截图贴图位置与尺寸匹配

#### 数据流变更

```
SnipWindow.handleAction("pin")
  -> 计算 pinRect = { x, y, width, height }（逻辑像素，屏幕坐标）
  -> emit("snip:complete", { action, croppedPath, historyInfo, pinRect })
useScreenshot 监听 snip:complete
  -> pinImage(croppedPath, pinRect)
Rust pin_image(temp_path, pin_rect: Option<PinRect>)
  -> 有 pin_rect 时：PinRecord.pos_x/pos_y = rect.x/y，base_width/base_height = rect.width/height，scale = 1.0
  -> 无 pin_rect 时：保持现有默认尺寸逻辑
create_pin_window
  -> 从 PinRecord 持久化字段恢复位置、base 尺寸、scale、rotation
```

#### pinRect 坐标计算

选区在 snip 窗口内是逻辑坐标 `(rect.left, rect.top)`，snip 窗口位于逻辑坐标 `(cap.monitorX, cap.monitorY)`（由 `useScreenshot` 传入，即 `monitor.position / scaleFactor`）。

```typescript
const pinRect = action === "pin"
  ? {
      x: cap.monitorX + rect.left,
      y: cap.monitorY + rect.top,
      width: rect.width,
      height: rect.height,
    }
  : undefined;
```

这些值传给 Rust 后用于 `WebviewWindowBuilder::position()` 和 `inner_size()`，二者均接受逻辑像素。

#### SnipWindow.tsx 变更

`handleAction` 中先构造统一 payload，标注与非标注分支都使用同一个 `pinRect`：

```typescript
const completePayload = {
  action,
  croppedPath,
  historyInfo,
  pinRect,
};

if (annotationRef.current?.hasAnnotations()) {
  const annotatedPath = await annotationRef.current.exportImage();
  if (annotatedPath) {
    await emit("snip:complete", { ...completePayload, croppedPath: annotatedPath });
    return;
  }
}

await emit("snip:complete", completePayload);
```

**核心逻辑说明**：现有代码对有标注截图和无标注截图有两个 `emit("snip:complete")` 分支。`pinRect` 必须在两个分支中都传递，否则标注后贴图会退回默认位置和尺寸。

#### useScreenshot.ts 变更

`snip:complete` 事件类型新增可选 `pinRect` 字段，并只在 `action === "pin"` 时传给 `pinImage`：

```typescript
listen<{
  action: "pin" | "copy" | "save" | "quick_save";
  croppedPath: string | null;
  historyInfo: HistoryInfo | null;
  pinRect?: PinRect;
}>("snip:complete", async (event) => {
  const { action, croppedPath, historyInfo, pinRect } = event.payload;
  if (!croppedPath) return;

  if (action === "pin") {
    await pinImage(croppedPath, pinRect);
  }
});
```

#### 前端 API 层变更

`src/types/index.ts` 新增 `PinRect` 接口，`src/api/pin.ts` 从 `types` 引用：

```typescript
export interface PinRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function pinImage(tempPath: string, pinRect?: PinRect): Promise<string> {
  return await invoke("pin_image", { tempPath, pinRect });
}
```

#### Rust 层变更

`src-tauri/src/models/pin.rs` 新增：

```rust
#[derive(Debug, Clone, Deserialize)]
pub struct PinRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}
```

`pin_image` 签名变更：

```rust
#[tauri::command]
pub async fn pin_image(
    app: AppHandle,
    state: State<'_, AppState>,
    temp_path: String,
    pin_rect: Option<PinRect>,
) -> Result<String>
```

`pin_rect` 为 `Some` 时：

- 校验 `x/y/width/height` 都是有限数字，且 `width/height >= 1.0`，否则返回错误。
- `PinRecord.pos_x = Some(rect.x)`，`pos_y = Some(rect.y)`。
- `PinRecord.base_width = Some(rect.width)`，`base_height = Some(rect.height)`。
- `PinRecord.scale = 1.0`，`rotation = 0.0`。

`pin_rect` 为 `None` 时：

- `pos_x/pos_y/base_width/base_height = None`。
- 继续使用图片尺寸推导默认窗口大小。

#### 坐标系一致性说明

当前 `PinWindow.tsx` 的 `onMoved` 回调返回 `PhysicalPosition`，并直接存入 `pos_x/pos_y`；而 `WebviewWindowBuilder::position()` 接受逻辑像素。在 `scaleFactor > 1` 的高 DPI 屏幕上，已有手动移动后的恢复坐标可能不一致。

本次只保证截图贴图的**首次创建位置**使用逻辑坐标并匹配选区。已有贴图移动持久化的物理/逻辑坐标统一问题不在本次范围内，应后续单独处理，避免混入旧数据迁移风险。

---

## 3. 涉及文件清单

| 文件 | 变更内容 |
|------|----------|
| `src-tauri/src/db/migrations.rs` | 新增 SCHEMA_V3：`base_width/base_height` |
| `src-tauri/src/db/repository.rs` | `PinRecord` 字段读写、`insert_pin`、测试样例同步增加 base 字段 |
| `src-tauri/src/models/pin.rs` | `PinRecord` 新增 `base_width/base_height`；新增 `PinRect` 结构体 |
| `src-tauri/src/commands/pin.rs` | `pin_image` 增加 `pin_rect` 参数；`create_pin_window` 支持持久化 base 尺寸 + 旋转感知 |
| `src/types/index.ts` | `PinRecord` 新增 `base_width/base_height`；新增 `PinRect` 接口 |
| `src/api/pin.ts` | `pinImage` 增加 `pinRect` 参数；从 `types` 引用 `PinRect` |
| `src/components/pin/PinWindow.tsx` | 旋转时交换窗口尺寸并保持中心；初始化反推 base；`applyScale` 旋转感知；`visualLayer` 显式尺寸 |
| `src/components/pin/PinWindow.module.css` | `.visualLayer` 移除 100% 宽高；`.pinImage` 改为固定填充 visualLayer |
| `src/hooks/useScreenshot.ts` | `snip:complete` 类型增加 `pinRect`；调用 `pinImage` 时传入 |
| `src/components/snip/SnipWindow.tsx` | `handleAction` 计算 `pinRect`，统一标注/非标注完成 payload |

---

## 4. 测试策略

### 4.1 Rust 单元测试

- `resolve_pin_base_size`：
  - 有合法 `base_width/base_height` 时优先返回 DB 尺寸。
  - base 字段为空或非法时回退到 `compute_pin_window_size`。
- `compute_pin_window_size_for_transform`：
  - 0°/180° 不交换，90°/270° 交换。
  - scale 参与计算并至少返回 1px。
- `repository`：
  - `insert_pin` 后能读回 `base_width/base_height`。
  - 旧字段测试样例同步更新，避免 SELECT 索引错位。

### 4.2 TypeScript 最小验证

- 运行 `pnpm typecheck`，覆盖新增 `PinRect`、`PinRecord.base_width/base_height`、`pinImage(tempPath, pinRect)` 的类型链路。

### 4.3 前端手动验证

- **旋转裁切**：贴一张非正方形图片（如 400×200），旋转 90°，验证图片不被裁切、窗口尺寸交换、中心位置不变。
- **缩放 + 旋转**：先缩放到 2x，再旋转 90°，验证窗口尺寸正确（交换后×2），继续滚轮缩放不裁切。
- **截图贴图位置**：在屏幕特定位置截图选区并贴图，验证贴图窗口出现在选区位置、尺寸匹配。
- **标注后截图贴图**：添加任意标注后贴图，验证位置和尺寸仍匹配选区。
- **截图贴图后恢复**：截图贴图后隐藏再显示、关闭再显示、应用重启恢复，验证尺寸仍等于原选区尺寸。
- **旋转后恢复**：截图贴图或普通贴图旋转 90° 后重启，验证窗口尺寸、图片显示和中心位置符合预期。

---

## 5. 不在本次范围内

- 任意角度旋转（仅支持 90° 增量）。
- 斜切、透视等变形。
- 已有的手动移动后 `pos_x/pos_y` 物理坐标 vs 逻辑坐标不一致问题。
- 旧数据 `pos_x/pos_y` 坐标迁移。
- 贴图间 z-order 层级管理。
