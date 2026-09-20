import React from "react";
import { AppMediator } from "@core/AppMediator";
import type { UIDocumentPoint } from "@ui/dto/PointDto";
export const DocumentPointInfoPanel: React.FC<{point:UIDocumentPoint;mediator:AppMediator}> = ({point,mediator}) => (
  <div>
    <h3>Document point</h3>
    <button onClick={()=>mediator.selectPoint(null)}>Выйти</button>
    <div><strong>ID:</strong> {point.id}</div>
    <div><strong>Текст:</strong> <input value={point.text} onChange={e=>mediator.pointChange(point.id,{text:e.target.value})}/></div>
    <div><strong>X:</strong> {point.x.toFixed(2)}</div><div><strong>Y:</strong> {point.y.toFixed(2)}</div><div><strong>Z:</strong> {point.z.toFixed(2)}</div>
    <label><input type="checkbox" checked={point.pinned} onChange={e=>mediator.pointChange(point.id,{pinned:e.target.checked})}/> Зафиксировать</label>
    <div><strong>Документ:</strong></div><textarea value={point.largeText} readOnly rows={12} style={{width:"100%"}}/>
    <h4>Соседние точки</h4><div>{point.neighbors.map(n=><div key={n.id}>{n.name || n.id}: {n.distance}</div>)}</div>
  </div>
);