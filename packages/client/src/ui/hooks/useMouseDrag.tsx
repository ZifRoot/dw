// hooks/useMouseDrag.ts
import { useState, useCallback, useRef } from 'react';

interface UseMouseDragOptions {
  onStart?: (e: React.MouseEvent) => void;
  onMove: (dx: number, dy: number, e: MouseEvent) => void;
  onEnd?: (e: MouseEvent) => void;
  disabled?: boolean;
}

export const useMouseDrag = (options: UseMouseDragOptions) => {
  const { onStart, onMove, onEnd, disabled = false } = options;
  const [isDragging, setIsDragging] = useState(false);
  const lastX = useRef(0);
  const lastY = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    lastX.current = e.clientX;
    lastY.current = e.clientY;
    if (onStart) onStart(e);
  }, [disabled, onStart]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - lastX.current;
    const dy = e.clientY - lastY.current;
    if (dx !== 0 || dy !== 0) {
      onMove(dx, dy, e);
    }
    lastX.current = e.clientX;
    lastY.current = e.clientY;
  }, [isDragging, onMove]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    if (onEnd) onEnd(e);
  }, [isDragging, onEnd]);

  return {
    onMouseDown: handleMouseDown,
    isDragging,
    handleMouseMove,
    handleMouseUp,
  };
};