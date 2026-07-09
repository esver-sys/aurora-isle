import { useEffect, useState, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { emit, listen } from "@tauri-apps/api/event";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
  ArrowUpRight,
  Copy,
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
import { cropImage, getWindowAtPoint, getScreenshotHistory, type CropRegion, type WindowRect, type ScreenshotHistoryEntry } from "../../api/screenshot";
import { AnnotationLayer, type ToolType, type AnnotationLayerRef } from "./AnnotationLayer";
import { Magnifier } from "./Magnifier";
import styles from "./SnipWindow.module.css";

interface CaptureData {
  tempPath: string;
  width: number;
  height: number;
  scaleFactor: number;
  monitorX: number;
  monitorY: number;
}

type SnipMode = "selecting" | "reviewing" | "processing";
type SnipAction = "pin" | "copy" | "save" | "quick_save";
type SnipTool = {
  title: string;
  icon: LucideIcon;
  type: Exclude<ToolType, null>;
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

const annotationTools: SnipTool[] = [
  { title: "矩形", icon: Square, type: "rectangle" },
  { title: "箭头", icon: ArrowUpRight, type: "arrow" },
  { title: "画笔", icon: PenLine, type: "pen" },
  { title: "文字", icon: Type, type: "text" },
  { title: "马赛克", icon: Highlighter, type: "mosaic" },
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
  const [message, setMessage] = useState("移动鼠标检测窗口 · 拖拽选择区域 · ESC 取消");
  const [detectedWindow, setDetectedWindow] = useState<WindowRect | null>(null);
  const [activeTool, setActiveTool] = useState<ToolType>(null);
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const [annCanUndo, setAnnCanUndo] = useState(false);
  const [annCanRedo, setAnnCanRedo] = useState(false);
  const annotationRef = useRef<AnnotationLayerRef>(null);
  const activeToolRef = useRef<ToolType>(null);
  const historyRef = useRef<ScreenshotHistoryEntry[]>([]);
  const historyIndexRef = useRef<number>(-1);

  const dragRef = useRef({
    isDragging: false,
    mode: "selecting" as SnipMode,
    start: null as { x: number; y: number } | null,
    end: null as { x: number; y: number } | null,
    capture: null as CaptureData | null,
    pendingClick: false,
    mouseDownPos: null as { x: number; y: number } | null,
    detectedWindow: null as WindowRect | null,
    lastDetectTime: 0,
  });

  dragRef.current.isDragging = isDragging;
  dragRef.current.mode = mode;
  dragRef.current.start = start;
  dragRef.current.end = end;
  dragRef.current.capture = capture;
  dragRef.current.detectedWindow = detectedWindow;
  activeToolRef.current = activeTool;

  useEffect(() => {
    const win = getCurrentWindow();
    let unlistenCapture: (() => void) | null = null;
    let unlistenStart: (() => void) | null = null;

    const setup = async () => {
      unlistenCapture = await listen<CaptureData>("snip:capture", (event) => {
        const data = event.payload;
        dragRef.current.capture = data;
        setCapture(data);
        setBgUrl(convertFileSrc(data.tempPath));
      });

      unlistenStart = await listen("snip:start", async () => {
        setCapture(null);
        setBgUrl(null);
        setMode("selecting");
        setIsDragging(false);
        setStart(null);
        setEnd(null);
        setDetectedWindow(null);
        setActiveTool(null);
        setToolbarVisible(true);
        setAnnCanUndo(false);
        setAnnCanRedo(false);
        dragRef.current.pendingClick = false;
        dragRef.current.mouseDownPos = null;
        dragRef.current.detectedWindow = null;
        dragRef.current.lastDetectTime = 0;
        historyRef.current = [];
        historyIndexRef.current = -1;
        setMessage("移动鼠标检测窗口 · 拖拽选择区域 · R 重复上次区域 · ESC 取消");

        getScreenshotHistory(20).then((entries) => {
          historyRef.current = entries;
        }).catch(() => {});

        await win.show();
        await win.setAlwaysOnTop(true);
        await win.setFocus();

        await emit("snip:ready", {});
      });
    };
    setup();

    return () => {
      if (unlistenCapture) unlistenCapture();
      if (unlistenStart) unlistenStart();
    };
  }, []);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (dragRef.current.mode === "processing") return;

      if (dragRef.current.isDragging) {
        if (dragRef.current.pendingClick && dragRef.current.mouseDownPos) {
          const dx = Math.abs(e.clientX - dragRef.current.mouseDownPos.x);
          const dy = Math.abs(e.clientY - dragRef.current.mouseDownPos.y);
          if (dx > 4 || dy > 4) {
            dragRef.current.pendingClick = false;
            setStart(dragRef.current.mouseDownPos);
            setEnd({ x: e.clientX, y: e.clientY });
          }
        } else {
          setEnd({ x: e.clientX, y: e.clientY });
        }
      } else if (dragRef.current.mode === "selecting" && dragRef.current.capture) {
        const now = Date.now();
        if (now - dragRef.current.lastDetectTime > 50) {
          dragRef.current.lastDetectTime = now;
          const sf = dragRef.current.capture.scaleFactor;
          const mx = dragRef.current.capture.monitorX ?? 0;
          const my = dragRef.current.capture.monitorY ?? 0;
          getWindowAtPoint(e.clientX + mx, e.clientY + my, sf).then((rect) => {
            if (!dragRef.current.isDragging && dragRef.current.mode === "selecting") {
              const adjusted = rect ? { ...rect, x: rect.x - mx, y: rect.y - my } : null;
              setDetectedWindow(adjusted);
              dragRef.current.detectedWindow = adjusted;
            }
          });
        }
      }
    };

    const handleUp = async () => {
      if (!dragRef.current.isDragging) return;

      const { start: s, end: e, pendingClick } = dragRef.current;

      setIsDragging(false);

      if (pendingClick) {
        const dw = dragRef.current.detectedWindow;
        if (dw && dw.width > 8 && dw.height > 8) {
          setStart({ x: dw.x, y: dw.y });
          setEnd({ x: dw.x + dw.width, y: dw.y + dw.height });
          setDetectedWindow(null);
          setMode("reviewing");
          setMessage("选择操作或标注 · Space 隐藏工具条 · Enter 贴图 · C 复制 · Ctrl+S 保存 · ESC 取消");
        } else {
          setStart(null);
          setEnd(null);
          setDetectedWindow(null);
        }
        dragRef.current.pendingClick = false;
        return;
      }

      if (!s || !e) return;

      const rect = getSelectionRect(s, e);

      if (rect.width < 8 || rect.height < 8) {
        setStart(null);
        setEnd(null);
        setMessage("选区太小，请重新拖拽");
        return;
      }

      setDetectedWindow(null);
      setMode("reviewing");
      setMessage("选择操作或标注 · Space 隐藏工具条 · Enter 贴图 · C 复制 · Ctrl+S 保存 · ESC 取消");
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        emit("snip:cancel", {});
      } else if (dragRef.current.mode === "selecting" && (e.key === "," || e.key === ".")) {
        e.preventDefault();
        navigateHistory(e.key === "," ? "prev" : "next");
      } else if (dragRef.current.mode === "selecting" && e.key.toLowerCase() === "r") {
        e.preventDefault();
        navigateHistory("last");
      } else if (e.key === " " && dragRef.current.mode === "reviewing") {
        e.preventDefault();
        setToolbarVisible((v) => !v);
      } else if (e.ctrlKey && e.key.toLowerCase() === "z" && dragRef.current.mode === "reviewing") {
        e.preventDefault();
        annotationRef.current?.undo();
      } else if (e.ctrlKey && e.key.toLowerCase() === "y" && dragRef.current.mode === "reviewing") {
        e.preventDefault();
        annotationRef.current?.redo();
      } else if (dragRef.current.mode === "reviewing" && !activeToolRef.current && !e.ctrlKey && !e.shiftKey &&
                 ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        adjustSelection(e.key, "move");
      } else if (dragRef.current.mode === "reviewing" && e.ctrlKey &&
                 ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        adjustSelection(e.key, "expand");
      } else if (dragRef.current.mode === "reviewing" && e.shiftKey &&
                 ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        adjustSelection(e.key, "shrink");
      } else if (e.key === "Enter" && dragRef.current.mode === "reviewing") {
        handleAction("pin");
      } else if (e.key.toLowerCase() === "c" && !e.ctrlKey && !e.metaKey && dragRef.current.mode === "reviewing") {
        handleAction("copy");
      } else if (e.ctrlKey && e.key.toLowerCase() === "s" && dragRef.current.mode === "reviewing") {
        e.preventDefault();
        if (e.shiftKey) {
          handleAction("quick_save");
        } else {
          handleAction("save");
        }
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
    dragRef.current.pendingClick = true;
    dragRef.current.mouseDownPos = { x: e.clientX, y: e.clientY };
    setIsDragging(true);

    const dw = dragRef.current.detectedWindow;
    if (dw && dw.width > 8 && dw.height > 8) {
      setStart({ x: dw.x, y: dw.y });
      setEnd({ x: dw.x + dw.width, y: dw.y + dw.height });
    } else {
      setMode("selecting");
      setMessage("拖拽选择区域 · ESC 取消");
      setStart({ x: e.clientX, y: e.clientY });
      setEnd({ x: e.clientX, y: e.clientY });
      dragRef.current.pendingClick = false;
    }
  };

  const selection = start && end ? getSelectionRect(start, end) : null;

  const navigateHistory = (direction: "prev" | "next" | "last") => {
    const history = historyRef.current;
    if (history.length === 0) return;

    let newIndex: number;
    if (direction === "last") {
      newIndex = 0;
    } else if (direction === "prev") {
      newIndex = historyIndexRef.current < 0 ? 0 : Math.min(historyIndexRef.current + 1, history.length - 1);
    } else {
      newIndex = historyIndexRef.current <= 0 ? -1 : historyIndexRef.current - 1;
    }

    historyIndexRef.current = newIndex;

    if (newIndex < 0) {
      setStart(null);
      setEnd(null);
      setMode("selecting");
      setMessage("移动鼠标检测窗口 · 拖拽选择区域 · R 重复上次区域 · ESC 取消");
      return;
    }

    const entry = history[newIndex];
    setStart({ x: entry.region_x, y: entry.region_y });
    setEnd({ x: entry.region_x + entry.region_width, y: entry.region_y + entry.region_height });
    setDetectedWindow(null);
    setMode("reviewing");
    setMessage(`历史 ${newIndex + 1}/${history.length} · Enter 贴图 · C 复制 · ESC 取消 · ,/. 切换`);
  };

  const adjustSelection = (key: string, mode: "move" | "expand" | "shrink") => {
    const s = dragRef.current.start;
    const e = dragRef.current.end;
    if (!s || !e) return;

    const rect = getSelectionRect(s, e);
    let { left, top, width, height } = rect;

    if (mode === "move") {
      if (key === "ArrowUp") top -= 1;
      if (key === "ArrowDown") top += 1;
      if (key === "ArrowLeft") left -= 1;
      if (key === "ArrowRight") left += 1;
    } else if (mode === "expand") {
      if (key === "ArrowUp") { top -= 1; height += 1; }
      if (key === "ArrowDown") height += 1;
      if (key === "ArrowLeft") { left -= 1; width += 1; }
      if (key === "ArrowRight") width += 1;
    } else if (mode === "shrink") {
      if (key === "ArrowUp") { top += 1; height = Math.max(1, height - 1); }
      if (key === "ArrowDown") height = Math.max(1, height - 1);
      if (key === "ArrowLeft") { left += 1; width = Math.max(1, width - 1); }
      if (key === "ArrowRight") width = Math.max(1, width - 1);
    }

    setStart({ x: left, y: top });
    setEnd({ x: left + width, y: top + height });
  };

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
      const msgMap: Record<SnipAction, string> = {
        pin: "正在贴到桌面...",
        copy: "正在复制到剪贴板...",
        save: "正在保存...",
        quick_save: "正在快速保存...",
      };
      setMessage(msgMap[action]);
      const croppedPath = await cropImage(cap.tempPath, region);

      const historyInfo = {
        regionX: rect.left,
        regionY: rect.top,
        regionWidth: rect.width,
        regionHeight: rect.height,
        scaleFactor: sf,
      };

      // 仅在贴图操作时传入选区屏幕坐标和尺寸，使贴图窗口出现在选区位置
      const pinRect =
        action === "pin"
          ? {
              x: (cap.monitorX ?? 0) + rect.left,
              y: (cap.monitorY ?? 0) + rect.top,
              width: rect.width,
              height: rect.height,
            }
          : undefined;

      const completePayload = { action, croppedPath, historyInfo, pinRect };

      if (annotationRef.current?.hasAnnotations()) {
        const annotatedPath = await annotationRef.current.exportImage();
        if (annotatedPath) {
          await emit("snip:complete", { ...completePayload, croppedPath: annotatedPath });
          return;
        }
      }

      await emit("snip:complete", completePayload);
    } catch (err) {
      console.error("Crop failed:", err);
      await emit("snip:complete", { action, croppedPath: null, historyInfo: null, pinRect: undefined });
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
      {bgUrl && capture && mode === "selecting" && (
        <Magnifier bgUrl={bgUrl} scaleFactor={capture.scaleFactor} visible={true} />
      )}
      {detectedWindow && mode === "selecting" && !isDragging && (
        <div
          className={styles.windowHighlight}
          style={{
            left: detectedWindow.x,
            top: detectedWindow.y,
            width: detectedWindow.width,
            height: detectedWindow.height,
          }}
        />
      )}
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
          <div
            className={styles.sizeLabel}
            style={
              selection.top + selection.height + 26 > window.innerHeight
                ? { bottom: "auto", top: "-26px" }
                : undefined
            }
          >
            {Math.round(selection.width * (capture?.scaleFactor ?? 1))} ×{" "}
            {Math.round(selection.height * (capture?.scaleFactor ?? 1))}
          </div>
        </div>
      )}
      {selection && mode === "reviewing" && bgUrl && capture && (
        <AnnotationLayer
          ref={annotationRef}
          bgUrl={bgUrl}
          selection={selection}
          scaleFactor={capture.scaleFactor}
          activeTool={activeTool}
          color="#ff3b30"
          strokeWidth={2}
          onUndoRedoChange={(canUndo, canRedo) => {
            setAnnCanUndo(canUndo);
            setAnnCanRedo(canRedo);
          }}
        />
      )}
      {selection && mode === "reviewing" && toolbarVisible && (
        <div
          className={styles.actionBar}
          style={clampToolbarPosition(selection)}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="截图操作工具栏"
        >
          {annotationTools.map((tool) => {
            const Icon = tool.icon;
            const isActive = activeTool === tool.type;
            return (
              <button
                key={tool.title}
                className={`${styles.toolBtn} ${isActive ? styles.toolBtnActive : ""}`}
                type="button"
                title={tool.title}
                aria-label={tool.title}
                onClick={() => setActiveTool(isActive ? null : tool.type)}
              >
                <Icon size={17} strokeWidth={1.9} />
              </button>
            );
          })}
          <span className={styles.separator} aria-hidden="true" />
          <button
            className={styles.toolBtn}
            type="button"
            title="撤销 (Ctrl+Z)"
            aria-label="撤销"
            disabled={!annCanUndo}
            onClick={() => annotationRef.current?.undo()}
          >
            <Undo2 size={17} strokeWidth={1.9} />
          </button>
          <button
            className={styles.toolBtn}
            type="button"
            title="重做 (Ctrl+Y)"
            aria-label="重做"
            disabled={!annCanRedo}
            onClick={() => annotationRef.current?.redo()}
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
          <button className={styles.toolBtn} type="button" onClick={() => handleAction("save")} title="保存 (Ctrl+S)" aria-label="保存">
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
