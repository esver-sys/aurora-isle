export interface PinRecord {
  id: string;
  file_path: string;
  thumb_path: string | null;
  pos_x: number | null;
  pos_y: number | null;
  scale: number;
  rotation: number;
  opacity: number;
  always_on_top: boolean;
  locked: boolean;
  pinned_open: boolean;
  hidden: boolean;
  flip_h: boolean;
  flip_v: boolean;
  base_width: number | null;
  base_height: number | null;
  created_at: number;
  updated_at: number;
}

export interface PinTransform {
  pos_x?: number;
  pos_y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  always_on_top?: boolean;
  locked?: boolean;
  flip_h?: boolean;
  flip_v?: boolean;
}

export interface MonitorInfo {
  width: number;
  height: number;
  scale_factor: number;
}

export interface ClipboardImageEvent {
  path: string;
  width: number;
  height: number;
}

export interface PinRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
