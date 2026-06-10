// components/DragHandle.tsx
import React from 'react';
import { useMouseDrag } from '../hooks/useMouseDrag';
import { DragOverlay } from './DragOverlay';
import styles from './DragHandle.module.scss';

interface DragHandleProps {
  onDrag: (dx: number, dy: number) => void;
}

export const DragHandle: React.FC<DragHandleProps> = ({ onDrag }) => {
  const { onMouseDown, isDragging, handleMouseMove, handleMouseUp } = useMouseDrag({
    onMove: (dx, dy) => onDrag(dx, dy),
  });

  return (
    <>
      <div
        className={styles.handle}
        onMouseDown={onMouseDown}
      >
        ⋮⋮
      </div>
      <DragOverlay
        active={isDragging}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      />
    </>
  );
};