import React from 'react';
import { CanvasEngine } from '../core/CanvasEngine';
import styles from './ControlPanel.module.scss'; // CSS Modules

interface Props {
  engine: CanvasEngine;
}

export const ControlPanel: React.FC<Props> = ({ engine }) => {
  return (
    <div className={styles.panel}>
      <button className={styles.button} onClick={() => engine.addPoint()}>
        Добавить точку
      </button>
      <button className={styles.button} onClick={() => engine.clearPoints()}>
        Очистить
      </button>
    </div>
  );
};