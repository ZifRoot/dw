import React, { useEffect, useState } from 'react';
import { AppMediator } from '../../core/AppMediator';
import styles from './ControlPanel.module.scss'; // CSS Modules
interface Props {
  mediator: AppMediator;
}

export const ControlPanel: React.FC<Props> = ({ mediator }) => {
  const [temperature, setTemperature] = useState(mediator.temperature);
  const [progress, setProgress] = useState(mediator.progress);
  const [autoZoom, setAutoZoom] = useState(mediator.autoZoom);
  const [targetSize, setTargetSize] = useState(mediator.targetSize);

  useEffect(() => {
    const unsubTemp = mediator.onTemperature(setTemperature);
    const unsubProgress = mediator.onProgress(setProgress);
    const unsubTarget = mediator.onTargetSize(setTargetSize);
    const unsubAutoZoom = mediator.onAutoZoom(setAutoZoom);
    return () => {
      unsubTemp();
      unsubProgress();
      unsubTarget();
      unsubAutoZoom();
    };
  }, [mediator]);

  const handleTargetSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) mediator.targetSize = val;
  };

  return (
    <div className={styles.panel}>
      <button className={styles.button} onClick={() => mediator.addPoint()}>Добавить точку</button>
      <button className={styles.button} onClick={() => mediator.clearPoints()}>Очистить</button>
      <button className={styles.button} onClick={() => mediator.startRepulsion()}>Старт репульсии</button>
      <div>Температура: {temperature.toFixed(4)}</div>
      <div>Прогресс: {progress.toFixed(4)}</div>
      <div>
        <label>AUTO ZOOM:</label>
        <input type="checkbox" checked={autoZoom} onChange={e => mediator.autoZoom = e.target.checked} />
      </div>
      <div>
        <label>Целевое кол-во точек:</label>
        <input type="number" min="1" max="1000" value={targetSize} onChange={handleTargetSizeChange} />
      </div>
    </div>
  );
};