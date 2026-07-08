import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import { cropImage, type CropRegion } from "../../api/screenshot";
import styles from "./SnipWindow.module.css";

interface CaptureData {
  tempPath: string;
  width: number;
  height: number;
  scaleFactor: number;
}

export function SnipWindow() {
  const [capture, setCapture] = useState<CaptureData | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const win = getCurrentWindow();
    win.show();
    win.setAlwaysOnTop(true);
    win.setFocus();

    let unlisten: (() => void) | null = null;

    const setup = async () => {
      unlisten = await listen<CaptureData>("snip:capture", (event) => {
        const data = event.payload;
        setCapture(data);
        setBgUrl(convertFileSrc(data.tempPath));
      });
      await emit("snip:ready", {});
    };
    setup();

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setStart({ x: e.clientX, y: e.clientY });
    setEnd({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setEnd({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = async () => {
    if (!isDragging || !start || !end || !capture) {
      setIsDragging(false);
      return;
    }
    setIsDragging(false);

    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);

    if (width < 5 || height < 5) {
      setStart(null);
      setEnd(null);
      return;
    }

    const sf = capture.scaleFactor;

    const region: CropRegion = {
      x: Math.round(x * sf),
      y: Math.round(y * sf),
      width: Math.round(width * sf),
      height: Math.round(height * sf),
    };

    try {
      const croppedPath = await cropImage(capture.tempPath, region);
      await emit("snip:complete", { croppedPath });
    } catch (e) {
      console.error("Crop failed:", e);
      await emit("snip:complete", { croppedPath: null });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      emit("snip:cancel", {});
    }
  };

  const selLeft = start && end ? Math.min(start.x, end.x) : 0;
  const selTop = start && end ? Math.min(start.y, end.y) : 0;
  const selW = start && end ? Math.abs(end.x - start.x) : 0;
  const selH = start && end ? Math.abs(end.y - start.y) : 0;

  return (
    <div
      className={styles.overlay}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      autoFocus
    >
      {bgUrl && (
        <img
          src={bgUrl}
          className={styles.bgImage}
          alt="capture"
          draggable={false}
        />
      )}
      <div className={styles.dim} />
      {isDragging && start && end && (
        <div
          className={styles.selection}
          style={{
            left: selLeft,
            top: selTop,
            width: selW,
            height: selH,
          }}
        >
          <div className={styles.selectionBorder} />
        </div>
      )}
      <div className={styles.hint}>
        拖拽选择区域 · ESC 取消
      </div>
    </div>
  );
}
