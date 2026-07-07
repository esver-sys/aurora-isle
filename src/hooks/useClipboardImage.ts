import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { ClipboardImageEvent } from "../types";

export function useClipboardImage(onImage: (image: ClipboardImageEvent) => void) {
  const callbackRef = useRef(onImage);

  useEffect(() => {
    callbackRef.current = onImage;
  });

  useEffect(() => {
    const unlisten = listen<ClipboardImageEvent>("clipboard-image", (event) => {
      callbackRef.current(event.payload);
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);
}
