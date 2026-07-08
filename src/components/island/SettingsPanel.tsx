import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Power } from "lucide-react";
import { isAutostartEnabled, toggleAutostart } from "../../api/system";
import { getMonitorInfo, setWindowPosition } from "../../api/island";
import styles from "./Island.module.css";

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
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
    <motion.div
      className={styles.settingsContent}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
    >
      <button
        className={styles.iconBtn}
        title="返回"
        onClick={onClose}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ChevronLeft size={18} color="white" />
      </button>

      <div className={styles.settingsRow}>
        <span className={styles.settingsLabel}>开机自启</span>
        <button
          className={`${styles.toggle} ${autostart ? styles.toggleOn : ""}`}
          onClick={handleToggleAutostart}
          disabled={loading}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className={styles.toggleKnob} />
        </button>
      </div>

      <button
        className={styles.settingsRow}
        onClick={handleResetPosition}
        onPointerDown={(e) => e.stopPropagation()}
        style={{ border: "none", background: "none", cursor: "pointer", width: "100%" }}
      >
        <span className={styles.settingsLabel}>重置位置</span>
      </button>

      <div className={styles.settingsFooter}>
        <Power size={12} color="rgba(255,255,255,0.3)" />
        <span className={styles.settingsVersion}>Aurora Isle v0.1.0</span>
      </div>
    </motion.div>
  );
}
