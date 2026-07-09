import { type PointerEvent, type WheelEvent, useCallback, useEffect, useRef, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalPosition, LogicalSize, PhysicalPosition } from "@tauri-apps/api/dpi";
import { Menu, type MenuOptions } from "@tauri-apps/api/menu";
import { save } from "@tauri-apps/plugin-dialog";
import { getPinById, getImagePath, unpinImage, hidePin, deletePin, updatePinTransform } from "../../api/pin";
import { copyImageToClipboard, saveImageToPath } from "../../api/screenshot";
import type { PinRecord, PinTransform } from "../../types";
import styles from "./PinWindow.module.css";

interface PinWindowProps {
  pinId: string;
}

const SCALE_MIN = 0.1;
const SCALE_MAX = 5.0;
const SCALE_STEP = 0.1;
const MOVE_STEP = 1;
const MOVE_STEP_FAST = 10;
const OPACITY_PRESETS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

export function PinWindow({ pinId }: PinWindowProps) {
  const [pin, setPin] = useState<PinRecord | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // 缓存图片绝对路径，用于复制/保存操作
  const absImagePathRef = useRef<string>("");
  // 缓存当前原生菜单资源，新菜单打开前释放旧资源，避免频繁右键积累资源。
  const menuRef = useRef<Menu | null>(null);
  // 滚轮事件可能密集触发，使用 ref 保存即时 scale，避免连续滚动时读到 React 旧状态。
  const scaleRef = useRef(1);
  // 记录未缩放时的窗口尺寸，后续 scale 只改变窗口大小，避免图片 CSS 放大后被裁切。
  const baseWindowSizeRef = useRef<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const win = getCurrentWindow();
    (async () => {
      try {
        const record = await getPinById(pinId);
        setPin(record);
        const absPath = await getImagePath(record.file_path);
        absImagePathRef.current = absPath;
        setImageUrl(convertFileSrc(absPath));

        // 应用置顶状态到窗口
        await win.setAlwaysOnTop(record.always_on_top);
        const safeScale = Math.max(record.scale, SCALE_MIN);
        scaleRef.current = safeScale;
        baseWindowSizeRef.current = {
          width: window.innerWidth / safeScale,
          height: window.innerHeight / safeScale,
        };
      } catch (e) {
        console.error("Failed to load pin:", e);
      }
    })();

    // 窗口移动后持久化坐标
    let unlisten: (() => void) | null = null;
    (async () => {
      unlisten = await win.onMoved(({ payload }) => {
        updatePinTransform(pinId, { pos_x: payload.x, pos_y: payload.y }).catch((e) => {
          console.error("Failed to persist pin position:", e);
        });
      });
    })();

    return () => {
      if (unlisten) unlisten();
    };
  }, [pinId]);

  useEffect(() => {
    return () => {
      menuRef.current?.close().catch((e) => console.error("Failed to close pin menu resource:", e));
    };
  }, []);

  // 通用变换更新：先乐观刷新本地状态，再异步落库，失败回滚
  const updateTransform = useCallback(
    async (changes: Partial<PinRecord>, transform: PinTransform) => {
      if (!pin) return false;
      const previous = pin;
      setPin((current) => (current ? { ...current, ...changes } : current));
      try {
        await updatePinTransform(pin.id, transform);
        return true;
      } catch (e) {
        console.error("Failed to update pin transform:", e);
        setPin(previous);
        return false;
      }
    },
    [pin]
  );

  const resizeWindowForScale = useCallback(async (scale: number, anchor?: { x: number; y: number }) => {
    const baseSize = baseWindowSizeRef.current;
    if (!baseSize) return;

    const win = getCurrentWindow();
    const oldWidth = window.innerWidth;
    const oldHeight = window.innerHeight;
    const nextWidth = Math.max(1, Math.round(baseSize.width * scale));
    const nextHeight = Math.max(1, Math.round(baseSize.height * scale));
    const pos = anchor && oldWidth > 0 && oldHeight > 0 ? await win.outerPosition() : null;

    await win.setSize(new LogicalSize(nextWidth, nextHeight));

    if (!anchor || !pos || oldWidth <= 0 || oldHeight <= 0) return;

    // 核心逻辑：滚轮缩放时根据光标在窗口内的比例反推左上角偏移，尽量保持光标下的图片位置不跳动。
    const ratioX = anchor.x / oldWidth;
    const ratioY = anchor.y / oldHeight;
    const dpr = window.devicePixelRatio || 1;
    const deltaX = Math.round((nextWidth - oldWidth) * ratioX * dpr);
    const deltaY = Math.round((nextHeight - oldHeight) * ratioY * dpr);
    await win.setPosition(new PhysicalPosition(pos.x - deltaX, pos.y - deltaY));
  }, []);

  const applyScale = useCallback(
    async (nextScale: number, anchor?: { x: number; y: number }) => {
      if (!pin) return;
      const previousScale = scaleRef.current;
      scaleRef.current = nextScale;
      await resizeWindowForScale(nextScale, anchor);
      const ok = await updateTransform({ scale: nextScale }, { scale: nextScale });
      if (!ok) {
        scaleRef.current = previousScale;
        await resizeWindowForScale(previousScale);
      }
    },
    [pin, resizeWindowForScale, updateTransform]
  );

  // ===== 右键菜单回调 =====

  const handleToggleAlwaysOnTop = useCallback(async () => {
    if (!pin) return;
    const newVal = !pin.always_on_top;
    const ok = await updateTransform({ always_on_top: newVal }, { always_on_top: newVal });
    if (ok) {
      await getCurrentWindow().setAlwaysOnTop(newVal);
    }
  }, [pin, updateTransform]);

  const handleToggleLocked = useCallback(() => {
    if (!pin) return;
    updateTransform({ locked: !pin.locked }, { locked: !pin.locked });
  }, [pin, updateTransform]);

  const handleSetOpacity = useCallback(
    (v: number) => {
      updateTransform({ opacity: v }, { opacity: v });
    },
    [updateTransform]
  );

  const handleToggleFlipH = useCallback(() => {
    if (!pin) return;
    updateTransform({ flip_h: !pin.flip_h }, { flip_h: !pin.flip_h });
  }, [pin, updateTransform]);

  const handleToggleFlipV = useCallback(() => {
    if (!pin) return;
    updateTransform({ flip_v: !pin.flip_v }, { flip_v: !pin.flip_v });
  }, [pin, updateTransform]);

  const handleRotate90 = useCallback(() => {
    if (!pin) return;
    const newRotation = (pin.rotation + 90) % 360;
    updateTransform({ rotation: newRotation }, { rotation: newRotation });
  }, [pin, updateTransform]);

  const handleCopy = useCallback(async () => {
    if (!absImagePathRef.current) return;
    try {
      await copyImageToClipboard(absImagePathRef.current);
    } catch (e) {
      console.error("Failed to copy pin image:", e);
    }
  }, []);

  const handleSaveAs = useCallback(async () => {
    if (!absImagePathRef.current) return;
    try {
      const filePath = await save({
        defaultPath: `pin_${Date.now()}.png`,
        filters: [
          { name: "PNG", extensions: ["png"] },
          { name: "JPEG", extensions: ["jpg"] },
          { name: "WebP", extensions: ["webp"] },
        ],
      });
      if (filePath) {
        await saveImageToPath(absImagePathRef.current, filePath);
      }
    } catch (e) {
      console.error("Failed to save pin image:", e);
    }
  }, []);

  const handleHide = useCallback(() => {
    if (!pin) return;
    hidePin(pin.id).catch((e) => console.error("Failed to hide pin:", e));
  }, [pin]);

  const handleClose = useCallback(() => {
    if (!pin) return;
    unpinImage(pin.id).catch((e) => console.error("Failed to close pin:", e));
  }, [pin]);

  const handleDelete = useCallback(() => {
    if (!pin) return;
    deletePin(pin.id).catch((e) => console.error("Failed to delete pin:", e));
  }, [pin]);

  // ===== 鼠标交互 =====

  const handlePointerDown = async (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (pin?.locked) return;
    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error("Failed to start pin dragging:", err);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!pin) return;

    // 核心逻辑：使用 Tauri 原生菜单，而不是 DOM 菜单。DOM 菜单只能显示在贴图 WebView 内，
    // 小贴图会裁剪菜单并产生滚动条；原生菜单不受贴图窗口尺寸限制。
    const run = (fn: () => void | Promise<void>) => {
      Promise.resolve(fn()).catch((err) => console.error("Pin menu action failed:", err));
    };

    const items: NonNullable<MenuOptions["items"]> = [
      {
        text: "置顶",
        checked: pin.always_on_top,
        action: () => run(handleToggleAlwaysOnTop),
      },
      {
        text: "锁定",
        checked: pin.locked,
        action: () => run(handleToggleLocked),
      },
      { item: "Separator" },
      {
        text: `透明度 ${Math.round(pin.opacity * 100)}%`,
        items: OPACITY_PRESETS.map((value) => ({
          text: `${Math.round(value * 100)}%`,
          checked: Math.abs(pin.opacity - value) < 0.01,
          action: () => run(() => handleSetOpacity(value)),
        })),
      },
      { item: "Separator" },
      {
        text: "水平翻转",
        checked: pin.flip_h,
        action: () => run(handleToggleFlipH),
      },
      {
        text: "垂直翻转",
        checked: pin.flip_v,
        action: () => run(handleToggleFlipV),
      },
      {
        text: "旋转 90°",
        action: () => run(handleRotate90),
      },
      { item: "Separator" },
      {
        text: "复制到剪贴板",
        action: () => run(handleCopy),
      },
      {
        text: "另存为...",
        action: () => run(handleSaveAs),
      },
      { item: "Separator" },
      {
        text: "隐藏",
        action: () => run(handleHide),
      },
      {
        text: "关闭",
        action: () => run(handleClose),
      },
      {
        text: "删除",
        action: () => run(handleDelete),
      },
    ];

    Menu.new({ items })
      .then(async (menu) => {
        await menuRef.current?.close().catch((err) => {
          console.error("Failed to close previous pin menu resource:", err);
        });
        menuRef.current = menu;
        await menu.popup(new LogicalPosition(e.clientX, e.clientY), getCurrentWindow());
      })
      .catch((err) => console.error("Failed to open pin context menu:", err));
  };

  // 滚轮缩放：以光标为中心
  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!pin) return;
    e.preventDefault();
    const delta = e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP;
    const currentScale = scaleRef.current;
    const newScale = Math.max(SCALE_MIN, Math.min(SCALE_MAX, currentScale + delta));
    if (Math.abs(newScale - currentScale) < 0.001) return;
    applyScale(newScale, { x: e.clientX, y: e.clientY });
  };

  // 双击复制到剪贴板
  const handleDoubleClick = () => {
    handleCopy();
  };

  // ===== 键盘快捷键 =====

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!pin) return;

      const win = getCurrentWindow();
      const fast = e.ctrlKey;

      switch (e.key) {
        case "ArrowUp":
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight": {
          e.preventDefault();
          if (pin.locked) return;
          const step = fast ? MOVE_STEP_FAST : MOVE_STEP;
          (async () => {
            const pos = await win.outerPosition();
            let x = pos.x;
            let y = pos.y;
            if (e.key === "ArrowUp") y -= step;
            if (e.key === "ArrowDown") y += step;
            if (e.key === "ArrowLeft") x -= step;
            if (e.key === "ArrowRight") x += step;
            await win.setPosition(new PhysicalPosition(x, y));
          })();
          break;
        }
        case "+":
        case "=": {
          e.preventDefault();
          const newScale = Math.min(SCALE_MAX, scaleRef.current + SCALE_STEP);
          applyScale(newScale);
          break;
        }
        case "-": {
          e.preventDefault();
          const newScale = Math.max(SCALE_MIN, scaleRef.current - SCALE_STEP);
          applyScale(newScale);
          break;
        }
        case "[": {
          e.preventDefault();
          const newRotation = (pin.rotation - 90 + 360) % 360;
          updateTransform({ rotation: newRotation }, { rotation: newRotation });
          break;
        }
        case "]": {
          e.preventDefault();
          const newRotation = (pin.rotation + 90) % 360;
          updateTransform({ rotation: newRotation }, { rotation: newRotation });
          break;
        }
        case "c":
        case "C": {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            handleCopy();
          }
          break;
        }
        case "Escape": {
          e.preventDefault();
          handleHide();
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pin, updateTransform, applyScale, handleCopy, handleHide]);

  if (!pin || !imageUrl) return null;

  // CSS 视觉层负责翻转和旋转；缩放交给窗口尺寸，避免图片超出视口后被裁切。
  const transform = `scale(${pin.flip_h ? -1 : 1}, ${pin.flip_v ? -1 : 1}) rotate(${pin.rotation}deg)`;

  return (
    <div
      className={styles.container}
      onPointerDown={handlePointerDown}
      onContextMenu={handleContextMenu}
      onWheel={handleWheel}
      onDoubleClick={handleDoubleClick}
    >
      <div className={styles.visualLayer} style={{ transform, opacity: pin.opacity }}>
        <img src={imageUrl} className={styles.pinImage} draggable={false} />
      </div>
    </div>
  );
}
