// components/PointInfoPanel.tsx
import React, { useState, useEffect } from "react";
import { AppMediator } from "../../core/AppMediator";
import { UIPoint } from "../../core/ui-models";

interface PointInfoPanelProps {
  point: UIPoint;
  mediator: AppMediator;
}

export const PointInfoPanel: React.FC<PointInfoPanelProps> = ({
  point,
  mediator,
}) => {
  const [text, setText] = useState(point.text);
  const [fixed, setFixed] = useState(point.pinned);

  // Обновляем локальное состояние при смене точки (если вдруг пришёл новый объект).
  useEffect(() => {
    setText(point.text);
    setFixed(point.pinned);
  }, [point]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newText = e.target.value;
    setText(newText);
    mediator.pointChange(point.id, { text: newText });
  };

  const handleFixedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFixed = e.target.checked;
    setFixed(newFixed);
    mediator.pointChange(point.id, { pinned: newFixed });
  };

  return (
    <div>
      <h3>Информация о точке</h3>
      <button
        onClick={() => {
          mediator.selectedPoint = null;
          mediator.selectedEdge = null;
        }}
      >
        Выйти
      </button>
      {/* className={styles.button} */}
      <div>
        <strong>ID:</strong> {point.id}
      </div>
      <div>
        <strong>Текст:</strong>
        <input type="text" value={text} onChange={handleTextChange} />
      </div>
      <div>
        <strong>X:</strong> {point.x.toFixed(2)}
      </div>
      <div>
        <strong>Y:</strong> {point.y.toFixed(2)}
      </div>
      <div>
        <strong>Z:</strong> {point.z.toFixed(2)}
      </div>
      <label>
        <input type="checkbox" checked={fixed} onChange={handleFixedChange} />
        Зафиксировать (не участвует в физике)
      </label>

      {(point.embeddingModelNames ?? []).length > 0 && (
        <div>
          <strong>Embedding models:</strong>
          <div>
            {(point.embeddingModelNames ?? []).map((modelName) => (
              <span
                key={modelName}
                style={{
                  display: "inline-block",
                  margin: "2px 4px 2px 0",
                  padding: "2px 6px",
                  border: "1px solid currentColor",
                  borderRadius: "10px",
                }}
              >
                {modelName}
              </span>
            ))}
          </div>
        </div>
      )}

      <h4>Соседние точки</h4>
      {(point.neighbors ?? []).length > 0 ? (
        <table>
          <thead>
            <tr>
              <th>Название</th>
              <th>Cosine distance</th>
            </tr>
          </thead>
          <tbody>
            {(point.neighbors ?? []).map((neighbor) => (
              <tr key={neighbor.id}>
                <td>{neighbor.name || neighbor.id}</td>
                <td>{neighbor.cosineDistance.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div>Нет соседей</div>
      )}
    </div>
  );
};
