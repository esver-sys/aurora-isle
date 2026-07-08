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
