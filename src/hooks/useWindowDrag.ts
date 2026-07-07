import { useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getMonitorInfo, setWindowPosition } from "../api/island";

export function useWindowDrag() {
  const startDrag = useCallback(async () => {
    const win = getCurrentWindow();
    await win.startDragging();
  }, []);

  const snapToTop = useCallback(async () => {
    const monitor = await getMonitorInfo();
    const win = getCurrentWindow();
    const size = await win.outerSize();
    const winWidthLogical = size.width / monitor.scale_factor;
    const x = Math.round((monitor.width - winWidthLogical) / 2);
    await setWindowPosition(x, 0);
  }, []);

  return { startDrag, snapToTop };
}
