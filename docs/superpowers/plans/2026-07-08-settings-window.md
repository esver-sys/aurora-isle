# 独立设置窗口 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将设置入口从灵动岛内嵌面板重构为独立 Tauri 窗口,左侧导航 + 右侧配置项,通用/关于做实,其余占位。

**Architecture:** 新增 `settings` 窗口(预定义 + show/hide 单例),`App.tsx` 按 window label 路由到 `SettingsWindow`;island 的设置按钮改为调用 `openSettings()` 显示并聚焦该窗口;移除旧的内嵌 `SettingsPanel`。

**Tech Stack:** Tauri v2 + React 18 + TypeScript + CSS Modules + lucide-react + framer-motion

**测试说明:** 本项目未配置测试框架(`package.json` 无 test 脚本),验证采用 `pnpm typecheck` + 手动验证(对照 spec 第 11 节验证标准)。每个任务末尾跑 typecheck 并提交。

**关联 spec:** `docs/superpowers/specs/2026-07-08-settings-window-design.md`

---

## 文件结构

**新建:**
- `src/api/settings.ts` — `openSettings()` 封装(show + focus 已有 settings 窗口)
- `src/components/settings/SettingsWindow.tsx` — 主窗口:自定义标题栏 + 左右布局 + tab 状态
- `src/components/settings/SettingsWindow.module.css` — 设置窗口全部样式
- `src/components/settings/SettingsNav.tsx` — 左侧导航
- `src/components/settings/panels/GeneralPanel.tsx` — 通用(做实)
- `src/components/settings/panels/AppearancePanel.tsx` — 外观(占位)
- `src/components/settings/panels/ShortcutsPanel.tsx` — 快捷键(占位)
- `src/components/settings/panels/PinPanel.tsx` — 贴图(占位)
- `src/components/settings/panels/AboutPanel.tsx` — 关于(做实)

**修改:**
- `src-tauri/tauri.conf.json` — 注册 `settings` 窗口
- `src-tauri/capabilities/default.json` — `windows` 加 `"settings"`
- `src/App.tsx` — 加 `settings` 路由分支
- `src/components/island/Island.tsx` — 设置按钮改为 `openSettings()` + 收起 island
- `src/stores/islandStore.ts` — 移除 `showSettings` / `setShowSettings`

**删除:**
- `src/components/island/SettingsPanel.tsx`

**不改:** `src/components/island/Expanded.tsx`(`onSettings` 仍是回调,行为在 Island 层改变);`src/styles/global.css`(已是 `background: transparent`,透明窗口无需改动)。

---

### Task 1: 注册 settings 窗口配置

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: 在 `tauri.conf.json` 的 `app.windows` 数组追加 settings 窗口**

将 `src-tauri/tauri.conf.json` 的 `app.windows` 由:

```json
"windows": [
  {
    "label": "island",
    "title": "Aurora Isle",
    "width": 400,
    "height": 60,
    "transparent": true,
    "decorations": false,
    "alwaysOnTop": true,
    "skipTaskbar": true,
    "resizable": false,
    "shadow": false
  }
],
```

改为:

```json
"windows": [
  {
    "label": "island",
    "title": "Aurora Isle",
    "width": 400,
    "height": 60,
    "transparent": true,
    "decorations": false,
    "alwaysOnTop": true,
    "skipTaskbar": true,
    "resizable": false,
    "shadow": false
  },
  {
    "label": "settings",
    "title": "Aurora Isle 设置",
    "url": "index.html",
    "width": 720,
    "height": 520,
    "transparent": true,
    "decorations": false,
    "resizable": false,
    "visible": false,
    "shadow": false
  }
],
```

- [ ] **Step 2: 在 `capabilities/default.json` 的 `windows` 数组加 `"settings"`**

将 `src-tauri/capabilities/default.json` 第 5 行:

```json
"windows": ["island", "pin-*", "snip"],
```

改为:

```json
"windows": ["island", "pin-*", "snip", "settings"],
```

- [ ] **Step 3: 提交**

```bash
git add src-tauri/tauri.conf.json src-tauri/capabilities/default.json
git commit -m "feat(settings): 注册独立设置窗口配置"
```

---

### Task 2: 新建 openSettings API

**Files:**
- Create: `src/api/settings.ts`

- [ ] **Step 1: 创建 `src/api/settings.ts`**

