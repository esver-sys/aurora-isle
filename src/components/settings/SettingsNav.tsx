import { Settings, Palette, Keyboard, Image as ImageIcon, Info } from "lucide-react";
import styles from "./SettingsWindow.module.css";

export type SettingsTab =
  | "general"
  | "appearance"
  | "shortcuts"
  | "pin"
  | "about";

interface SettingsNavProps {
  active: SettingsTab;
  onChange: (tab: SettingsTab) => void;
}

const NAV_ITEMS: {
  key: SettingsTab;
  label: string;
  icon: typeof Settings;
}[] = [
  { key: "general", label: "通用", icon: Settings },
  { key: "appearance", label: "外观", icon: Palette },
  { key: "shortcuts", label: "快捷键", icon: Keyboard },
  { key: "pin", label: "贴图", icon: ImageIcon },
  { key: "about", label: "关于", icon: Info },
];

export function SettingsNav({ active, onChange }: SettingsNavProps) {
  return (
    <nav className={styles.nav}>
      {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          className={`${styles.navItem} ${
            active === key ? styles.navItemActive : ""
          }`}
          onClick={() => onChange(key)}
        >
          <Icon
            size={16}
            color={active === key ? "white" : "rgba(255,255,255,0.6)"}
          />
          <span className={styles.navLabel}>{label}</span>
        </button>
      ))}
    </nav>
  );
}
