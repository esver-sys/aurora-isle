# Aurora Isle

Windows 桌面「灵动岛」悬浮控件 — 状态展示、磁吸贴图、快捷微件、截图 OCR、录屏、本地搜索。

## 技术栈

- **前端**: React 18 + TypeScript + Vite + Zustand + framer-motion
- **后端**: Rust + Tauri v2
- **数据库**: SQLite (rusqlite, bundled)
- **目标平台**: Windows 10/11

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)

### 安装与运行

```bash
pnpm install
pnpm tauri dev
```

### 构建

```bash
pnpm tauri build
```

## 项目结构

```
aurora-isle/
├── src/                    # React 前端
│   ├── components/         # UI 组件 (按子系统组织)
│   │   ├── island/         # S1 灵动岛
│   │   ├── pin/            # S2 贴图
│   │   ├── snip/           # S6 截图选区
│   │   └── shared/         # 共享组件
│   ├── stores/             # Zustand 状态
│   ├── hooks/              # 自定义 Hooks
│   ├── api/                # Tauri invoke 封装
│   ├── types/              # TypeScript 类型
│   ├── styles/             # 全局样式
│   └── locales/            # 文案集中管理
├── src-tauri/              # Rust 后端 + Tauri 核心
│   └── src/
│       ├── commands/       # invoke 处理层 (薄)
│       ├── services/       # 业务逻辑层
│       ├── models/         # 数据模型
│       └── db/             # SQLite 迁移与 CRUD
└── docs/                   # 设计文档与架构说明
```

## 子系统

| 子系统 | 职责 | 阶段 |
|--------|------|------|
| S1 灵动岛核心 | 形态切换/穿透/吸附 | P0 |
| S2 磁吸贴图 | 剪贴板监听/贴图窗口 | P0 |
| S3 配置与数据层 | SQLite/AppData | P0 |
| S4 系统集成 | 托盘/自启/快捷键 | P0 |
| S5 快捷微件 | 拖拽入岛/动态图标 | P1 |
| S6 截图与 OCR | 选区截图/文字识别 | P1 |
| S7 录屏/Launcher | 无感录屏/本地搜索 | P2 |

## 当前实现要点

- 截图选区窗口使用 Snipaste 风格工具条；当前只启用取消、贴图、复制，绘制类入口暂为禁用占位。
- 贴图窗口按图片比例初始化尺寸，支持拖拽移动、缩放、旋转、透明度调整，并将变换写入 SQLite。
- 截图复制通过 Rust 端 `arboard` 写入系统剪贴板；贴图图片存放在 AppData 的 `pins/` 目录。

## 文档

- [需求拆解与方案](docs/灵动岛-需求拆解与方案.md)
- [Phase 1 设计文档](docs/superpowers/specs/2026-07-07-aurora-isle-phase1-design.md)
- [架构说明](docs/architecture.md)