```ts
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export async function openSettings(): Promise<void> {
  const win = await WebviewWindow.getByLabel("settings");
  if (win) {
    await win.show();
    await win.setFocus();
  }
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: 无错误退出

- [ ] **Step 3: 提交**

```bash
git add src/api/settings.ts
git commit -m "feat(settings): 新增 openSettings 窗口控制封装"
```

---

### Task 3: 设置窗口骨架与路由

本任务搭建窗口主框架、左侧导航、样式,以及三个占位面板。`GeneralPanel` / `AboutPanel` 先放最简骨架,Task 4 / Task 5 再填充做实内容。

**Files:**
- Create: `src/components/settings/SettingsWindow.module.css`
- Create: `src/components/settings/SettingsNav.tsx`
- Create: `src/components/settings/panels/AppearancePanel.tsx`
- Create: `src/components/settings/panels/ShortcutsPanel.tsx`
- Create: `src/components/settings/panels/PinPanel.tsx`
- Create: `src/components/settings/panels/GeneralPanel.tsx`(最简骨架)
- Create: `src/components/settings/panels/AboutPanel.tsx`(最简骨架)
- Create: `src/components/settings/SettingsWindow.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 `src/components/settings/SettingsWindow.module.css`**

```css
.window {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: rgba(20, 20, 20, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 12px;
  overflow: hidden;
  color: rgba(255, 255, 255, 0.9);
}

.titlebar {
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  user-select: none;
}

.title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
}

.closeBtn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
}

.closeBtn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.body {
  flex: 1;
  display: flex;
  min-height: 0;
}

.nav {
  width: 180px;
  flex-shrink: 0;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  overflow-y: auto;
}

.navItem {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border: none;
  background: none;
  cursor: pointer;
  border-radius: 8px;
  text-align: left;
  position: relative;
  transition: background 0.15s ease;
}

.navItem:hover {
  background: rgba(255, 255, 255, 0.06);
}

.navItemActive {
  background: rgba(255, 255, 255, 0.1);
}

.navItemActive::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 16px;
  border-radius: 2px;
  background: rgba(0, 150, 255, 0.9);
}

.navLabel {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.75);
}

.navItemActive .navLabel {
  color: rgba(255, 255, 255, 0.95);
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 24px 28px;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.panelTitle {
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  margin: 0 0 12px 0;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
}

.rowInfo {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.rowLabel {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.9);
}

.rowDesc {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.actionBtn {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease;
  flex-shrink: 0;
}

.actionBtn:hover {
  background: rgba(255, 255, 255, 0.12);
}

.toggle {
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.15);
  border: none;
  cursor: pointer;
  position: relative;
  padding: 0;
  transition: background 0.2s ease;
  flex-shrink: 0;
}

.toggleOn {
  background: rgba(0, 150, 255, 0.85);
}

.toggleKnob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  transition: transform 0.2s ease;
}

.toggleOn .toggleKnob {
  transform: translateX(16px);
}

.placeholder {
  margin-top: 8px;
  padding: 32px 16px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.placeholderText {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
}

.placeholderSub {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
}

.kbd {
  padding: 3px 10px;
  border-radius: 5px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.6);
  font-size: 11px;
  font-family: inherit;
  flex-shrink: 0;
}

.aboutBlock {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.03);
}

.aboutName {
  font-size: 18px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.95);
}

.aboutVersion {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.aboutDesc {
  margin: 12px 0 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.55);
}
```

- [ ] **Step 2: 创建 `src/components/settings/SettingsNav.tsx`**

```tsx
import { Settings, Palette, Keyboard, Image as ImageIcon, Info } from "lucide-react";
import styles from "./SettingsWindow.module.css";

export type SettingsTab =
  | "general"
  | "appearance"
  | "shortcuts"
  | "pin"
  | "about";

interface SettingsNavProps {
  active: SettingsTab;
  onChange: (tab: SettingsTab) => void;
}

const NAV_ITEMS: {
  key: SettingsTab;
  label: string;
  icon: typeof Settings;
}[] = [
  { key: "general", label: "通用", icon: Settings },
  { key: "appearance", label: "外观", icon: Palette },
  { key: "shortcuts", label: "快捷键", icon: Keyboard },
  { key: "pin", label: "贴图", icon: ImageIcon },
  { key: "about", label: "关于", icon: Info },
];

export function SettingsNav({ active, onChange }: SettingsNavProps) {
  return (
    <nav className={styles.nav}>
      {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          className={`${styles.navItem} ${
            active === key ? styles.navItemActive : ""
          }`}
          onClick={() => onChange(key)}
        >
          <Icon
            size={16}
            color={active === key ? "white" : "rgba(255,255,255,0.6)"}
          />
          <span className={styles.navLabel}>{label}</span>
        </button>
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: 创建三个占位面板**

`src/components/settings/panels/AppearancePanel.tsx`:

```tsx
import styles from "../SettingsWindow.module.css";

