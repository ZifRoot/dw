import React from 'react';
import { useDrag } from '../hooks/useDrag';
import { DragOverlay } from './DragOverlay';
import styles from './DragHandle.module.scss';

interface DragHandleProps {
  onDrag: (dx: number, dy: number) => void;
}

export const DragHandle: React.FC<DragHandleProps> = ({ onDrag }) => {
  const { onStart, onMove, onEnd, isDragging } = useDrag({
    onMove: (dx, dy) => onDrag(dx, dy),
  });

  return (
    <>
      <div
        className={styles.handle}
        onMouseDown={onStart}
        onTouchStart={onStart}
      >
        ⋮⋮
      </div>
      <DragOverlay
        active={isDragging}
        onMove={onMove}
        onEnd={onEnd}
      />
    </>
  );
};