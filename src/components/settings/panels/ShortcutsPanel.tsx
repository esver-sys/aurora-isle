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
