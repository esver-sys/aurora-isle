import { useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Pill } from "./Pill";
import { Expanded } from "./Expanded";
import { useIslandStore } from "../../stores/islandStore";
import { useCursorEvents } from "../../hooks/useCursorEvents";
import { useWindowDrag } from "../../hooks/useWindowDrag";
import { useScreenshot } from "../../hooks/useScreenshot";
import { openSettings } from "../../api/settings";
import styles from "./Island.module.css";

export function Island() {
  const { mode, setMode, setHovering } = useIslandStore();
  const { startDrag, snapToTop } = useWindowDrag();
  const { takeScreenshot } = useScreenshot();

  useEffect(() => {
    snapToTop();
  }, [snapToTop]);

  const { handleMouseEnter, handleMouseLeave } = useCursorEvents(
    () => {
      setHovering(true);
      setMode("expanded");
    },
    () => {
      setHovering(false);
      setMode("pill");
    }
  );

  const handleScreenshot = useCallback(() => {
    setMode("pill");
    takeScreenshot();
  }, [takeScreenshot, setMode]);

  const handleSettings = useCallback(() => {
    setMode("pill");
    openSettings();
  }, [setMode]);

  return (
    <div className={styles.container}>
      <motion.div
        data-pill-hitbox
        layout
        className={styles.island}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerDown={startDrag}
      >
        <AnimatePresence mode="wait">
          {mode === "pill" ? (
            <Pill key="pill" />
          ) : (
            <Expanded
              key="expanded"
              onScreenshot={handleScreenshot}
              onSettings={handleSettings}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
