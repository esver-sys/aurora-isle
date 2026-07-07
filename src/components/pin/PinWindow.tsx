import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getPinById, getImagePath, unpinImage } from "../../api/pin";
import type { PinRecord } from "../../types";
import { PinToolbar } from "./PinToolbar";
import styles from "./PinWindow.module.css";

interface PinWindowProps {
  pinId: string;
}

export function PinWindow({ pinId }: PinWindowProps) {
  const [pin, setPin] = useState<PinRecord | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
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
  }, [pinId]);

  if (!pin || !imageUrl) return null;

  const handleClose = () => unpinImage(pin.id);

  return (
    <div className={styles.container}>
      <img
        src={imageUrl}
        className={styles.pinImage}
        style={{
          transform: `scale(${pin.scale}) rotate(${pin.rotation}deg)`,
          opacity: pin.opacity,
        }}
        draggable={false}
      />
      {!pin.locked && <PinToolbar pinId={pin.id} onClose={handleClose} />}
    </div>
  );
}
