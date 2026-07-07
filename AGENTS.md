# Aurora Isle - 开发指南

## 项目概述

Aurora Isle 是一个 Windows 桌面「灵动岛」应用，基于 Tauri v2 + Rust + React + TypeScript。

## 技术栈

- 前端: React 18 + TypeScript + Vite + Zustand + framer-motion + lucide-react
- 后端: Rust + Tauri v2
- 数据库: SQLite (rusqlite bundled)
- 平台: Windows 10/11 only

## 常用命令

- `pnpm dev` — 启动前端 dev server (仅 Vite)
- `pnpm tauri dev` — 启动完整 Tauri 开发环境 (前端 + Rust)
- `pnpm build` — 构建前端 (tsc + vite build)
- `pnpm tauri build` — 构建生产应用
- `pnpm typecheck` — TypeScript 类型检查

## 架构

三层架构: React 前端 ↔ Tauri 核心 ↔ Rust 后端

### Rust 模块组织 (分层)

- `commands/` — Tauri invoke 处理函数（薄层，参数校验 + 调用 service）
  - `island.rs` — S1: 窗口尺寸/位置/穿透
  - `pin.rs` — S2: 贴图 CRUD/变换/图片路径
  - `config.rs` — S3: 配置读写
  - `system.rs` — S4: 自启开关
- `services/` — 业务逻辑（DB 初始化、剪贴板监听、文件存储、缩略图）
- `models/` — 数据结构（PinRecord, ConfigEntry, PinTransform）
- `db/` — SQLite 迁移与 CRUD（migrations + repository）

### 前端模块组织

- `components/{island,pin,shared}/` — 按子系统组织的 UI 组件
- `stores/` — Zustand 状态（islandStore, pinStore, configStore）
- `hooks/` — 自定义 Hooks（useCursorEvents, useClipboardImage, useWindowDrag）
- `api/` — Tauri invoke 封装（按子系统分文件）
- `types/index.ts` — 共享 TypeScript 类型
- `locales/zh.ts` — 前端文案集中管理

## 多窗口策略

| 窗口 | label | 职责 |
|------|-------|------|
| 灵动岛 | `island` | 胶囊/展开态、承载微件 |
| 贴图 | `pin-<uuid>` | 单张图片悬浮 |
| 截图 | `snip` | 全屏选区 (P1) |
| Launcher | `launcher` | 搜索框 (P2) |

前端通过 `getCurrentWindow().label` 判断当前窗口，渲染对应组件。

## 开发约定

- 前后端通信: invoke (前端请求) + emit/listen (后端通知)
- 所有系统操作在 Rust 端执行，前端仅渲染与交互
- 错误处理: Rust 返回 `Result<T, AppError>`，AppError 实现 Serialize 传给前端
- 数据库: Mutex<Connection> 通过 AppState 管理
- 图片路径: DB 存相对路径 (如 `pins/uuid.png`)，前端通过 `get_image_path` + `convertFileSrc` 显示

## 相关文档

- `docs/灵动岛-需求拆解与方案.md` — 原始需求
- `docs/superpowers/specs/2026-07-07-aurora-isle-phase1-design.md` — Phase 1 设计
- `docs/architecture.md` — 架构说明
