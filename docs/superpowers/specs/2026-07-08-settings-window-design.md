# 独立设置窗口 - 设计文档

> 版本: v1 · 日期: 2026-07-08 · 状态: 待实现
> 关联文档: `docs/superpowers/specs/2026-07-07-aurora-isle-phase1-design.md`(Phase 1 设计)
> 技术基线: Tauri v2 + React + TypeScript

---

## 1. 文档定位

本文档是「设置独立面板」功能的设计产出。当前设置入口嵌在灵动岛展开态内(`SettingsPanel.tsx`),空间狭窄,仅能容纳「开机自启 / 重置位置」两项,无法承载「左导航 + 右配置」的标准设置界面。本次将其重构为独立 Tauri 窗口。

## 2. 需求与目标

- 点开「设置」时打开一个**独立面板**,左侧导航、右侧配置项
- 设置面板有足够空间承载多分组配置
- 单一入口,避免 island 内嵌设置与独立窗口两套并存

### 2.1 非目标(YAGNI)

- 不实现「外观 / 快捷键 / 贴图」分组的具体配置项读写(需扩展后端 config 存储,留后续迭代),本次仅做占位
- 不做设置项的跨窗口实时同步(通用页的两项均为即时生效的命令式操作,无需同步)
- 不做导入/导出配置、恢复默认

## 3. 方案选型(窗口管理)

| 方案 | 说明 | 取舍 |
|------|------|------|
| **A. 预定义窗口 + show/hide 单例(采用)** | `tauri.conf.json` 预定义 `settings` 窗口(`visible:false`),点设置时 show+focus,关闭=hide | 单例、状态保留、秒开;跨窗口控制稍复杂 |
| B. 每次新建窗口 | 点设置时 `WebviewWindow` 新建,关闭销毁 | 实现简单;无状态保留,重复点击可能多开 |

**采用 A**:符合桌面应用设置面板常见交互(重复点击聚焦而非多开),且能保留用户当前所在 tab 与滚动位置。

## 4. 架构

- 新增 `settings` 窗口(label: `"settings"`),纳入多窗口策略表
- `App.tsx` 路由:`label === "settings"` -> `<SettingsWindow/>`
- island 的「设置」入口:由 `setShowSettings(true)` 改为调用 `openSettings()`(show+focus 已有窗口)
- **移除** island 内的 `SettingsPanel.tsx` 与 `islandStore.showSettings`(单一入口,避免两套设置混淆)
- `Expanded.tsx` 的 `onSettings` 改为:打开设置窗口 + 收起 island

## 5. 窗口规格

| 属性 | 值 | 说明 |
|------|-----|------|
| label | `settings` | 多窗口路由标识 |
| 尺寸 | `720 × 520` | 固定,不允许缩放,保持布局稳定 |
| `decorations` | `false` | 无系统标题栏,自定义 |
| `transparent` | `true` | 配合圆角玻璃质感 |
| `resizable` | `false` | 固定尺寸 |
| `visible` | `false`(初始) | 启动不显示,按需 show |
| `alwaysOnTop` | `false` | 设置面板无需总在最前,方便对照操作 |
| 圆角 | 12px | 与 island 视觉语言一致 |
| 主题 | 深色玻璃 | 与 island 一致 |

标题栏自定义:拖拽区(`data-tauri-drag-region`)+ 右上角关闭按钮(实际执行 `hide()`)。

## 6. 布局

```
┌──────────────────────────────────────┐
│ [拖拽区]                    [×关闭]   │  自定义标题栏 40px
├──────────┬───────────────────────────┤
│ 通用     │  通用设置                  │
│ 外观     │  ─────────────             │
│ 快捷键   │  开机自启        [toggle]  │
│ 贴图     │  重置位置        [按钮]    │
│ 关于     │                            │
│          │                            │
└──────────┴───────────────────────────┘
   左导航 180px      右内容区(可滚动)
```

- 左导航:图标(lucide)+ 文字,垂直排列;选中项高亮(左侧色条 + 背景色)
- 右内容区:顶部当前分组标题,下方配置项列表(超出可滚动)
- 当前选中 tab 存于 `SettingsWindow` 组件内 `useState`,默认「通用」

### 导航项图标

| 分组 | lucide 图标 |
|------|-------------|
| 通用 | `Settings` |
| 外观 | `Palette` |
| 快捷键 | `Keyboard` |
| 贴图 | `Image` |
| 关于 | `Info` |