export function AppearancePanel() {
  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>外观</h2>
      <div className={styles.placeholder}>
        <span className={styles.placeholderText}>即将推出</span>
        <span className={styles.placeholderSub}>
          主题色 · 胶囊尺寸 · 圆角 · 透明度
        </span>
      </div>
    </div>
  );
}
```

`src/components/settings/panels/ShortcutsPanel.tsx`:

```tsx
import styles from "../SettingsWindow.module.css";

export function ShortcutsPanel() {
  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>快捷键</h2>
      <div className={styles.row}>
        <div className={styles.rowInfo}>
          <span className={styles.rowLabel}>截图</span>
          <span className={styles.rowDesc}>未绑定(待配置)</span>
        </div>
        <kbd className={styles.kbd}>待定</kbd>
      </div>
      <div className={styles.row}>
        <div className={styles.rowInfo}>
          <span className={styles.rowLabel}>唤起灵动岛</span>
          <span className={styles.rowDesc}>未绑定(待配置)</span>
        </div>
        <kbd className={styles.kbd}>待定</kbd>
      </div>
      <div className={styles.placeholder}>
        <span className={styles.placeholderText}>即将推出</span>
      </div>
    </div>
  );
}
```

`src/components/settings/panels/PinPanel.tsx`:

```tsx
import styles from "../SettingsWindow.module.css";

export function PinPanel() {
  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>贴图</h2>
      <div className={styles.placeholder}>
        <span className={styles.placeholderText}>即将推出</span>
        <span className={styles.placeholderSub}>
          默认透明度 · 默认置顶
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 创建 `GeneralPanel` 与 `AboutPanel` 最简骨架(后续任务填充)**

`src/components/settings/panels/GeneralPanel.tsx`:

```tsx
import styles from "../SettingsWindow.module.css";

export function GeneralPanel() {
  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>通用设置</h2>
    </div>
  );
}
```

`src/components/settings/panels/AboutPanel.tsx`:

```tsx
import styles from "../SettingsWindow.module.css";

export function AboutPanel() {
  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>关于</h2>
    </div>
  );
}
```

- [ ] **Step 5: 创建 `src/components/settings/SettingsWindow.tsx`**

```tsx
import { useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X } from "lucide-react";
import { SettingsNav, type SettingsTab } from "./SettingsNav";
import { GeneralPanel } from "./panels/GeneralPanel";
import { AppearancePanel } from "./panels/AppearancePanel";
import { ShortcutsPanel } from "./panels/ShortcutsPanel";
import { PinPanel } from "./panels/PinPanel";
import { AboutPanel } from "./panels/AboutPanel";
import styles from "./SettingsWindow.module.css";

export function SettingsWindow() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const handleClose = async () => {
    await getCurrentWindow().hide();
  };

  return (
    <div className={styles.window}>
      <div className={styles.titlebar} data-tauri-drag-region>
        <span className={styles.title}>设置</span>
        <button
          className={styles.closeBtn}
          title="关闭"
          onClick={handleClose}
        >
          <X size={16} color="rgba(255,255,255,0.7)" />
        </button>
      </div>
      <div className={styles.body}>
        <SettingsNav active={activeTab} onChange={setActiveTab} />
        <main className={styles.content}>
          {activeTab === "general" && <GeneralPanel />}
          {activeTab === "appearance" && <AppearancePanel />}
          {activeTab === "shortcuts" && <ShortcutsPanel />}
          {activeTab === "pin" && <PinPanel />}
          {activeTab === "about" && <AboutPanel />}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 在 `src/App.tsx` 加 settings 路由分支**

将 `src/App.tsx` 整体替换为:

```tsx
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Island } from "./components/island/Island";
import { PinWindow } from "./components/pin/PinWindow";
import { SnipWindow } from "./components/snip/SnipWindow";
import { SettingsWindow } from "./components/settings/SettingsWindow";

function App() {
  const label = getCurrentWindow().label;

  if (label.startsWith("pin-")) {
    const pinId = label.slice(4);
    return <PinWindow pinId={pinId} />;
  }

  if (label === "snip") {
    return <SnipWindow />;
  }

  if (label === "settings") {
    return <SettingsWindow />;
  }

  return <Island />;
}

