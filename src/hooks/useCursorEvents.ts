import { useEffect, useRef } from "react";
import { getCurrentWindow, cursorPosition } from "@tauri-apps/api/window";

const POLL_INTERVAL = 50;
const LEAVE_DELAY = 300;
const HITBOX_PADDING = 8;

export function useCursorEvents(onHover: () => void, onLeave: () => void) {
  const onHoverRef = useRef(onHover);
  const onLeaveRef = useRef(onLeave);
  const isIgnoringRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onHoverRef.current = onHover;
    onLeaveRef.current = onLeave;
  });

  const setIgnore = async (ignore: boolean) => {
    if (isIgnoringRef.current === ignore) return;
    isIgnoringRef.current = ignore;
    await getCurrentWindow().setIgnoreCursorEvents(ignore);
  };

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      if (!isIgnoringRef.current) return;
      try {
        const win = getCurrentWindow();
        const [cursor, pos, size] = await Promise.all([
          cursorPosition(),
          win.outerPosition(),
          win.outerSize(),
        ]);
        const isOver =
          cursor.x >= pos.x - HITBOX_PADDING &&
          cursor.x <= pos.x + size.width + HITBOX_PADDING &&
          cursor.y >= pos.y - HITBOX_PADDING &&
          cursor.y <= pos.y + size.height + HITBOX_PADDING;
        if (isOver) {
          if (leaveTimeoutRef.current) {
            clearTimeout(leaveTimeoutRef.current);
            leaveTimeoutRef.current = null;
          }
          await setIgnore(false);
          onHoverRef.current();
        }
      } catch {
        // ignore polling errors
      }
    }, POLL_INTERVAL);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => {
    const win = getCurrentWindow();
    win.setIgnoreCursorEvents(true);
    startPolling();

    return () => {
      stopPolling();
      if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
      win.setIgnoreCursorEvents(false);
    };
  }, []);

  const handleMouseEnter = () => {
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    if (leaveTimeoutRef.current) clearTimeout(leaveTimeoutRef.current);
    leaveTimeoutRef.current = setTimeout(async () => {
      await setIgnore(true);
      onLeaveRef.current();
      startPolling();
    }, LEAVE_DELAY);
  };

  return { handleMouseEnter, handleMouseLeave };
}
