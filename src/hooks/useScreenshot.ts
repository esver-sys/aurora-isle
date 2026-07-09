import { useCallback } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit, listen } from "@tauri-apps/api/event";
import { getAllWindows, currentMonitor, type Window } from "@tauri-apps/api/window";
import { captureScreen, copyImageToClipboard } from "../api/screenshot";
import { pinImage } from "../api/pin";

async function closeSnipWindow() {
  const windows = await getAllWindows();
  const snipWin = windows.find((w: Window) => w.label === "snip");
  if (snipWin) await snipWin.close();
}

export function useScreenshot() {
  const takeScreenshot = useCallback(async () => {
    try {
      await closeSnipWindow();

      const monitor = await currentMonitor();
      if (!monitor) return;

      const scaleFactor = monitor.scaleFactor;
      const logicalWidth = Math.round(monitor.size.width / scaleFactor);
      const logicalHeight = Math.round(monitor.size.height / scaleFactor);

      const snipWindow = new WebviewWindow("snip", {
        url: "index.html",
        title: "Snip",
        transparent: true,
        decorations: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        visible: false,
        width: logicalWidth,
        height: logicalHeight,
        x: 0,
        y: 0,
      });

      snipWindow.once("tauri://error", (e) => {
        console.error("Snip window creation failed:", e);
      });

      const capturePromise = captureScreen();

      const cleanup = () => {
        unlistenReady?.();
        unlistenComplete?.();
        unlistenCancel?.();
      };

      let unlistenReady = await listen("snip:ready", async () => {
        const result = await capturePromise;
        await emit("snip:capture", {
          tempPath: result.temp_path,
          width: result.width,
          height: result.height,
          scaleFactor: result.scale_factor,
        });
      });

      let unlistenComplete = await listen<{
        action: "pin" | "copy";
        croppedPath: string | null;
      }>(
        "snip:complete",
        async (event) => {
          cleanup();
          await closeSnipWindow();
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
      );

      let unlistenCancel = await listen("snip:cancel", async () => {
        cleanup();
        await closeSnipWindow();
      });
    } catch (e) {
      console.error("Screenshot failed:", e);
    }
  }, []);

  return { takeScreenshot };
}