export default App;
```

- [ ] **Step 7: typecheck**

Run: `pnpm typecheck`
Expected: 无错误退出

- [ ] **Step 8: 提交**

```bash
git add src/components/settings src/App.tsx
git commit -m "feat(settings): 新增设置窗口骨架与路由"
```

---

### Task 4: GeneralPanel 做实

**Files:**
- Modify: `src/components/settings/panels/GeneralPanel.tsx`(整体替换)

- [ ] **Step 1: 用做实版本替换 `GeneralPanel.tsx`**

```tsx
import { useEffect, useState } from "react";
import { isAutostartEnabled, toggleAutostart } from "../../../api/system";
import { getMonitorInfo, setWindowPosition } from "../../../api/island";
import styles from "../SettingsWindow.module.css";

export function GeneralPanel() {
  const [autostart, setAutostart] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    isAutostartEnabled()
      .then(setAutostart)
      .catch(() => {});
  }, []);

  const handleToggleAutostart = async () => {
    setLoading(true);
    try {
      const next = !autostart;
      await toggleAutostart(next);
      setAutostart(next);
    } catch (e) {
      console.error("Toggle autostart failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPosition = async () => {
    try {
      const monitor = await getMonitorInfo();
      const winWidth = 400;
      const x = Math.round((monitor.width - winWidth) / 2);
      await setWindowPosition(x, 0);
    } catch (e) {
      console.error("Reset position failed:", e);
    }
  };

  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>通用设置</h2>
      <div className={styles.row}>
        <div className={styles.rowInfo}>
          <span className={styles.rowLabel}>开机自启</span>
          <span className={styles.rowDesc}>登录系统时自动启动 Aurora Isle</span>
        </div>
        <button
          className={`${styles.toggle} ${autostart ? styles.toggleOn : ""}`}
          onClick={handleToggleAutostart}
          disabled={loading}
        >
          <span className={styles.toggleKnob} />
        </button>
      </div>
      <div className={styles.row}>
        <div className={styles.rowInfo}>
          <span className={styles.rowLabel}>重置位置</span>
          <span className={styles.rowDesc}>将灵动岛归位到屏幕顶部居中</span>
        </div>
        <button className={styles.actionBtn} onClick={handleResetPosition}>
          重置
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: 无错误退出

- [ ] **Step 3: 提交**

```bash
git add src/components/settings/panels/GeneralPanel.tsx
git commit -m "feat(settings): 通用面板实现开机自启与重置位置"
```

---

### Task 5: AboutPanel 做实

**Files:**
- Modify: `src/components/settings/panels/AboutPanel.tsx`(整体替换)

- [ ] **Step 1: 用做实版本替换 `AboutPanel.tsx`**

```tsx
import styles from "../SettingsWindow.module.css";

export function AboutPanel() {
  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>关于</h2>
      <div className={styles.aboutBlock}>
        <div className={styles.aboutName}>Aurora Isle</div>
        <div className={styles.aboutVersion}>版本 0.1.0</div>
      </div>
      <p className={styles.aboutDesc}>
        Aurora Isle 是一款 Windows 桌面「灵动岛」应用,提供胶囊态信息展示、
        桌面贴图与截图选区等功能。
      </p>
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

Run: `pnpm typecheck`
Expected: 无错误退出

- [ ] **Step 3: 提交**

```bash
git add src/components/settings/panels/AboutPanel.tsx
git commit -m "feat(settings): 关于面板展示版本与简介"
```

---

### Task 6: 接入灵动岛入口并清理旧面板

**Files:**
- Modify: `src/stores/islandStore.ts`
- Modify: `src/components/island/Island.tsx`
- Delete: `src/components/island/SettingsPanel.tsx`

- [ ] **Step 1: 精简 `src/stores/islandStore.ts`(移除 showSettings)**

整体替换为:

```ts
import { create } from "zustand";

type IslandMode = "pill" | "expanded";

interface IslandState {
  mode: IslandMode;
  isIgnoringCursor: boolean;
  isHovering: boolean;
  setMode: (mode: IslandMode) => void;
  setIgnoringCursor: (ignoring: boolean) => void;
  setHovering: (hovering: boolean) => void;
}

export const useIslandStore = create<IslandState>((set) => ({
  mode: "pill",
  isIgnoringCursor: true,
  isHovering: false,
  setMode: (mode) => set({ mode }),
  setIgnoringCursor: (isIgnoringCursor) => set({ isIgnoringCursor }),
  setHovering: (isHovering) => set({ isHovering }),
}));
```

- [ ] **Step 2: 改 `src/components/island/Island.tsx`(设置按钮改为打开窗口 + 收起)**

整体替换为:

```tsx
import { useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pill } from "./Pill";
import { Expanded } from "./Expanded";
import { useIslandStore } from "../../stores/islandStore";
import { useCursorEvents } from "../../hooks/useCursorEvents";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import { useScreenshot } from "../../hooks/useScreenshot";
import { openSettings } from "../../api/settings";
import styles from "./Island.module.css";

export function Island() {
  const { mode, setMode, setHovering } = useIslandStore();
  const { startDrag, snapToTop } = useWindowDrag();
  const { takeScreenshot } = useScreenshot();

  useEffect(() => {
    snapToTop();
  }, [snapToTop]);

  const { handleMouseEnter, handleMouseLeave } = useCursorEvents(
    () => {
      setHovering(true);
      setMode("expanded");
    },
    () => {
      setHovering(false);
      setMode("pill");
    }
  );

  const handleScreenshot = useCallback(() => {
    setMode("pill");
    takeScreenshot();
  }, [takeScreenshot, setMode]);

  const handleSettings = useCallback(() => {
    setMode("pill");
    openSettings();
  }, [setMode]);

  return (
    <div className={styles.container}>
      <motion.div
        data-pill-hitbox
        layout
        className={styles.island}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerDown={startDrag}
      >
        <AnimatePresence mode="wait">
          {mode === "pill" ? (
            <Pill key="pill" />
          ) : (
            <Expanded
              key="expanded"
              onScreenshot={handleScreenshot}
              onSettings={handleSettings}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 3: 删除旧 `src/components/island/SettingsPanel.tsx`**

```bash
git rm src/components/island/SettingsPanel.tsx
```

- [ ] **Step 4: typecheck**

Run: `pnpm typecheck`
Expected: 无错误退出(确认无对 `SettingsPanel` / `showSettings` 的残留引用)

- [ ] **Step 5: 提交**

```bash
git add src/stores/islandStore.ts src/components/island/Island.tsx
git commit -m "feat(settings): 灵动岛设置入口改为打开独立窗口并清理旧面板"
```

---

### Task 7: 最终验证

**Files:** 无修改(仅验证)

- [ ] **Step 1: typecheck**

Run: `pnpm typecheck`
Expected: 无错误退出

- [ ] **Step 2: 启动应用手动验证**

Run: `pnpm tauri dev`

对照 spec 第 11 节验证标准逐项确认:

- [ ] 灵动岛展开态点击「设置」→ 打开独立设置窗口,island 收起
- [ ] 设置窗口左侧 5 个导航项可切换,右侧内容随之变化
- [ ] 通用页:开机自启 toggle 可读写且即时生效;重置位置按钮可将 island 归位顶部居中
- [ ] 关于页:显示版本号 v0.1.0 与简介
- [ ] 外观/快捷键/贴图页:展示「即将推出」占位,不报错
- [ ] 关闭按钮 → 窗口隐藏;再次点击设置 → 窗口重新显示且保留上次所在 tab
- [ ] 重复点击设置 → 不会新开窗口,而是聚焦已有窗口

- [ ] **Step 3: 若验证中发现问题则修复并追加提交,否则无需提交**

---

## Self-Review

**1. Spec coverage:**
- 独立 Tauri 窗口 → Task 1 注册 + Task 3 路由 ✓
- 左侧导航 5 分组 → Task 3 SettingsNav ✓
- 右侧配置项 → Task 3 内容区 + Task 4/5 做实 ✓
- 通用做实(开机自启/重置位置)→ Task 4 ✓
- 关于做实(版本/简介)→ Task 5 ✓
- 外观/快捷键/贴图占位 → Task 3 Step 3 ✓
- 移除 island 内置 SettingsPanel + showSettings → Task 6 ✓
- show/hide 单例 → Task 2 openSettings + Task 3 handleClose(hide) ✓
- 验证标准 7 项 → Task 7 ✓

**2. Placeholder scan:** 无 TBD/TODO;GeneralPanel/AboutPanel 在 Task 3 是「最简骨架」(可编译的真实组件),非文档占位符,Task 4/5 给出完整做实代码。✓

**3. Type consistency:** `SettingsTab` 类型在 SettingsNav 定义、SettingsWindow 使用,值 `"general"|"appearance"|"shortcuts"|"pin"|"about"` 一致;`openSettings` 签名在 Task 2 定义、Task 6 调用一致;`isAutostartEnabled/toggleAutostart/getMonitorInfo/setWindowPosition` 与现有 `api/system.ts`/`api/island.ts` 签名一致。✓
