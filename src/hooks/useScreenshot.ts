import { useCallback, useRef } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { getAllWindows, currentMonitor } from "@tauri-apps/api/window";
import { LogicalSize, LogicalPosition } from "@tauri-apps/api/dpi";
import { captureScreen, copyImageToClipboard } from "../api/screenshot";
import { pinImage } from "../api/pin";

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

      const capturePromise = captureScreen();

      await snipWin.setSize(new LogicalSize(logicalWidth, logicalHeight));
      await snipWin.setPosition(new LogicalPosition(0, 0));

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
          });
        }),
        listen<{ action: "pin" | "copy"; croppedPath: string | null }>(
          "snip:complete",
          async (event) => {
            cleanup();
            cleanupRef.current = null;
            await snipWin.hide();
            if (event.payload.croppedPath) {
              try {
                if (event.payload.action === "pin") {
                  await pinImage(event.payload.croppedPath);
                } else {
                  await copyImageToClipboard(event.payload.croppedPath);
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
