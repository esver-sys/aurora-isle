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

export async function captureScreen(): Promise<CaptureResult> {
  return await invoke("capture_screen");
}

export async function cropImage(sourcePath: string, region: CropRegion): Promise<string> {
  return await invoke("crop_image", { sourcePath, region });
}

export async function copyImageToClipboard(imagePath: string): Promise<void> {
  return await invoke("copy_image_to_clipboard", { imagePath });
}
