import { invoke } from "@tauri-apps/api/core";

export async function getConfig(key: string): Promise<string | null> {
  return await invoke("get_config", { key });
}

export async function setConfig(key: string, value: string): Promise<void> {
  await invoke("set_config", { key, value });
}
