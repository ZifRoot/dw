// components/AdaptiveInfoContent.tsx
import React, { useEffect, useState } from "react";
import { EdgeInfoPanel } from "../Panels/EdgeInfoPanel";
import { PointInfoPanel } from "../Panels/PointInfoPanel";
import { AppMediator } from "../../core/AppMediator";
import { UIEdge, UIPoint } from "../../core/models/ui-models";

interface AdaptiveInfoContentProps {
  mediator: AppMediator;
}

export const AdaptiveInfoContent: React.FC<AdaptiveInfoContentProps> = ({
  mediator,
}) => {
  const [selectedPoint, setSelectedPoint] = useState<UIPoint | null>(
    mediator.selectedPoint,
  );
  const [selectedEdge, setSelectedEdge] = useState<UIEdge | null>(
    mediator.selectedEdge,
  );
  const [sizeText, setSizeText] = useState<number>(mediator.sizeText);

  useEffect(() => {
    // Подписка на события выбора через типизированные методы медиатора.
    const unsubPoint = mediator.onSelectedPoint(setSelectedPoint);
    const unsubEdge = mediator.onSelectedEdge(setSelectedEdge);
    const unsubSizeText = mediator.onSizeText(setSizeText);
    return () => {
      unsubPoint();
      unsubEdge();
      unsubSizeText();
    };
  }, [mediator]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    (mediator.sizeText = +e.target.value);

  // Заглушка, когда ничего не выбрано.
  return (
    <>
      {selectedPoint && (
        <PointInfoPanel point={selectedPoint} mediator={mediator} />
      )}
      {selectedEdge && (
        <EdgeInfoPanel edge={selectedEdge} mediator={mediator} />
      )}
      <br />
      <div>Выберите объект (точку или линию)</div>
      <div>
        <input type="number" value={sizeText} onChange={handleTextChange} />
      </div>
    </>
  );
};
