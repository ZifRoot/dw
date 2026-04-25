// ui.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { CanvasEngine } from '../core/CanvasEngine';
import { ControlPanel } from './ControlPanel';

export function createUI(container: HTMLElement, engine: CanvasEngine) {
  const root = createRoot(container);
  root.render(<ControlPanel engine={engine} />);
}