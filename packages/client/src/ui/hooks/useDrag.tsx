// hooks/useDrag.ts
import { useState, useCallback, useRef } from 'react';

interface UseDragOptions {
  onStart?: (e: React.TouchEvent | React.MouseEvent) => void;
  onMove: (dx: number, dy: number, e: MouseEvent | TouchEvent) => void;
  onEnd?: (e: MouseEvent | TouchEvent) => void;
  disabled?: boolean;
}

export const useDrag = (options: UseDragOptions) => {
  const { onStart, onMove, onEnd, disabled = false } = options;
  const [isDragging, setIsDragging] = useState(false);
  const lastX = useRef(0);
  const lastY = useRef(0);
  const startEventRef = useRef<React.TouchEvent | React.MouseEvent | null>(null);

  const handleStart = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    startEventRef.current = e;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    lastX.current = clientX;
    lastY.current = clientY;
    setIsDragging(true);
    if (onStart) onStart(e);
  }, [disabled, onStart]);

  const handleMove = useCallback((moveEvent: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    let clientX, clientY;
    if ('touches' in moveEvent) {
      clientX = moveEvent.touches[0].clientX;
      clientY = moveEvent.touches[0].clientY;
    } else {
      clientX = moveEvent.clientX;
      clientY = moveEvent.clientY;
    }
    const dx = clientX - lastX.current;
    const dy = clientY - lastY.current;
    if (dx !== 0 || dy !== 0) {
      onMove(dx, dy, moveEvent);
    }
    lastX.current = clientX;
    lastY.current = clientY;
  }, [isDragging, onMove]);

  const handleEnd = useCallback((endEvent: MouseEvent | TouchEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    if (onEnd) onEnd(endEvent);
    startEventRef.current = null;
  }, [isDragging, onEnd]);

  return {
    onStart: handleStart,
    onMove: handleMove,
    onEnd: handleEnd,
    isDragging,
  };
};