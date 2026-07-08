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
