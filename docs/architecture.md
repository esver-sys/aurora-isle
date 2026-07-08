# Aurora Isle 架构说明

## 分层架构

```
React 前端层              Tauri 核心层              Rust 后端层
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────────┐
│ Island UI       │      │ invoke 通道       │      │ commands/           │
│ Pin UI          │ ←──→ │ emit/listen      │ ──→  │ services/           │
│ Zustand stores  │      │ 多窗口管理        │      │ models/ + db/       │
│ hooks           │      │ 插件: shortcut/  │      │ error.rs + state.rs │
│ api wrappers    │      │   autostart/...  │      │                     │
└─────────────────┘      └──────────────────┘      └─────────────────────┘
```

## 数据流

### 命令 (invoke) — 前端主动请求

```
前端 api/pin.ts         →  invoke("pin_image", { tempPath })
  → commands/pin.rs        →  services/storage::save_pin_image()
  → image::image_dimensions →  按图片比例计算 pin-<id> 初始窗口尺寸
  → db/repository           →  insert_pin()
  → WebviewWindowBuilder   →  创建 pin-<id> 窗口
  ← 返回 pin ID
```

### 截图选区与后处理

```
Island 截图入口
  → hooks/useScreenshot.ts        → 创建全屏 snip 窗口
  → components/snip/SnipWindow    → 拖拽选区 + Snipaste 风格工具条
  → api/screenshot.ts             → crop_image 裁剪选区
  → snip:complete(action, path)   → pin_image 贴图 / copy_image_to_clipboard 复制
```

当前截图工具条只启用「取消」「贴图」「复制」。矩形、画笔、荧光笔、文字、橡皮擦、撤销、重做、保存暂时作为禁用占位入口，避免展示不可用的假操作。

### 事件 (emit/listen) — 后端主动通知

```
Rust services/clipboard.rs  →  app.emit("clipboard-image", { path, w, h })
  → 前端 hooks/useClipboardImage.ts  →  listen("clipboard-image")
  → pinStore.setPendingClipboardImage()
  → UI 弹出确认条
```

## Rust 分层职责

| 层 | 职责 | 依赖方向 |
|----|------|----------|
| `commands/` | Tauri invoke 入口，参数校验，调用 service | → services, db, models |
| `services/` | 业务逻辑：DB 初始化、剪贴板监听、文件存储、缩略图 | → db, models, error |
| `models/` | 数据结构定义 (PinRecord, ConfigEntry, PinTransform) | 无依赖 |
| `db/` | SQLite 迁移 (migrations) 与 CRUD (repository) | → models, error |
| `error.rs` | AppError 枚举 + Serialize 实现 | 无依赖 |
| `state.rs` | AppState: Mutex<Connection> + app_data_dir | → error |

## 前端分层职责

| 层 | 职责 |
|----|------|
| `components/` | UI 组件，按子系统分目录 |
| `stores/` | Zustand 全局状态 |
| `hooks/` | 可复用逻辑（鼠标穿透、剪贴板、拖拽） |
| `api/` | Tauri invoke 类型安全封装 |
| `types/` | 共享 TypeScript 类型（与 Rust models 对应） |
| `locales/` | 前端文案集中管理 |

## 贴图窗口行为

- Rust 端创建 `pin-<id>` 窗口前读取图片尺寸，按原图比例将窗口最大边限制在 480px，最小可操作边放大到 160px。
- `PinWindow` 读取 DB 中的 `PinRecord` 后渲染图片，并持有当前窗口内的 scale / rotation / opacity 状态。
- `PinToolbar` 是受控组件：缩放、透明度、旋转操作先乐观更新当前窗口，再通过 `update_pin_transform` 持久化到 SQLite。
- 贴图主体区域可拖拽 Tauri 窗口；窗口移动后通过 `onMoved` 将 `pos_x` / `pos_y` 写回 `pins` 表。
- MVP 暂不实现贴图之间的 z-order 面板；置顶按钮保留为禁用占位。

## 数据存储

```
%APPDATA%/com.aurora.isle/
  app.db              # SQLite (config + pins 表)
  pins/<uuid>.png     # 贴图原图
  thumbs/<uuid>.png   # 缩略图
```

### 数据模型

```sql
config (key TEXT PK, value TEXT)
pins (id, file_path, thumb_path, pos_x, pos_y, scale, rotation,
      opacity, always_on_top, locked, pinned_open, created_at, updated_at)
```

## Tauri 插件

| 插件 | 用途 |
|------|------|
| tauri-plugin-single-instance | 防多开 |
| tauri-plugin-global-shortcut | 全局快捷键 |
| tauri-plugin-autostart | 开机自启 |
| tauri-plugin-opener | 打开文件/URL |

## 窗口配置 (island)

```json
{
  "label": "island",
  "transparent": true,
  "decorations": false,
  "alwaysOnTop": true,
  "skipTaskbar": true,
  "resizable": false,
  "shadow": false,
  "width": 400,
  "height": 60
}
```

## 错误处理

```
Rust:  Result<T, AppError>  ──Serialize──→  前端:  Promise.reject(message)
         ↑ thiserror                                    ↑ invoke().catch()
```

AppError 变体: Database, Io, Image, Tauri, Clipboard, Window, ConfigNotFound, PinNotFound, Lock, General
