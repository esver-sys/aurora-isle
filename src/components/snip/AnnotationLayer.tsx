import {
  useRef,
  useEffect,
  useState,
  useImperativeHandle,
  forwardRef,
  useCallback,
} from "react";
import { saveImageBytes } from "../../api/screenshot";
import styles from "./AnnotationLayer.module.css";

export type ToolType = "rectangle" | "arrow" | "pen" | "text" | "mosaic" | null;

interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface BaseAnnotation {
  id: string;
  color: string;
  strokeWidth: number;
}

interface ShapeAnnotation extends BaseAnnotation {
  type: "rectangle" | "arrow" | "mosaic";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface PenAnnotation extends BaseAnnotation {
  type: "pen";
  points: { x: number; y: number }[];
}

interface TextAnnotation extends BaseAnnotation {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

type Annotation = ShapeAnnotation | PenAnnotation | TextAnnotation;

export interface AnnotationLayerRef {
  exportImage: () => Promise<string | null>;
  undo: () => void;
  redo: () => void;
  hasAnnotations: () => boolean;
}

interface Props {
  bgUrl: string;
  selection: SelectionRect;
  scaleFactor: number;
  activeTool: ToolType;
  color: string;
  strokeWidth: number;
  onUndoRedoChange?: (canUndo: boolean, canRedo: boolean) => void;
}

let idCounter = 0;
function nextId() {
  return `ann_${Date.now()}_${idCounter++}`;
}

export const AnnotationLayer = forwardRef<AnnotationLayerRef, Props>(
  ({ bgUrl, selection, scaleFactor, activeTool, color, strokeWidth, onUndoRedoChange }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const [annotations, setAnnotations] = useState<Annotation[]>([]);
    const redoStackRef = useRef<Annotation[]>([]);
    const [drawing, setDrawing] = useState<Annotation | null>(null);
    const [textInput, setTextInput] = useState<{
      x: number;
      y: number;
      value: string;
    } | null>(null);
    const textInputRef = useRef<HTMLInputElement>(null);

    const physW = Math.round(selection.width * scaleFactor);
    const physH = Math.round(selection.height * scaleFactor);

    const notifyChange = useCallback(
      (anns: Annotation[], redo: Annotation[]) => {
        onUndoRedoChange?.(anns.length > 0, redo.length > 0);
      },
      [onUndoRedoChange]
    );

    const loadImage = useCallback(() => {
      if (imgRef.current) return;
      const img = new Image();
      img.onload = () => {
        imgRef.current = img;
        redraw();
      };
      img.src = bgUrl;
    }, [bgUrl]);

    const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (imgRef.current) {
        ctx.drawImage(
          imgRef.current,
          Math.round(selection.left * scaleFactor),
          Math.round(selection.top * scaleFactor),
          physW,
          physH,
          0,
          0,
          canvas.width,
          canvas.height
        );
      }

      for (const ann of annotations) {
        drawAnnotation(ctx, ann, scaleFactor);
      }

      if (drawing) {
        drawAnnotation(ctx, drawing, scaleFactor);
      }
    }, [annotations, drawing, scaleFactor, selection, physW, physH]);

    useEffect(() => {
      loadImage();
    }, [loadImage]);

    useEffect(() => {
      redraw();
    }, [redraw]);

    useEffect(() => {
      notifyChange(annotations, redoStackRef.current);
    }, [annotations, notifyChange]);

    useEffect(() => {
      if (textInput && textInputRef.current) {
        textInputRef.current.focus();
      }
    }, [textInput]);

    const getCanvasPos = (e: React.MouseEvent | MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
      if (!activeTool) return;
      // 标注画布位于截图 overlay 内，必须阻止冒泡，避免外层重新进入选区拖拽流程。
      e.stopPropagation();
      if (activeTool === "text") {
        const pos = getCanvasPos(e);
        setTextInput({ x: pos.x, y: pos.y, value: "" });
        return;
      }

      const pos = getCanvasPos(e);
      const base = {
        id: nextId(),
        color,
        strokeWidth,
      };

      if (activeTool === "pen") {
        setDrawing({
          ...base,
          type: "pen",
          points: [pos],
        } as PenAnnotation);
      } else {
        setDrawing({
          ...base,
          type: activeTool as "rectangle" | "arrow" | "mosaic",
          x1: pos.x,
          y1: pos.y,
          x2: pos.x,
          y2: pos.y,
        } as ShapeAnnotation);
      }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
      if (!drawing) return;
      const pos = getCanvasPos(e);

      if (drawing.type === "pen") {
        setDrawing({
          ...drawing,
          points: [...drawing.points, pos],
        } as PenAnnotation);
      } else {
        setDrawing({
          ...drawing,
          x2: pos.x,
          y2: pos.y,
        } as ShapeAnnotation);
      }
    };

    const handleMouseUp = () => {
      if (!drawing) return;

      let valid = true;
      if (drawing.type === "pen") {
        valid = (drawing as PenAnnotation).points.length > 1;
      } else {
        const d = drawing as ShapeAnnotation;
        valid = Math.abs(d.x2 - d.x1) > 2 || Math.abs(d.y2 - d.y1) > 2;
      }

      if (valid) {
        const newAnn = drawing;
        setAnnotations((prev) => {
          // 新增标注会形成新的编辑分支，旧的 redo 栈不能继续复用。
          redoStackRef.current = [];
          const next = [...prev, newAnn];
          notifyChange(next, redoStackRef.current);
          return next;
        });
      }
      setDrawing(null);
    };

