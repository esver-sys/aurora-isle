import { motion } from "framer-motion";
import { Clock } from "lucide-react";
import styles from "./Island.module.css";

export function Pill() {
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, "0")}:${now
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;

  return (
    <motion.div
      className={styles.pillContent}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <Clock size={14} color="rgba(255,255,255,0.7)" />
      <span className={styles.pillTime}>{time}</span>
    </motion.div>
  );
}
