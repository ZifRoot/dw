// components/Resizer.tsx
import React from 'react';
import { useMouseDrag } from '../hooks/useMouseDrag';
import { DragOverlay } from './DragOverlay';
import styles from './Resizer.module.scss';

interface ResizerProps {
  onResize: (deltaWidth: number) => void;

}

export const Resizer: React.FC<ResizerProps> = ({ onResize }) => {
  const { onMouseDown, isDragging, handleMouseMove, handleMouseUp } = useMouseDrag({ onMove: (dx) => onResize(dx) });

  return (
    <>
      <div className={styles.resizer} onMouseDown={onMouseDown} />
      <DragOverlay
        active={isDragging}
        cursor="ew-resize"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
    </>
  );
};