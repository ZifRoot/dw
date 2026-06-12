// components/PointInfoPanel.tsx
import React, { useState, useEffect } from 'react';
import { AppMediator } from 'src/core/AppMediator';
import { UIPoint } from 'src/core/ui-models';


interface PointInfoPanelProps {
  point: UIPoint;
  mediator: AppMediator;
}

export const PointInfoPanel: React.FC<PointInfoPanelProps> = ({ point, mediator }) => {
  const [text, setText] = useState(point.text);
  const [fixed, setFixed] = useState(point.fixed || false);

  // Обновляем локальное состояние при смене точки (если вдруг пришёл новый объект)
  useEffect(() => {
    setText(point.text);
    setFixed(point.fixed || false);
  }, [point]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;
    setText(newText);
    mediator.updatePoint(point.id, { text: newText });
  };

  const handleFixedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFixed = e.target.checked;
    setFixed(newFixed);
    mediator.updatePoint(point.id, { fixed: newFixed });
  };

  return (
    <div >
      <h3>Информация о точке</h3>
      <button onClick={() => mediator.selectedPoint = null}>Выйти</button>
      {/* className={styles.button} */}
      <div><strong>ID:</strong> {point.id}</div>
      <div>
        <strong>Текст:</strong>
        <input type="text" value={text} onChange={handleTextChange} />
      </div>
      <div><strong>X:</strong> {point.x.toFixed(2)}</div>
      <div><strong>Y:</strong> {point.y.toFixed(2)}</div>
      <label >
        <input type="checkbox" checked={fixed} onChange={handleFixedChange} />
        Зафиксировать (не участвует в физике)
      </label>
    </div>
  );
};