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
