import { invoke } from "@tauri-apps/api/core";
import type { MonitorInfo } from "../types";

export async function setWindowSize(width: number, height: number): Promise<void> {
  await invoke("set_window_size", { width, height });
}

export async function setWindowPosition(x: number, y: number): Promise<void> {
  await invoke("set_window_position", { x, y });
}

export async function getWindowPosition(): Promise<[number, number]> {
  return await invoke("get_window_position");
}

export async function getMonitorInfo(): Promise<MonitorInfo> {
  return await invoke("get_monitor_info");
}