    const commitText = () => {
      if (!textInput || !textInput.value.trim()) {
        setTextInput(null);
        return;
      }
      const ann: TextAnnotation = {
        id: nextId(),
        type: "text",
        x: textInput.x,
        y: textInput.y,
        text: textInput.value,
        color,
        strokeWidth,
        fontSize: 16,
      };
      setAnnotations((prev) => {
        // 输入文字同样是新的编辑分支，需要清掉可重做历史。
        redoStackRef.current = [];
        const next = [...prev, ann];
        notifyChange(next, redoStackRef.current);
        return next;
      });
      setTextInput(null);
    };

    useImperativeHandle(
      ref,
      () => ({
        exportImage: async () => {
          const canvas = canvasRef.current;
          if (!canvas) return null;
          if (annotations.length === 0) return null;
          const blob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob((b) => resolve(b), "image/png")
          );
          if (!blob) return null;
          const bytes = new Uint8Array(await blob.arrayBuffer());
          return await saveImageBytes(bytes);
        },
        undo: () => {
          setAnnotations((prev) => {
            if (prev.length === 0) return prev;
            const next = [...prev];
            const removed = next.pop()!;
            redoStackRef.current.push(removed);
            notifyChange(next, redoStackRef.current);
            return next;
          });
        },
        redo: () => {
          const redo = redoStackRef.current;
          if (redo.length === 0) return;
          const item = redo.pop()!;
          setAnnotations((prev) => {
            const next = [...prev, item];
            notifyChange(next, redoStackRef.current);
            return next;
          });
        },
        hasAnnotations: () => annotations.length > 0,
      }),
      [annotations]
    );

    const hasTool = activeTool !== null;

    return (
      <>
        <canvas
          ref={canvasRef}
          className={styles.canvas}
          width={physW}
          height={physH}
          style={{
            left: selection.left,
            top: selection.top,
            width: selection.width,
            height: selection.height,
            cursor: hasTool ? "crosshair" : "default",
            pointerEvents: hasTool ? "auto" : "none",
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        />
        {textInput && (
          <input
            ref={textInputRef}
            className={styles.textInput}
            style={{
              left: selection.left + textInput.x,
              top: selection.top + textInput.y,
              color,
              fontSize: 16 * scaleFactor,
            }}
            value={textInput.value}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
            onKeyDown={(e) => {
              // 文本编辑中的 Enter/Escape 只处理输入框自身，不能触发截图窗口的全局快捷键。
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                commitText();
              } else if (e.key === "Escape") {
                setTextInput(null);
              }
            }}
            onBlur={commitText}
          />
        )}
      </>
    );
  }
);

AnnotationLayer.displayName = "AnnotationLayer";

function drawAnnotation(
  ctx: CanvasRenderingContext2D,
  ann: Annotation,
  sf: number
) {
  ctx.save();
  ctx.strokeStyle = ann.color;
  ctx.fillStyle = ann.color;
  ctx.lineWidth = ann.strokeWidth * sf;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (ann.type === "rectangle") {
    const x = Math.min(ann.x1, ann.x2) * sf;
    const y = Math.min(ann.y1, ann.y2) * sf;
    const w = Math.abs(ann.x2 - ann.x1) * sf;
    const h = Math.abs(ann.y2 - ann.y1) * sf;
    ctx.strokeRect(x, y, w, h);
  } else if (ann.type === "arrow") {
    const x1 = ann.x1 * sf;
    const y1 = ann.y1 * sf;
    const x2 = ann.x2 * sf;
    const y2 = ann.y2 * sf;
    const headLen = 12 * sf;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLen * Math.cos(angle - Math.PI / 6),
      y2 - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      x2 - headLen * Math.cos(angle + Math.PI / 6),
      y2 - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  } else if (ann.type === "pen") {
    if (ann.points.length < 2) {
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(ann.points[0].x * sf, ann.points[0].y * sf);
    for (let i = 1; i < ann.points.length; i++) {
      ctx.lineTo(ann.points[i].x * sf, ann.points[i].y * sf);
    }
    ctx.stroke();
  } else if (ann.type === "text") {
    ctx.font = `${ann.fontSize * sf}px sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(ann.text, ann.x * sf, ann.y * sf);
  } else if (ann.type === "mosaic") {
    const x = Math.min(ann.x1, ann.x2) * sf;
    const y = Math.min(ann.y1, ann.y2) * sf;
    const w = Math.abs(ann.x2 - ann.x1) * sf;
    const h = Math.abs(ann.y2 - ann.y1) * sf;
    const blockSize = 8 * sf;

    const cols = Math.ceil(w / blockSize);
    const rows = Math.ceil(h / blockSize);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const px = Math.floor(x + c * blockSize);
        const py = Math.floor(y + r * blockSize);
        const pw = Math.min(blockSize, x + w - px);
        const ph = Math.min(blockSize, y + h - py);
        if (pw <= 0 || ph <= 0) continue;

        const data = ctx.getImageData(px, py, pw, ph);
        let rr = 0,
          gg = 0,
          bb = 0,
          aa = 0;
        const count = pw * ph;
        for (let i = 0; i < count; i++) {
          rr += data.data[i * 4];
          gg += data.data[i * 4 + 1];
          bb += data.data[i * 4 + 2];
          aa += data.data[i * 4 + 3];
        }
        ctx.fillStyle = `rgba(${rr / count},${gg / count},${bb / count},${aa / count / 255})`;
        ctx.fillRect(px, py, pw, ph);
      }
    }
  }

  ctx.restore();
}
