import { invoke } from "@tauri-apps/api/core";
import type { PinRecord, PinTransform } from "../types";

export async function pinImage(tempPath: string): Promise<string> {
  return await invoke("pin_image", { tempPath });
}

export async function unpinImage(id: string): Promise<void> {
  await invoke("unpin_image", { id });
}

export async function hidePin(id: string): Promise<void> {
  await invoke("hide_pin", { id });
}

export async function showPin(id: string): Promise<void> {
  await invoke("show_pin", { id });
}

export async function deletePin(id: string): Promise<void> {
  await invoke("delete_pin", { id });
}

export async function updatePinTransform(id: string, transform: PinTransform): Promise<void> {
  await invoke("update_pin_transform", { id, transform });
}

export async function getOpenPins(): Promise<PinRecord[]> {
  return await invoke("get_open_pins");
}

export async function getAllPins(): Promise<PinRecord[]> {
  return await invoke("get_all_pins");
}

export async function getPinById(id: string): Promise<PinRecord> {
  return await invoke("get_pin_by_id", { id });
}

export async function getImagePath(fileRel: string): Promise<string> {
  return await invoke("get_image_path", { fileRel });
}
