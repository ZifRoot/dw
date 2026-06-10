// components/AdaptiveInfoContent.tsx
import React, { useEffect, useState } from 'react';
import { AppMediator } from 'src/core/AppMediator';
import { UIPoint, UIEdge } from 'src/core/ui-models';
import { EdgeInfoPanel } from '../Panels/EdgeInfoPanel';
import { PointInfoPanel } from '../Panels/PointInfoPanel';


interface AdaptiveInfoContentProps {
  mediator: AppMediator;
}

export const AdaptiveInfoContent: React.FC<AdaptiveInfoContentProps> = ({ mediator }) => {
  const [selectedPoint, setSelectedPoint] = useState<UIPoint | null>(mediator.selectedPoint);
  const [selectedEdge, setSelectedEdge] = useState<UIEdge | null>(mediator.selectedEdge);

  useEffect(() => {
    // Подписка на события выбора через типизированные методы медиатора
    const unsubPoint = mediator.onSelectedPoint(setSelectedPoint);
    const unsubEdge = mediator.onSelectedEdge(setSelectedEdge);
    return () => {
      unsubPoint();
      unsubEdge();
    };
  }, [mediator]);

  // Показываем панель точки, если выбрана точка
  if (selectedPoint) {
    return <PointInfoPanel point={selectedPoint} mediator={mediator} />;
  }

  // Показываем панель ребра, если выбрано ребро
  if (selectedEdge) {
    return <EdgeInfoPanel edge={selectedEdge} mediator={mediator} />;
  }

  // Заглушка, когда ничего не выбрано
  return <div >Выберите объект (точку или линию)</div>;
};