## 7. 各 Tab 内容(框架优先)

| Tab | 状态 | 内容 |
|-----|------|------|
| 通用 | **做实** | 开机自启(toggle,复用 `api/system`)、重置位置(按钮,复用 `api/island`) |
| 外观 | 占位 | 主题色 / 胶囊尺寸 / 圆角 / 透明度 - 只读展示「即将推出」 |
| 快捷键 | 占位 | 截图快捷键 / 唤起灵动岛 - 只读展示当前默认值 +「即将推出」 |
| 贴图 | 占位 | 默认透明度 / 默认置顶 - 只读 +「即将推出」 |
| 关于 | **做实** | 版本号 v0.1.0、项目简介 |

> 关于页的外链项暂不放(避免编造 URL),待用户提供真实仓库地址后再加。

## 8. 文件结构

新增:
```
src/components/settings/
  SettingsWindow.tsx          # 主窗口:标题栏 + 左右布局 + tab 状态
  SettingsWindow.module.css
  SettingsNav.tsx             # 左侧导航
  panels/
    GeneralPanel.tsx          # 做实
    AppearancePanel.tsx       # 占位
    ShortcutsPanel.tsx        # 占位
    PinPanel.tsx              # 占位
    AboutPanel.tsx            # 做实
src/api/settings.ts           # openSettings() 封装(show + focus)
```

修改:
- `src/App.tsx` - 加 `settings` 路由
- `src/components/island/Island.tsx` - 设置按钮改为 `openSettings()`
- `src/components/island/Expanded.tsx` - `onSettings` 行为调整
- `src/stores/islandStore.ts` - 移除 `showSettings` 及相关
- `src-tauri/tauri.conf.json` - 注册 `settings` 窗口
- `src-tauri/capabilities/default.json` - `windows` 加 `"settings"`

删除:
- `src/components/island/SettingsPanel.tsx`

## 9. 数据流与 API

### 打开设置(island -> settings 窗口)

```ts
// src/api/settings.ts
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export async function openSettings(): Promise<void> {
  const win = await WebviewWindow.getByLabel("settings");
  if (win) {
    await win.show();
    await win.setFocus();
  }
}
```

### 关闭设置(settings 窗口内,实际隐藏)

```ts
import { getCurrentWindow } from "@tauri-apps/api/window";
await getCurrentWindow().hide();
```

### 通用页配置项(复用现有 API)

- 开机自启:`isAutostartEnabled()` / `toggleAutostart(bool)` - `api/system`
- 重置位置:`getMonitorInfo()` + `setWindowPosition(x, 0)` - `api/island`

> 上述均为即时生效的命令式操作,无需跨窗口状态同步。

## 10. 修改清单(实现指引)

1. `tauri.conf.json`:在 `app.windows` 增加 `settings` 窗口配置(label/width/height/visible:false/decorations:false/transparent:true/resizable:false/url:"index.html")
2. `capabilities/default.json`:`windows` 数组加 `"settings"`
3. 新建 `src/api/settings.ts`(`openSettings`)
4. 新建 `src/components/settings/` 目录及各文件
5. `App.tsx`:加 `label === "settings"` 分支
6. `Island.tsx`:移除 `showSettings` 相关,`handleSettings` 改为 `openSettings()` + 收起
7. `Expanded.tsx`:`onSettings` 透传保持,行为在 Island 层处理
8. `islandStore.ts`:移除 `showSettings` / `setShowSettings`
9. 删除 `SettingsPanel.tsx`;清理 `Island.module.css` 中 `settingsContent` 等已无用样式

## 11. 验证标准

- [ ] 灵动岛展开态点击「设置」-> 打开独立设置窗口,island 收起
- [ ] 设置窗口左侧 5 个导航项可切换,右侧内容随之变化
- [ ] 通用页:开机自启 toggle 可读写且即时生效;重置位置按钮可将 island 归位顶部居中
- [ ] 关于页:显示版本号 v0.1.0 与简介
- [ ] 外观/快捷键/贴图页:展示「即将推出」占位,不报错
- [ ] 关闭按钮 -> 窗口隐藏;再次点击设置 -> 窗口重新显示且保留上次所在 tab
- [ ] 重复点击设置 -> 不会新开窗口,而是聚焦已有窗口
- [ ] `pnpm typecheck` 通过
