// components/EdgeInfoPanel.tsx
import React, { useState, useEffect } from "react";
import { AppMediator } from "../../core/AppMediator";
import { UIEdge } from "../../core/ui-models";

// import styles from './EdgeInfoPanel.module.scss';

interface EdgeInfoPanelProps {
  edge: UIEdge;
  mediator: AppMediator;
}

export const EdgeInfoPanel: React.FC<EdgeInfoPanelProps> = ({
  edge,
  mediator,
}) => {
  const [visible, setVisible] = useState(edge.visible !== false);

  useEffect(() => {
    setVisible(edge.visible !== false);
  }, [edge]);

  const handleVisibleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVisible = e.target.checked;
    setVisible(newVisible);
    mediator.updateEdge(edge.id, { visible: newVisible });
  };

  return (
    <div>
      <h3>Информация о ребре</h3>
      <div>
        <strong>ID:</strong> {edge.id}
      </div>
      <div>
        <strong>Источник:</strong> {edge.sourceId}
      </div>
      <div>
        <strong>Цель:</strong> {edge.targetId}
      </div>
      <div>
        <strong>Расстояние:</strong> {edge.distance?.toFixed(4) ?? "—"}
      </div>
      <label>
        <input
          type="checkbox"
          checked={visible}
          onChange={handleVisibleChange}
        />
        Отображать линию
      </label>
    </div>
  );
};
