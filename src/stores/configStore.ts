import { create } from "zustand";

interface ConfigState {
  islandPosX: number | null;
  islandMonitorId: string | null;
  expandedDefault: boolean;
  autostartEnabled: boolean;
  set: <K extends keyof Omit<ConfigState, "set">>(key: K, value: ConfigState[K]) => void;
}

export const useConfigStore = create<ConfigState>((set) => ({
  islandPosX: null,
  islandMonitorId: null,
  expandedDefault: false,
  autostartEnabled: false,
  set: (key, value) => set({ [key]: value } as Partial<ConfigState>),
}));
