// components/Resizer.tsx
import React from 'react';
import { useMouseDrag } from './../hooks/useMouseDrag';
import styles from './Resizer.module.scss';

interface ResizerProps {
  onResize: (deltaWidth: number) => void;
  disabled?: boolean;
}

export const Resizer: React.FC<ResizerProps> = ({ onResize, disabled = false }) => {
  const { onMouseDown } = useMouseDrag({
    onDragMove: (dx) => onResize(dx), // dx = изменение ширины (положительное – увеличение)
    disabled,
  });

  if (disabled) return null;

  return <div className={styles.resizer} onMouseDown={onMouseDown} />;
};