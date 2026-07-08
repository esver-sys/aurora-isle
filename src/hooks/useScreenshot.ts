import { useCallback } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit, listen } from "@tauri-apps/api/event";
import { getAllWindows, type Window } from "@tauri-apps/api/window";
import { captureScreen } from "../api/screenshot";
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

      const result = await captureScreen();

      const logicalWidth = result.width / result.scale_factor;
      const logicalHeight = result.height / result.scale_factor;

      const snipWindow = new WebviewWindow("snip", {
        url: "index.html",
        title: "Snip",
        transparent: true,
        decorations: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        width: logicalWidth,
        height: logicalHeight,
        x: 0,
        y: 0,
      });

      snipWindow.once("tauri://error", (e) => {
        console.error("Snip window creation failed:", e);
      });

      const cleanup = () => {
        unlistenReady?.();
        unlistenComplete?.();
        unlistenCancel?.();
      };

      let unlistenReady = await listen("snip:ready", async () => {
        await emit("snip:capture", {
          tempPath: result.temp_path,
          width: result.width,
          height: result.height,
          scaleFactor: result.scale_factor,
        });
      });

      let unlistenComplete = await listen<{ croppedPath: string | null }>(
        "snip:complete",
        async (event) => {
          cleanup();
          await closeSnipWindow();
          if (event.payload.croppedPath) {
            await pinImage(event.payload.croppedPath);
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
