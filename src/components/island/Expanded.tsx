import { motion } from "framer-motion";
import { Pin, Camera, Settings } from "lucide-react";
import styles from "./Island.module.css";

export function Expanded() {
  return (
    <motion.div
      className={styles.expandedContent}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
    >
      <button className={styles.iconBtn} title="贴图">
        <Pin size={18} color="white" />
      </button>
      <button className={styles.iconBtn} title="截图">
        <Camera size={18} color="white" />
      </button>
      <button className={styles.iconBtn} title="设置">
        <Settings size={18} color="white" />
      </button>
    </motion.div>
  );
}
