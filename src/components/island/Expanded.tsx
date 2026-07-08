import { motion } from "framer-motion";
import { Camera, Settings } from "lucide-react";
import styles from "./Island.module.css";

interface ExpandedProps {
  onScreenshot: () => void;
  onSettings: () => void;
}

export function Expanded({ onScreenshot, onSettings }: ExpandedProps) {
  return (
    <motion.div
      className={styles.expandedContent}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
    >
      <button
        className={styles.iconBtn}
        title="截图"
        onClick={onScreenshot}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Camera size={18} color="white" />
      </button>
      <button
        className={styles.iconBtn}
        title="设置"
        onClick={onSettings}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <Settings size={18} color="white" />
      </button>
    </motion.div>
  );
}
