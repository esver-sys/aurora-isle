---
name: dependency-first-development
description: 在 Aurora Isle 项目中实现功能、修复 BUG、重构或编写脚本时使用。要求先检查 package.json、src-tauri/Cargo.toml 与项目内已有 api/hooks/stores/services/shared 等封装，优先复用已安装依赖和现有抽象，避免重复手写成熟能力；需要新增依赖或无法判断复用方案时，先向用户说明搜索结果并确认。
---

# 依赖优先开发

## 核心原则

先查依赖，再写实现。只要项目内已有封装或已安装依赖能覆盖当前需求，就必须优先复用，避免重复手写成熟能力。

推荐优先级：

1. 项目内已有业务封装：例如 `src/api`、`src/hooks`、`src/stores`、`src/components/shared`、`src-tauri/src/services`、`src-tauri/src/db`。
2. 已安装第三方依赖或官方插件：例如 React、Zustand、framer-motion、lucide-react、Tauri API/plugin、rusqlite、arboard、image、uuid、thiserror、windows-sys。
3. 语言或平台内建能力：仅用于简单胶水逻辑，不能替代已有成熟依赖的核心能力。
4. 新增成熟第三方依赖：仅当现有依赖和项目封装不足以可靠完成需求时考虑。
5. 手写轻量逻辑：只用于项目特有、范围明确、没有成熟库价值的小逻辑。

## 必做流程

1. 判断任务涉及的层：前端 React/TypeScript、Rust/Tauri 后端、数据库、窗口系统、截图/剪贴板、样式或跨层通信。
2. 先读取依赖清单：
   - 前端或工具链需求：检查 `package.json` 的 `dependencies` 和 `devDependencies`。
   - Rust/Tauri 需求：检查 `src-tauri/Cargo.toml` 的 `[dependencies]`、平台条件依赖和 Tauri 插件。
3. 再搜索项目内复用点：
   - 前端优先查 `src/api`、`src/hooks`、`src/stores`、`src/types`、`src/locales`、`src/components/shared`。
   - Rust 优先查 `src-tauri/src/commands`、`src-tauri/src/services`、`src-tauri/src/models`、`src-tauri/src/db`、`src-tauri/src/error.rs`、`src-tauri/src/state.rs`。
   - 使用 `rg` 或 `rg --files` 搜索相关名称、类型、事件名、command 名、service 名。
4. 根据搜索结果选择实现：
   - 已有业务封装能用时，调用封装，不绕过分层直接访问底层。
   - 已安装依赖能覆盖时，调用依赖，不重新实现同类通用能力。
   - 没有现成能力时，先评估是否值得新增依赖；新增依赖必须解决非平凡问题，并符合 Windows/Tauri 桌面应用约束。
5. 编码前如果仍不确定，先暂停并向用户列出：
   - 已检查的依赖和项目目录。
   - 可复用的候选函数、组件、hook、service 或 crate。
   - 推荐方案及原因。

## 新增依赖边界

可以考虑新增依赖的情况：

- 需求属于截图、图像处理、OCR、快捷键、窗口控制、数据库迁移、日期时间、复杂数据结构、动画编排等成熟问题域。
- 手写实现会显著增加缺陷风险、兼容性风险或维护成本。
- 依赖维护活跃、体积和权限影响可接受，并且与 Tauri v2、Windows 10/11 目标平台兼容。

不要新增依赖的情况：

- 只是几行清晰的业务胶水代码。
- 项目内已有封装或已安装依赖已经能完成需求。
- 依赖会引入明显的 bundle 体积、原生编译、权限、许可或跨平台兼容风险。
- 只是为了绕过理解现有代码。

新增依赖前必须先向用户说明理由并确认；确认后再使用项目当前包管理方式更新依赖和锁文件。

## 常见映射

- 状态管理：优先使用已有 Zustand store 或新增同风格 store，不临时创建分散的全局状态。
- 动画：优先使用 framer-motion；按钮图标优先使用 lucide-react。
- Tauri 通信：前端通过 `src/api/*` 封装 invoke；Rust command 保持薄层，业务逻辑放到 `services`。
- 数据持久化：优先使用 `rusqlite` 和 `db/repository` 现有模式，不在 command 中直接拼 SQL。
- 图片、缩略图、剪贴板、截图：优先查 `image`、`arboard`、`xcap` 以及 `services` 中已有实现。
- Windows 窗口能力：优先查 Tauri API、已安装 Tauri 插件和 `windows-sys` 现有用法。

## 禁止事项

- 不查 `package.json` 或 `src-tauri/Cargo.toml` 就开始写新实现。
- 已有依赖或封装能解决时，手写同类通用能力。
- 为了简单调用而破坏 React 前端、Tauri command、Rust service、DB repository 的分层。
- 对不确定的复用点自行猜测；必须列出搜索结果并询问用户。
- 需求修改或 BUG 修复时跑全量测试；只验证对应文件或必要的最小检查。

## 交付要求

完成后在回复中简要说明：

- 检查过哪些依赖清单和复用目录。
- 最终复用了哪些依赖、封装或为什么选择手写。
- 做了哪些针对性验证；若只是文档或规则修改，可说明未运行测试。
