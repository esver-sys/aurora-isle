import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function useCursorEvents(onHover: () => void, onLeave: () => void) {
  const isIgnoringRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onHoverRef = useRef(onHover);
  const onLeaveRef = useRef(onLeave);

  useEffect(() => {
    onHoverRef.current = onHover;
    onLeaveRef.current = onLeave;
  });

  useEffect(() => {
    const win = getCurrentWindow();
    win.setIgnoreCursorEvents(true);

    const handleMouseMove = (e: MouseEvent) => {
      if (!isIgnoringRef.current) return;
      const hitbox = document.querySelector("[data-pill-hitbox]");
      if (!hitbox) return;
      const rect = hitbox.getBoundingClientRect();
      const padding = 8;
      const isOver =
        e.clientX >= rect.left - padding &&
        e.clientX <= rect.right + padding &&
        e.clientY >= rect.top - padding &&
        e.clientY <= rect.bottom + padding;
      if (isOver) {
        isIgnoringRef.current = false;
        win.setIgnoreCursorEvents(false);
        onHoverRef.current();
      }
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      win.setIgnoreCursorEvents(false);
    };
  }, []);

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      isIgnoringRef.current = true;
      getCurrentWindow().setIgnoreCursorEvents(true);
      onLeaveRef.current();
    }, 300);
  };

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  };

  return { handleMouseEnter, handleMouseLeave };
}
