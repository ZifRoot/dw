// ui.tsx
import { createRoot } from 'react-dom/client';
import { ControlPanel } from './ControlPanel';
import { AppMediator } from 'src/core/AppMediator';
import { InfoPanel } from './InfoPanel';

export function createControlPanel(container: HTMLElement, mediator: AppMediator) {
  const root = createRoot(container);
  root.render(<ControlPanel mediator={mediator} />);
}

export function createInfoPanel(container: HTMLElement, mediator: AppMediator) {
  const root = createRoot(container);
  root.render(<InfoPanel mediator={mediator} />);
}