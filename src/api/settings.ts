import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

export async function openSettings(): Promise<void> {
  const win = await WebviewWindow.getByLabel("settings");
  if (win) {
    await win.show();
    await win.setFocus();
  }
}
