// ui.tsx
import { createRoot } from "react-dom/client";
import { ControlPanel } from "./Panels/ControlPanel";
import { InfoPanel } from "./Panels/InfoPanel";
import { AdaptiveInfoContent } from "./components/AdaptiveInfoContent";
import { AppMediator } from "../core/AppMediator";

export function createControlPanel(
  container: HTMLElement,
  mediator: AppMediator,
) {
  const root = createRoot(container);
  root.render(<ControlPanel mediator={mediator} />);
}

export function createInfoPanel(container: HTMLElement, mediator: AppMediator) {
  const root = createRoot(container);
  root.render(
    <InfoPanel>
      <AdaptiveInfoContent mediator={mediator} />
    </InfoPanel>,
  );
}
