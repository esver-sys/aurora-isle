import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { X } from "lucide-react";
import { SettingsNav, type SettingsTab } from "./SettingsNav";
import { GeneralPanel } from "./panels/GeneralPanel";
import { AppearancePanel } from "./panels/AppearancePanel";
import { ShortcutsPanel } from "./panels/ShortcutsPanel";
import { PinPanel } from "./panels/PinPanel";
import { AboutPanel } from "./panels/AboutPanel";
import { SETTINGS_PENDING_TAB_KEY } from "../../api/settings";
import styles from "./SettingsWindow.module.css";

const SETTINGS_TABS: SettingsTab[] = ["general", "appearance", "shortcuts", "pin", "about"];

function isSettingsTab(value: string | null): value is SettingsTab {
  return !!value && SETTINGS_TABS.includes(value as SettingsTab);
}

function takePendingTab(): SettingsTab | null {
  const value = localStorage.getItem(SETTINGS_PENDING_TAB_KEY);
  localStorage.removeItem(SETTINGS_PENDING_TAB_KEY);
  return isSettingsTab(value) ? value : null;
}

export function SettingsWindow() {
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => takePendingTab() ?? "general");

  // 监听外部 `settings:tab` 事件，支持从灵动岛等位置直接跳转到指定标签页
  useEffect(() => {
    const unlistenPromise = listen<string>("settings:tab", (event) => {
      if (isSettingsTab(event.payload)) {
        localStorage.removeItem(SETTINGS_PENDING_TAB_KEY);
        setActiveTab(event.payload);
      }
    });
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

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
          <X size={16} color="rgba(0,0,0,0.6)" />
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
