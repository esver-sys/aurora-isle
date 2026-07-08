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
