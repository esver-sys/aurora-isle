import { create } from "zustand";
import type { PinRecord, ClipboardImageEvent } from "../types";

interface PinState {
  pins: PinRecord[];
  pendingClipboardImage: ClipboardImageEvent | null;
  setPins: (pins: PinRecord[]) => void;
  addPin: (pin: PinRecord) => void;
  removePin: (id: string) => void;
  setPendingClipboardImage: (image: ClipboardImageEvent | null) => void;
}

export const usePinStore = create<PinState>((set) => ({
  pins: [],
  pendingClipboardImage: null,
  setPins: (pins) => set({ pins }),
  addPin: (pin) => set((s) => ({ pins: [...s.pins, pin] })),
  removePin: (id) => set((s) => ({ pins: s.pins.filter((p) => p.id !== id) })),
  setPendingClipboardImage: (pendingClipboardImage) => set({ pendingClipboardImage }),
}));
