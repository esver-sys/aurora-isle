import { create } from "zustand";

type IslandMode = "pill" | "expanded";

interface IslandState {
  mode: IslandMode;
  isIgnoringCursor: boolean;
  isHovering: boolean;
  setMode: (mode: IslandMode) => void;
  setIgnoringCursor: (ignoring: boolean) => void;
  setHovering: (hovering: boolean) => void;
}

export const useIslandStore = create<IslandState>((set) => ({
  mode: "pill",
  isIgnoringCursor: true,
  isHovering: false,
  setMode: (mode) => set({ mode }),
  setIgnoringCursor: (isIgnoringCursor) => set({ isIgnoringCursor }),
  setHovering: (isHovering) => set({ isHovering }),
}));
