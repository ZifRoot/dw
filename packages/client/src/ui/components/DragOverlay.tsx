// components/DragOverlay.tsx
import React from 'react';
import { createPortal } from 'react-dom';

interface DragOverlayProps {
  active: boolean;
  cursor?: string;
  onMouseMove: (e: MouseEvent) => void;
  onMouseUp: (e: MouseEvent) => void;
}

export const DragOverlay: React.FC<DragOverlayProps> = ({
  active,
  cursor = 'grabbing',
  onMouseMove,
  onMouseUp,
}) => {
  if (!active) return null;

  return createPortal(
    <div name="DragOverlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 9999,
        backgroundColor: '#FFFFFF',
        opacity: 0.1,
        cursor,
      }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    />,
    document.body
  );
};