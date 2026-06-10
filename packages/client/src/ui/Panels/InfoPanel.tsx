import React, { useState } from 'react';
import { DragHandle } from '../components/DragHandle';
import { Resizer } from '../components/Resizer';
import styles from './InfoPanel.module.scss';

export const InfoPanel: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isFloating, setIsFloating] = useState(false);
  const [width, setWidth] = useState(280);
  const [position, setPosition] = useState({ x: window.innerWidth - 280 - 20, y: 80 });

  const toggleFloat = () => setIsFloating(v => !v);

  const handleResize = (dx: number) => {
    setWidth(w => Math.min(1600, Math.max(50, w - dx)));
  };

  const handleDrag = (dx: number, dy: number) => {
    setPosition(p => ({ x: p.x + dx, y: p.y + dy }));
  };

  return (
    <div
      className={`${styles.panel} ${isFloating ? styles.floating : styles.docked}`}
      style={isFloating ? { width, left: position.x, top: position.y } : { width }}
    >
      {!isFloating && <Resizer onResize={handleResize} />}
      <div className={styles.header}>
        {isFloating && <DragHandle onDrag={handleDrag} />}
        <button className={styles.floatButton} onClick={toggleFloat}></button>
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
};