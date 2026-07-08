import { useEffect, useState, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  Copy,
  Eraser,
  Highlighter,
  PenLine,
  Pin,
  Redo2,
  Save,
  Square,
  Type,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { cropImage, type CropRegion } from "../../api/screenshot";
import styles from "./SnipWindow.module.css";

interface CaptureData {
  tempPath: string;
  width: number;
  height: number;
  scaleFactor: number;
}

type SnipMode = "selecting" | "reviewing" | "processing";
type SnipAction = "pin" | "copy";
type DisabledSnipTool = {
  title: string;
  icon: LucideIcon;
};

interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function getSelectionRect(
  start: { x: number; y: number },
  end: { x: number; y: number }
): SelectionRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

const TOOLBAR_WIDTH = 320;
const TOOLBAR_HEIGHT = 34;
const TOOLBAR_OFFSET = 8;

const disabledTools: DisabledSnipTool[] = [
  { title: "矩形标注（待实现）", icon: Square },
  { title: "画笔（待实现）", icon: PenLine },
  { title: "荧光笔（待实现）", icon: Highlighter },
  { title: "文字（待实现）", icon: Type },
  { title: "橡皮擦（待实现）", icon: Eraser },
];

function clampToolbarPosition(selection: SelectionRect) {
  const maxLeft = Math.max(
    TOOLBAR_OFFSET,
    window.innerWidth - TOOLBAR_WIDTH - TOOLBAR_OFFSET
  );
  const left = Math.min(
    Math.max(selection.left, TOOLBAR_OFFSET),
    maxLeft
  );
  const belowTop = selection.top + selection.height + TOOLBAR_OFFSET;

  // 核心逻辑：工具条优先贴在选区下方；空间不足时翻到上方，避免被屏幕边缘裁掉。
  const top =
    belowTop + TOOLBAR_HEIGHT <= window.innerHeight - TOOLBAR_OFFSET
      ? belowTop
      : Math.max(selection.top - TOOLBAR_HEIGHT - TOOLBAR_OFFSET, TOOLBAR_OFFSET);

  return { left, top };
}

export function SnipWindow() {
  const [capture, setCapture] = useState<CaptureData | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [mode, setMode] = useState<SnipMode>("selecting");
  const [isDragging, setIsDragging] = useState(false);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [end, setEnd] = useState<{ x: number; y: number } | null>(null);
  const [message, setMessage] = useState("拖拽选择区域 · ESC 取消");

  const dragRef = useRef({
    isDragging: false,
    mode: "selecting" as SnipMode,
    start: null as { x: number; y: number } | null,
    end: null as { x: number; y: number } | null,
    capture: null as CaptureData | null,
  });

  dragRef.current.isDragging = isDragging;
  dragRef.current.mode = mode;
  dragRef.current.start = start;
  dragRef.current.end = end;
  dragRef.current.capture = capture;

  useEffect(() => {
    const win = getCurrentWindow();
    win.show();
    win.setAlwaysOnTop(true);
    win.setFocus();

    let unlisten: (() => void) | null = null;

    const setup = async () => {
      unlisten = await listen<CaptureData>("snip:capture", (event) => {
        const data = event.payload;
        dragRef.current.capture = data;
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

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragRef.current.isDragging || dragRef.current.mode !== "selecting") return;
      setEnd({ x: e.clientX, y: e.clientY });
    };

    const handleUp = async () => {
      if (!dragRef.current.isDragging) return;

      const { start: s, end: e } = dragRef.current;

      setIsDragging(false);

      if (!s || !e) return;

      const rect = getSelectionRect(s, e);

      if (rect.width < 8 || rect.height < 8) {
        setStart(null);
        setEnd(null);
        setMessage("选区太小，请重新拖拽");
        return;
      }

      setMode("reviewing");
      setMessage("选择一个操作 · Enter 贴图 · C 复制 · ESC 取消");
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        emit("snip:cancel", {});
      } else if (e.key === "Enter" && dragRef.current.mode === "reviewing") {
        handleAction("pin");
      } else if (e.key.toLowerCase() === "c" && dragRef.current.mode === "reviewing") {
        handleAction("copy");
      }
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode === "processing") return;
    setMode("selecting");
    setMessage("拖拽选择区域 · ESC 取消");
    setIsDragging(true);
    setStart({ x: e.clientX, y: e.clientY });
    setEnd({ x: e.clientX, y: e.clientY });
  };

  const selection = start && end ? getSelectionRect(start, end) : null;

  const handleAction = async (action: SnipAction) => {
    const { start: s, end: e, capture: cap } = dragRef.current;
    if (!s || !e || !cap || dragRef.current.mode === "processing") return;

    const rect = getSelectionRect(s, e);
    const sf = cap.scaleFactor;
    const region: CropRegion = {
      x: Math.round(rect.left * sf),
      y: Math.round(rect.top * sf),
      width: Math.round(rect.width * sf),
      height: Math.round(rect.height * sf),
    };

    try {
      setMode("processing");
      setMessage(action === "pin" ? "正在贴到桌面..." : "正在复制到剪贴板...");
      const croppedPath = await cropImage(cap.tempPath, region);
      await emit("snip:complete", { action, croppedPath });
    } catch (err) {
      console.error("Crop failed:", err);
      await emit("snip:complete", { action, croppedPath: null });
    }
  };

  return (
    <div className={styles.overlay} onMouseDown={handleMouseDown}>
      {bgUrl && (
        <img
          src={bgUrl}
          className={styles.bgImage}
          alt="capture"
          draggable={false}
        />
      )}
      <div className={styles.dim} />
      {selection && (isDragging || mode !== "selecting") && (
        <div
          className={styles.selection}
          style={{
            left: selection.left,
            top: selection.top,
            width: selection.width,
            height: selection.height,
          }}
        >
          <div className={styles.selectionBorder} />
        </div>
      )}
      {selection && mode === "reviewing" && (
        <div
          className={styles.actionBar}
          style={clampToolbarPosition(selection)}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="截图操作工具栏"
        >
          {disabledTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.title}
                className={styles.toolBtn}
                type="button"
                title={tool.title}
                disabled
                aria-label={tool.title}
              >
                <Icon size={17} strokeWidth={1.9} />
              </button>
            );
          })}
          <span className={styles.separator} aria-hidden="true" />
          <button
            className={styles.toolBtn}
            type="button"
            title="撤销（待实现）"
            disabled
            aria-label="撤销（待实现）"
          >
            <Undo2 size={17} strokeWidth={1.9} />
          </button>
          <button
            className={styles.toolBtn}
            type="button"
            title="重做（待实现）"
            disabled
            aria-label="重做（待实现）"
          >
            <Redo2 size={17} strokeWidth={1.9} />
          </button>
          <span className={styles.separator} aria-hidden="true" />
          <button className={styles.toolBtn} type="button" onClick={() => emit("snip:cancel", {})} title="取消" aria-label="取消">
            <X size={17} strokeWidth={1.9} />
          </button>
          <button className={styles.toolBtn} type="button" onClick={() => handleAction("pin")} title="贴到桌面" aria-label="贴到桌面">
            <Pin size={17} strokeWidth={1.9} />
          </button>
          <button
            className={styles.toolBtn}
            type="button"
            title="保存（待实现）"
            disabled
            aria-label="保存（待实现）"
          >
            <Save size={17} strokeWidth={1.9} />
          </button>
          <button className={styles.toolBtn} type="button" onClick={() => handleAction("copy")} title="复制到剪贴板" aria-label="复制到剪贴板">
            <Copy size={17} strokeWidth={1.9} />
          </button>
        </div>
      )}
      <div className={styles.hint}>
        {message}
      </div>
    </div>
  );
}
