import { X, RotateCw, Pin as PinIcon } from "lucide-react";
import type { PinRecord, PinTransform } from "../../types";
import styles from "./PinWindow.module.css";

interface PinToolbarProps {
  pin: PinRecord;
  onTransformChange: (transform: PinTransform) => void;
  onClose: () => void;
}

export function PinToolbar({ pin, onTransformChange, onClose }: PinToolbarProps) {
  const handleScale = (v: number) => {
    onTransformChange({ scale: v });
  };

  const handleOpacity = (v: number) => {
    onTransformChange({ opacity: v });
  };

  const handleRotate = () => {
    // 简单逻辑：每次点击顺时针旋转 90 度，并把角度限制在 0-359。
    onTransformChange({ rotation: (pin.rotation + 90) % 360 });
  };

  return (
    <div
      className={styles.toolbar}
      data-pin-toolbar
      onPointerDown={(e) => e.stopPropagation()}
    >
      <input
        type="range"
        min="0.1"
        max="3"
        step="0.1"
        value={pin.scale}
        onChange={(e) => handleScale(parseFloat(e.target.value))}
        className={styles.slider}
        title="缩放"
      />
      <button className={styles.toolBtn} onClick={handleRotate} title="旋转">
        <RotateCw size={14} color="white" />
      </button>
      <input
        type="range"
        min="0.2"
        max="1"
        step="0.05"
        value={pin.opacity}
        onChange={(e) => handleOpacity(parseFloat(e.target.value))}
        className={styles.slider}
        title="透明度"
      />
      <button className={styles.toolBtn} title="置顶（待实现）" disabled>
        <PinIcon size={14} color="white" />
      </button>
      <button className={styles.toolBtn} onClick={onClose} title="关闭">
        <X size={14} color="white" />
      </button>
    </div>
  );
}
