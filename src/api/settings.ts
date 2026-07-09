import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";

export const SETTINGS_PENDING_TAB_KEY = "aurora-isle:settings-pending-tab";

export async function openSettings(): Promise<void> {
  const win = await WebviewWindow.getByLabel("settings");
  if (win) {
    await win.show();
    await win.setFocus();
  }
}

// 打开设置窗口并切换到指定标签页
export async function openSettingsTab(tab: string): Promise<void> {
  localStorage.setItem(SETTINGS_PENDING_TAB_KEY, tab);
  await openSettings();
  await emit("settings:tab", tab);
}
