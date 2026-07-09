import { useCallback, useRef } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getAllWindows, currentMonitor } from "@tauri-apps/api/window";
import { LogicalSize, LogicalPosition } from "@tauri-apps/api/dpi";
import { save } from "@tauri-apps/plugin-dialog";
import { captureScreen, copyImageToClipboard, saveImageToPath, quickSaveImage, addScreenshotHistory } from "../api/screenshot";
import { pinImage } from "../api/pin";
import type { PinRect } from "../types";

interface HistoryInfo {
  regionX: number;
  regionY: number;
  regionWidth: number;
  regionHeight: number;
  scaleFactor: number;
}

export function useScreenshot() {
  const cleanupRef = useRef<(() => void) | null>(null);

  const takeScreenshot = useCallback(async () => {
    try {
      cleanupRef.current?.();
      cleanupRef.current = null;

      const windows = await getAllWindows();
      const snipWin = windows.find((w) => w.label === "snip");
      if (!snipWin) {
        console.error("Snip window not found");
        return;
      }

      const monitor = await currentMonitor();
      if (!monitor) return;

      const scaleFactor = monitor.scaleFactor;
      const logicalWidth = Math.round(monitor.size.width / scaleFactor);
      const logicalHeight = Math.round(monitor.size.height / scaleFactor);
      const monitorPos = monitor.position;
      const logicalX = monitorPos.x / scaleFactor;
      const logicalY = monitorPos.y / scaleFactor;

      const capturePromise = captureScreen(monitorPos.x, monitorPos.y);

      await snipWin.setSize(new LogicalSize(logicalWidth, logicalHeight));
      await snipWin.setPosition(new LogicalPosition(logicalX, logicalY));

      let unlistenReady: (() => void) | undefined;
      let unlistenComplete: (() => void) | undefined;
      let unlistenCancel: (() => void) | undefined;

      const cleanup = () => {
        unlistenReady?.();
        unlistenComplete?.();
        unlistenCancel?.();
      };
      cleanupRef.current = cleanup;

      [unlistenReady, unlistenComplete, unlistenCancel] = await Promise.all([
        listen("snip:ready", async () => {
          const result = await capturePromise;
          await emit("snip:capture", {
            tempPath: result.temp_path,
            width: result.width,
            height: result.height,
            scaleFactor: result.scale_factor,
            monitorX: logicalX,
            monitorY: logicalY,
          });
        }),
        listen<{
          action: "pin" | "copy" | "save" | "quick_save";
          croppedPath: string | null;
          historyInfo: HistoryInfo | null;
          pinRect?: PinRect;
        }>("snip:complete", async (event) => {
          cleanup();
          cleanupRef.current = null;
          await snipWin.hide();
          if (event.payload.croppedPath) {
            try {
              const { action, croppedPath, historyInfo, pinRect } = event.payload;
              if (action === "pin") {
                await pinImage(croppedPath, pinRect);
              } else if (action === "copy") {
                  await copyImageToClipboard(croppedPath);
                } else if (action === "save") {
                  const destPath = await save({
                    defaultPath: `screenshot_${Date.now()}.png`,
                    filters: [
                      { name: "PNG", extensions: ["png"] },
                      { name: "JPEG", extensions: ["jpg", "jpeg"] },
                      { name: "WebP", extensions: ["webp"] },
                      { name: "BMP", extensions: ["bmp"] },
                    ],
                  });
                  if (destPath) {
                    await saveImageToPath(croppedPath, destPath);
                  }
                } else if (action === "quick_save") {
                  await quickSaveImage(croppedPath);
                }

                if (historyInfo) {
                  await addScreenshotHistory(
                    historyInfo.regionX,
                    historyInfo.regionY,
                    historyInfo.regionWidth,
                    historyInfo.regionHeight,
                    historyInfo.scaleFactor,
                    croppedPath
                  );
                }
              } catch (e) {
                console.error("Screenshot action failed:", e);
              }
            }
          }
        ),
        listen("snip:cancel", async () => {
          cleanup();
          cleanupRef.current = null;
          await snipWin.hide();
        }),
      ]);

      await emit("snip:start", {});
    } catch (e) {
      console.error("Screenshot failed:", e);
    }
  }, []);

  return { takeScreenshot };
}
