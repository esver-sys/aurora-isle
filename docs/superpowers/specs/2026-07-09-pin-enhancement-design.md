# 贴图功能完善设计文档

> 日期：2026-07-09
> 基于：Snipaste 截图功能调研文档（FR-110 ~ FR-117）
> 状态：已确认，实施中

## 1. 背景与目标

当前 Aurora Isle 的贴图子系统已有基础功能（截图 -> 贴图、拖拽移动、缩放/旋转/透明度滑块、关闭），但与 Snipaste 贴图体验相比存在显著差距。本次完善目标：实现全部 MVP+P1 贴图功能，使贴图窗口交互达到 Snipaste 水平。

## 2. 关键决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| 交互方式 | 右键菜单为主（Snipaste 风格） | 最简洁，贴图窗口只显示纯图片 |
| 窗口状态语义 | 隐藏 + 关闭 + 删除三态 | FR-116 P1 要求 |
| 透明度控制 | 预设值子菜单（10%~100%） | 与 Snipaste 一致，右键菜单中体验好 |
| 实现方式 | React 自定义右键菜单 + Tauri 窗口 API | 与现有架构一致，样式可控 |

## 3. 功能范围（MVP+P1）

1. **右键上下文菜单** - 置顶/锁定/透明度/翻转/旋转/复制/保存/隐藏/关闭/删除
2. **鼠标滚轮缩放** - 以光标位置为中心缩放
3. **双击复制到剪贴板** - 快速复制贴图内容
4. **置顶切换** - DB 字段已存在，补充命令更新 + Tauri API
5. **水平/垂直翻转** - FR-115
6. **隐藏/关闭/删除三态** - FR-116
7. **永久删除贴图** - 删除图片文件 + DB 记录
8. **位置记忆与恢复** - 恢复保存的 pos_x/pos_y
9. **锁定贴图** - 防止误操作
10. **应用启动恢复贴图** - 重开 pinned_open=1 AND hidden=0 的贴图窗口
11. **灵动岛贴图列表面板** - 管理显示中/隐藏/关闭的贴图
12. **键盘快捷键** - 方向键移动、+/-缩放、[/]旋转、Ctrl+C复制、Esc隐藏

## 4. 数据模型变更

### DB 迁移（SCHEMA_V2）

```sql
ALTER TABLE pins ADD COLUMN hidden INTEGER DEFAULT 0;
ALTER TABLE pins ADD COLUMN flip_h INTEGER DEFAULT 0;
ALTER TABLE pins ADD COLUMN flip_v INTEGER DEFAULT 0;
```

### PinRecord 扩展

新增字段：`hidden: bool`, `flip_h: bool`, `flip_v: bool`

### PinTransform 扩展

新增可选字段：`always_on_top: Option<bool>`, `locked: Option<bool>`, `flip_h: Option<bool>`, `flip_v: Option<bool>`

## 5. Rust 后端变更

| 变更 | 说明 |
|------|------|
| `update_pin_transform` 扩展 | 支持 `always_on_top`、`locked`、`flip_h`、`flip_v` |
| 新增 `hide_pin(id)` | 设 `hidden=1`，关闭窗口 |
| 新增 `show_pin(id)` | 设 `hidden=0`，重新创建窗口 |
| 新增 `delete_pin(id)` | 关闭窗口 + 删图片 + 删缩略图 + 删 DB 记录 |
| 新增 `restore_pins_on_startup` | 启动时恢复 `pinned_open=1 AND hidden=0` 的贴图 |
| `pin_image` 增强 | 创建窗口时应用保存的位置 |

## 6. 前端变更

| 组件 | 变更 |
|------|------|
| `PinWindow.tsx` | 重写：移除工具栏，新增右键菜单/滚轮缩放/双击复制/键盘快捷键/位置恢复 |
| `PinContextMenu.tsx` | 新增：右键菜单组件 |
| `PinListPanel.tsx` | 新增：灵动岛展开面板中的贴图列表 |
| `Expanded.tsx` | 新增贴图列表入口 |
| `api/pin.ts` | 新增 hidePin/showPin/deletePin/restorePins |
| `types/index.ts` | 扩展类型 |

## 7. 右键菜单结构

```
📌 置顶              [✓/○]
🔒 锁定              [✓/○]
─────────────────
👁 透明度            [100% ▶]
   → 10% 20% ... 100%
🔍 缩放              [100%]
─────────────────
↔️ 水平翻转
↕️ 垂直翻转
🔄 旋转 90°
─────────────────
📋 复制到剪贴板
💾 另存为...
─────────────────
🙈 隐藏        (黄)
✕ 关闭         (灰)
🗑 删除         (红)
```

## 8. 键盘与鼠标快捷操作

| 操作 | 触发 |
|------|------|
| 移动贴图 | 左键拖拽 / 方向键(1px) / Ctrl+方向键(10px) |
| 缩放 | 滚轮(以光标为中心) / +/- 键 |
| 旋转 | [/] 键 |
| 复制 | 双击 / Ctrl+C |
| 弹出菜单 | 右键 |
| 隐藏 | Esc |

## 9. 实现顺序

1. DB 迁移 + 模型扩展
2. Repository CRUD 扩展
3. Rust 命令（update_pin_transform 扩展 + hide/show/delete/restore）
4. lib.rs 注册命令 + 启动恢复
5. 前端类型 + API 封装
6. PinContextMenu 组件
7. PinWindow 重写
8. PinListPanel + Expanded 集成
9. 端到端验证
