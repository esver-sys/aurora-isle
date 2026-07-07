import { invoke } from "@tauri-apps/api/core";

export async function toggleAutostart(enabled: boolean): Promise<void> {
  await invoke("toggle_autostart", { enabled });
}

export async function isAutostartEnabled(): Promise<boolean> {
  return await invoke("is_autostart_enabled");
}
