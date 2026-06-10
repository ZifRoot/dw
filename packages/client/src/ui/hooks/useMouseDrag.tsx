// hooks/useMouseDrag.ts
import { useRef, useCallback, useEffect } from 'react';

interface UseMouseDragOptions {
  onDragStart?: (e: MouseEvent) => void;
  onDragMove: (dx: number, dy: number, e: MouseEvent) => void;
  onDragEnd?: (e: MouseEvent) => void;
  disabled?: boolean;
}

export const useMouseDrag = (options: UseMouseDragOptions) => {
  const { onDragStart, onDragMove, onDragEnd, disabled = false } = options;
  const dragActive = useRef(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    dragActive.current = true;

    // Создаём оверлей на весь экран
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.zIndex = '9999';
    overlay.style.backgroundColor = 'transparent';
    overlay.style.cursor = 'grabbing';
    document.body.appendChild(overlay);
    overlayRef.current = overlay;

    let lastX = e.clientX;
    let lastY = e.clientY;

    if (onDragStart) onDragStart(e.nativeEvent);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!dragActive.current) return;
      const dx = moveEvent.clientX - lastX;
      const dy = moveEvent.clientY - lastY;
      if (dx !== 0 || dy !== 0) {
        onDragMove(dx, dy, moveEvent);
      }
      lastX = moveEvent.clientX;
      lastY = moveEvent.clientY;
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      dragActive.current = false;
      if (overlayRef.current) {
        document.body.removeChild(overlayRef.current);
        overlayRef.current = null;
      }
      if (onDragEnd) onDragEnd(upEvent);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [disabled, onDragStart, onDragMove, onDragEnd]);

  useEffect(() => {
    return () => {
      if (overlayRef.current) {
        document.body.removeChild(overlayRef.current);
      }
    };
  }, []);

  return { onMouseDown: handleMouseDown };
};