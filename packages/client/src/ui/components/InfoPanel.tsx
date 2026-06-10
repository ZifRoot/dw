// components/InfoPanel.tsx
import React, { useState, useRef, useEffect } from 'react';
import { DragHandle } from './DragHandle';
import { Resizer } from './Resizer';
import styles from './InfoPanel.module.scss';

interface InfoPanelProps {
  children: React.ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  defaultFloating?: boolean;
  defaultPosition?: { x: number; y: number };
}

export const InfoPanel: React.FC<InfoPanelProps> = ({
  children,
  defaultWidth = 280,
  minWidth = 200,
  maxWidth = 600,
  defaultFloating = false,
  defaultPosition = { x: window.innerWidth - defaultWidth - 20, y: 80 },
}) => {
  const [width, setWidth] = useState(defaultWidth);
  const [isFloating, setIsFloating] = useState(defaultFloating);
  const [position, setPosition] = useState(defaultPosition);
  const panelRef = useRef<HTMLDivElement>(null);

  // Подписка на изменение чекбокса (глобальный переключатель)
  useEffect(() => {
    const toggle = document.getElementById('float-panel-toggle') as HTMLInputElement;
    if (!toggle) return;
    const handler = () => setIsFloating(toggle.checked);
    toggle.addEventListener('change', handler);
    return () => toggle.removeEventListener('change', handler);
  }, []);

  const handleResize = (deltaX: number) => {
    setWidth(prev => Math.min(maxWidth, Math.max(minWidth, prev + deltaX)));
  };

  const handleDrag = (dx: number, dy: number) => {
    setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  return (
    <>
      {/* Скрытый чекбокс для CSS-переключения (управляет глобальным классом) */}
      <input type="checkbox" id="float-panel-toggle" style={{ display: 'none' }} defaultChecked={isFloating} />

      <div
        ref={panelRef}
        className={`${styles.panel} ${isFloating ? styles.floating : styles.docked}`}
        style={isFloating ? { width, left: position.x, top: position.y } : { width }}
      >
        {!isFloating && <Resizer onResize={handleResize} />}
        <div className={styles.header}>
          <DragHandle onDrag={handleDrag} disabled={!isFloating} />
          <label htmlFor="float-panel-toggle" className={styles.floatButton}>
            {isFloating ? 'Закрепить' : 'Открепить'}
          </label>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </>
  );
};