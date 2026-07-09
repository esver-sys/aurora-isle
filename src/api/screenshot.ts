import { invoke } from "@tauri-apps/api/core";

export interface CaptureResult {
  temp_path: string;
  width: number;
  height: number;
  scale_factor: number;
}

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function captureScreen(monitorX?: number, monitorY?: number): Promise<CaptureResult> {
  return await invoke("capture_screen", { monitorX, monitorY });
}

export async function cropImage(sourcePath: string, region: CropRegion): Promise<string> {
  return await invoke("crop_image", { sourcePath, region });
}

export async function copyImageToClipboard(imagePath: string): Promise<void> {
  return await invoke("copy_image_to_clipboard", { imagePath });
}

export async function saveImageToPath(srcPath: string, destPath: string): Promise<string> {
  return await invoke("save_image_to_path", { srcPath, destPath });
}

export async function quickSaveImage(srcPath: string): Promise<string> {
  return await invoke("quick_save_image", { srcPath });
}

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export async function getWindowAtPoint(x: number, y: number, scaleFactor: number): Promise<WindowRect | null> {
  return await invoke("get_window_at_point", { x, y, scaleFactor });
}

export async function saveImageBytes(bytes: Uint8Array): Promise<string> {
  return await invoke("save_image_bytes", { bytes: Array.from(bytes) });
}

export interface ScreenshotHistoryEntry {
  id: number;
  region_x: number;
  region_y: number;
  region_width: number;
  region_height: number;
  scale_factor: number;
  file_path: string | null;
  created_at: number;
}

export async function addScreenshotHistory(
  regionX: number,
  regionY: number,
  regionWidth: number,
  regionHeight: number,
  scaleFactor: number,
  filePath?: string
): Promise<void> {
  return await invoke("add_screenshot_history", {
    regionX, regionY, regionWidth, regionHeight, scaleFactor, filePath: filePath ?? null,
  });
}

export async function getScreenshotHistory(limit = 20): Promise<ScreenshotHistoryEntry[]> {
  return await invoke("get_screenshot_history", { limit });
}

export async function clearScreenshotHistory(): Promise<void> {
  return await invoke("clear_screenshot_history");
}
