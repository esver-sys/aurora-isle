import { useCallback, useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Eye, EyeOff, X, Trash2, ImageIcon } from "lucide-react";
import {
  getAllPins,
  getImagePath,
  hidePin,
  showPin,
  unpinImage,
  deletePin,
} from "../../api/pin";
import type { PinRecord } from "../../types";
import styles from "./PinListPanel.module.css";

export function PinListPanel() {
  const [pins, setPins] = useState<PinRecord[]>([]);

  const loadPins = useCallback(async () => {
    try {
      setPins(await getAllPins());
    } catch (e) {
      console.error("Failed to load pins:", e);
    }
  }, []);

  useEffect(() => {
    loadPins();
  }, [loadPins]);

  const handleShow = async (id: string) => {
    try {
      await showPin(id);
      await loadPins();
    } catch (e) {
      console.error("Failed to show pin:", e);
    }
  };

  const handleHide = async (id: string) => {
    try {
      await hidePin(id);
      await loadPins();
    } catch (e) {
      console.error("Failed to hide pin:", e);
    }
  };

  const handleClose = async (id: string) => {
    try {
      await unpinImage(id);
      await loadPins();
    } catch (e) {
      console.error("Failed to close pin:", e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePin(id);
      await loadPins();
    } catch (e) {
      console.error("Failed to delete pin:", e);
    }
  };

  if (pins.length === 0) {
    return (
      <div className={styles.empty}>
        <ImageIcon size={32} color="#555" />
        <p>暂无贴图</p>
      </div>
    );
  }

  return (
    <div className={styles.list}>
      {pins.map((pin) => (
        <PinListItem
          key={pin.id}
          pin={pin}
          onShow={() => handleShow(pin.id)}
          onHide={() => handleHide(pin.id)}
          onClose={() => handleClose(pin.id)}
          onDelete={() => handleDelete(pin.id)}
        />
      ))}
    </div>
  );
}

function PinListItem({
  pin,
  onShow,
  onHide,
  onClose,
  onDelete,
}: {
  pin: PinRecord;
  onShow: () => void;
  onHide: () => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const isDisplaying = pin.pinned_open && !pin.hidden;
  const isHidden = pin.pinned_open && pin.hidden;
  const isClosed = !pin.pinned_open;
  const canShow = isHidden || isClosed;

  useEffect(() => {
    if (!pin.thumb_path) return;
    (async () => {
      try {
        const absPath = await getImagePath(pin.thumb_path!);
        setThumbUrl(convertFileSrc(absPath));
      } catch {
        // 缩略图加载失败时静默处理
      }
    })();
  }, [pin.thumb_path]);

  const timeStr = new Date(pin.created_at * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className={`${styles.item} ${isClosed ? styles.itemClosed : ""}`}>
      {/* 缩略图 */}
      <div className={styles.thumb}>
        {thumbUrl ? (
          <img src={thumbUrl} alt="" className={styles.thumbImg} />
        ) : (
          <ImageIcon size={20} color="#555" />
        )}
      </div>

      {/* 信息 */}
      <div className={styles.info}>
        <span className={styles.time}>{timeStr}</span>
        <span
          className={`${styles.badge} ${
            isDisplaying
              ? styles.badgeActive
              : isHidden
                ? styles.badgeHidden
                : styles.badgeClosed
          }`}
        >
          {isDisplaying ? "显示中" : isHidden ? "已隐藏" : "已关闭"}
        </span>
      </div>

      {/* 操作按钮 */}
      <div className={styles.actions}>
        {canShow && (
          <button className={styles.actBtn} title="显示" onClick={onShow}>
            <Eye size={15} />
          </button>
        )}
        {isDisplaying && (
          <button className={styles.actBtn} title="隐藏" onClick={onHide}>
            <EyeOff size={15} />
          </button>
        )}
        {isDisplaying && (
          <button className={styles.actBtn} title="关闭" onClick={onClose}>
            <X size={15} />
          </button>
        )}
        <button
          className={`${styles.actBtn} ${styles.actBtnDanger}`}
          title="删除"
          onClick={onDelete}
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  );
}
