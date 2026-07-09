import { PinListPanel } from "../../pin/PinListPanel";
import styles from "../SettingsWindow.module.css";

export function PinPanel() {
  return (
    <div className={styles.panel}>
      <h2 className={styles.panelTitle}>贴图管理</h2>
      <PinListPanel />
    </div>
  );
}
