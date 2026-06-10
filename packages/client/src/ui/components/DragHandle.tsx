// components/DragHandle.tsx
import React from 'react';
import { useMouseDrag } from '../hooks/useMouseDrag';
import styles from './DragHandle.module.scss';

interface DragHandleProps {
  onDrag: (dx: number, dy: number) => void;
  disabled?: boolean;
}

export const DragHandle: React.FC<DragHandleProps> = ({ onDrag, disabled = false }) => {
  const { onMouseDown } = useMouseDrag({
    onDragMove: (dx, dy) => onDrag(dx, dy),
    disabled,
  });

  return (
    <div
      className={`${styles.handle} ${disabled ? styles.disabled : ''}`}
      onMouseDown={!disabled ? onMouseDown : undefined}
    >
      ⋮⋮
    </div>
  );
};