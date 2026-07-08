import { type PointerEvent, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getPinById, getImagePath, unpinImage, updatePinTransform } from "../../api/pin";
import type { PinRecord, PinTransform } from "../../types";
import { PinToolbar } from "./PinToolbar";
import styles from "./PinWindow.module.css";

interface PinWindowProps {
  pinId: string;
}

export function PinWindow({ pinId }: PinWindowProps) {
  const [pin, setPin] = useState<PinRecord | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const win = getCurrentWindow();
    (async () => {
      try {
        const record = await getPinById(pinId);
        setPin(record);
        const absPath = await getImagePath(record.file_path);
        setImageUrl(convertFileSrc(absPath));
      } catch (e) {
        console.error("Failed to load pin:", e);
      }
    })();

    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await win.onMoved(({ payload }) => {
        // 简单逻辑：沿用已有 pos_x/pos_y 字段，记录用户拖动后的物理窗口坐标。
        updatePinTransform(pinId, { pos_x: payload.x, pos_y: payload.y }).catch((e) => {
          console.error("Failed to persist pin position:", e);
        });
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [pinId]);

  if (!pin || !imageUrl) return null;

  const handleClose = () => unpinImage(pin.id);

  const handleTransformChange = async (transform: PinTransform) => {
    const previousPin = pin;

    // 核心逻辑：先乐观刷新当前窗口，让缩放/旋转/透明度操作立即反馈，再异步落库。
    setPin((current) =>
      current
        ? {
            ...current,
            scale: transform.scale ?? current.scale,
            rotation: transform.rotation ?? current.rotation,
            opacity: transform.opacity ?? current.opacity,
          }
        : current
    );

    try {
      await updatePinTransform(pin.id, transform);
    } catch (e) {
      console.error("Failed to update pin transform:", e);
      setPin(previousPin);
    }
  };

  const handlePointerDown = async (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest("[data-pin-toolbar]")) return;

    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error("Failed to start pin dragging:", err);
    }
  };

  return (
    <div className={styles.container} onPointerDown={handlePointerDown}>
      <img
        src={imageUrl}
        className={styles.pinImage}
        style={{
          transform: `scale(${pin.scale}) rotate(${pin.rotation}deg)`,
          opacity: pin.opacity,
        }}
        draggable={false}
      />
      {!pin.locked && (
        <PinToolbar
          pin={pin}
          onTransformChange={handleTransformChange}
          onClose={handleClose}
        />
      )}
    </div>
  );
}
