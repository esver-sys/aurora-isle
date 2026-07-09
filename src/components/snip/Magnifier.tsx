import { useRef, useEffect, useState } from "react";
import styles from "./Magnifier.module.css";

interface Props {
  bgUrl: string;
  scaleFactor: number;
  visible: boolean;
}

const MAG_SIZE = 180;
const ZOOM = 10;
const SOURCE_SIZE = MAG_SIZE / ZOOM;

export function Magnifier({ bgUrl, scaleFactor, visible }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [color, setColor] = useState("#000000");
  const [coords, setCoords] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!bgUrl) return;
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
    };
    img.src = bgUrl;
  }, [bgUrl]);

  useEffect(() => {
    if (!visible) return;

    const handleMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      const img = imgRef.current;
      if (!canvas || !container || !img) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const px = Math.round(e.clientX * scaleFactor);
      const py = Math.round(e.clientY * scaleFactor);

      const sx = px - SOURCE_SIZE / 2;
      const sy = py - SOURCE_SIZE / 2;

      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, MAG_SIZE, MAG_SIZE);
      ctx.drawImage(
        img,
        sx,
        sy,
        SOURCE_SIZE,
        SOURCE_SIZE,
        0,
        0,
        MAG_SIZE,
        MAG_SIZE
      );

      try {
        // 先读取截图像素，再绘制准星和选框，避免辅助线颜色污染取色结果。
        const pixel = ctx.getImageData(
          MAG_SIZE / 2 - 1,
          MAG_SIZE / 2 - 1,
          1,
          1
        ).data;
        const hex = `#${[pixel[0], pixel[1], pixel[2]]
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("")}`;
        setColor(hex.toUpperCase());
      } catch {
        // 边缘或图片尚未完全可读时保留上一次颜色，避免打断截图流程。
      }

      ctx.strokeStyle = "rgba(0, 150, 255, 0.8)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MAG_SIZE / 2, 0);
      ctx.lineTo(MAG_SIZE / 2, MAG_SIZE);
      ctx.moveTo(0, MAG_SIZE / 2);
      ctx.lineTo(MAG_SIZE, MAG_SIZE / 2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(MAG_SIZE / 2 - ZOOM / 2, MAG_SIZE / 2 - ZOOM / 2, ZOOM, ZOOM);

      setCoords({ x: px, y: py });

      let left = e.clientX + 20;
      let top = e.clientY + 20;
      if (left + MAG_SIZE > window.innerWidth) {
        left = e.clientX - MAG_SIZE - 20;
      }
      if (top + MAG_SIZE + 30 > window.innerHeight) {
        top = e.clientY - MAG_SIZE - 50;
      }
      container.style.left = `${left}px`;
      container.style.top = `${top}px`;
    };

    window.addEventListener("mousemove", handleMove);
    return () => window.removeEventListener("mousemove", handleMove);
  }, [visible, scaleFactor]);

  if (!visible) return null;

  return (
    <div ref={containerRef} className={styles.magnifier}>
      <canvas
        ref={canvasRef}
        width={MAG_SIZE}
        height={MAG_SIZE}
        className={styles.canvas}
      />
      <div className={styles.info}>
        <span>{coords.x}, {coords.y}</span>
        <span className={styles.colorSwatch} style={{ background: color }} />
        <span>{color}</span>
      </div>
    </div>
  );
}
