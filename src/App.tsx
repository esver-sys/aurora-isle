import { getCurrentWindow } from "@tauri-apps/api/window";
import { Island } from "./components/island/Island";
import { PinWindow } from "./components/pin/PinWindow";
import { SnipWindow } from "./components/snip/SnipWindow";
import { SettingsWindow } from "./components/settings/SettingsWindow";

function App() {
  const label = getCurrentWindow().label;

  if (label.startsWith("pin-")) {
    // pinId 由 PinWindow 监听 pin:activate 事件获取，不再从 label 解析
    return <PinWindow />;
  }

  if (label === "snip") {
    return <SnipWindow />;
  }

  if (label === "settings") {
    return <SettingsWindow />;
  }

  return <Island />;
}

export default App;
