import React, { useEffect, useState } from 'react';
import { AppMediator } from '../core/AppMediator';
import styles from './InfoPanel.module.scss';
import { Point } from 'src/core/Scene/PointsScene';


interface InfoPanelProps {
  mediator: AppMediator;
}

export const InfoPanel: React.FC<InfoPanelProps> = ({ mediator }) => {
  const [point, setPoint] = useState<Point | null>(null);// mediator.selectedPoint);
  const [fixed, setFixed] = useState(point?.fixed || false);

  useEffect(() => {
    const onSelect = ((e: CustomEvent) => {
      const newPoint = e.detail;
      setPoint(newPoint);
      setFixed(newPoint?.fixed || false);
    }) as EventListener;
    mediator.addEventListener('selected-point', onSelect);
    return () => mediator.removeEventListener('selected-point', onSelect);
  }, [mediator]);

  const handleFixedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFixed = e.target.checked;
    setFixed(newFixed);
    if (point) {
      //mediator.setPointFixed(point.id, newFixed);
    }
  };

  return (
    <div className={styles.panel}>
      {/* Кнопка открепления (работает всегда) – это label для скрытого чекбокса float */}
      <label htmlFor="float-panel-toggle" className={styles.floatButton}>
        Открепить
      </label>

      {point ? (
        <>
          <h3>Информация о точке</h3>
          <div><strong>ID:</strong> {point.id}</div>
          <div><strong>Текст:</strong> {point.text}</div>
          <div><strong>X:</strong> {point.x.toFixed(2)}</div>
          <div><strong>Y:</strong> {point.y.toFixed(2)}</div>
          <label className={styles.fixedLabel}>
            <input
              type="checkbox"
              checked={fixed}
              onChange={handleFixedChange}
            />
            Зафиксировать (не участвует в физике)
          </label>
        </>
      ) : (
        <div className={styles.noPoint}>Нажмите на точку, чтобы увидеть информацию</div>
      )}
    </div>
  );
};