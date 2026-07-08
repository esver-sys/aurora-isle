import { getCurrentWindow } from "@tauri-apps/api/window";
import { Island } from "./components/island/Island";
import { PinWindow } from "./components/pin/PinWindow";
import { SnipWindow } from "./components/snip/SnipWindow";

function App() {
  const label = getCurrentWindow().label;

  if (label.startsWith("pin-")) {
    const pinId = label.slice(4);
    return <PinWindow pinId={pinId} />;
  }

  if (label === "snip") {
    return <SnipWindow />;
  }

  return <Island />;
}

export default App;
