import React from 'react';
import { useDrag } from '../hooks/useDrag';
import { DragOverlay } from './DragOverlay';
import styles from './Resizer.module.scss';

interface ResizerProps {
  onResize: (deltaWidth: number) => void;
}

export const Resizer: React.FC<ResizerProps> = ({ onResize }) => {
  const { onStart, onMove, onEnd, isDragging } = useDrag({
    onMove: (dx) => onResize(dx),
  });

  return (
    <>
      <div className={styles.resizer} onMouseDown={onStart} onTouchStart={onStart} />
      <DragOverlay
        active={isDragging}
        cursor="ew-resize"
        onMove={onMove}
        onEnd={onEnd}
      />
    </>
  );
};