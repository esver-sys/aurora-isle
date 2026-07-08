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
