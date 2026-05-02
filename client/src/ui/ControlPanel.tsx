import React, { useEffect, useState } from 'react';
import { CanvasEngine } from '../core/CanvasEngine';
import { AppMediator } from '../core/AppMediator';
import styles from './ControlPanel.module.scss'; // CSS Modules
interface Props {
  engine: CanvasEngine;
}

export const ControlPanel: React.FC<Props> = ({ engine }) => {

  const mediator = engine.mediator;

  const [temperature, setTemperature] = useState(mediator.temperature);
  const [progress, setProgress] = useState(mediator.progress);
  // const [autoZoom, setAutoZoom] = useState(mediator.autoZoom);

  useEffect(() => {
    const onTemp = ((e: CustomEvent) => setTemperature(e.detail)) as EventListener;
    const onProgress = ((e: CustomEvent) => setProgress(e.detail)) as EventListener;
    // const onZoom = (e: CustomEvent) => setAutoZoom(e.detail);
    mediator.addEventListener('temperature', onTemp);
    mediator.addEventListener(AppMediator.PROGRESS, onProgress);
    // mediator.addEventListener('autoZoom', onZoom);
    return () => {
      mediator.removeEventListener('temperature', onTemp);
      mediator.removeEventListener(AppMediator.PROGRESS, onProgress);
      // mediator.removeEventListener('autoZoom', onZoom);
    };
  }, [mediator]);

  return (
    <div className={styles.panel}>
      <button className={styles.button} onClick={() => engine.addPoint()}>
        Добавить точку
      </button>
      <button className={styles.button} onClick={() => engine.clearPoints()}>
        Очистить
      </button>
      <div>Температура: {temperature.toFixed(4)}</div>
      <div>Прогресс: {progress.toFixed(4)}</div>
    </div>
  );
};