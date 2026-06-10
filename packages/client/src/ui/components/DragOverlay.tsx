// components/DragOverlay.tsx
import React from 'react';
import { createPortal } from 'react-dom';

interface DragOverlayProps {
  active: boolean;
  cursor?: string;
  onMove: (e: MouseEvent | TouchEvent) => void;
  onEnd: (e: MouseEvent | TouchEvent) => void;
}

export const DragOverlay: React.FC<DragOverlayProps> = ({
  active,
  cursor = 'grabbing',
  onMove,
  onEnd,
}) => {
  if (!active) return null;

  const handleMouseMove = (e: React.MouseEvent) => onMove(e.nativeEvent);
  const handleMouseUp = (e: React.MouseEvent) => onEnd(e.nativeEvent);
  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    onMove(e.nativeEvent);
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault();
    onEnd(e.nativeEvent);
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 9999,
        backgroundColor: 'transparent',
        cursor,
        touchAction: 'none', // отключает прокрутку и жесты на оверлее
      }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    />,
    document.body
  );
};