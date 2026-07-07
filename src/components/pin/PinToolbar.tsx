import { useState } from "react";
import { X, RotateCw, Eye, Pin as PinIcon } from "lucide-react";
import { updatePinTransform } from "../../api/pin";
import styles from "./PinWindow.module.css";

interface PinToolbarProps {
  pinId: string;
  onClose: () => void;
}

export function PinToolbar({ pinId, onClose }: PinToolbarProps) {
  const [scale, setScale] = useState(1.0);
  const [opacity, setOpacity] = useState(1.0);

  const handleScale = (v: number) => {
    setScale(v);
    updatePinTransform(pinId, { scale: v });
  };

  const handleOpacity = (v: number) => {
    setOpacity(v);
    updatePinTransform(pinId, { opacity: v });
  };

  const handleRotate = () => {
    const r = 90;
    updatePinTransform(pinId, { rotation: r });
  };

  return (
    <div className={styles.toolbar}>
      <input
        type="range"
        min="0.1"
        max="3"
        step="0.1"
        value={scale}
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
        value={opacity}
        onChange={(e) => handleOpacity(parseFloat(e.target.value))}
        className={styles.slider}
        title="透明度"
      />
      <button className={styles.toolBtn} title="置顶">
        <PinIcon size={14} color="white" />
      </button>
      <button className={styles.toolBtn} title="透明度">
        <Eye size={14} color="white" />
      </button>
      <button className={styles.toolBtn} onClick={onClose} title="关闭">
        <X size={14} color="white" />
      </button>
    </div>
  );
}
