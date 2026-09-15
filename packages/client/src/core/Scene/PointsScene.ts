import { SvgEngine } from "../Engines/SvgEngine";
import * as d3 from "d3";
import { EntityCollection } from "./indexer";
import { UIPoint } from "../ui-models";
import { AppMediator } from "../AppMediator";
import { PointModel } from "../models/PointModel";
import { PointGraphManager } from "../PointGraphManager";

export class PointsScene {
  private rootGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private pointGraphManager: PointGraphManager;
  private points: PointModel[] = [];
  private edges: EdgeModel[] = [];

  private unregisterDrag: (() => void) | null = null;
  private d3Points: d3.Selection<SVGGElement, PointModel, SVGGElement, unknown> | null = null;
  private groupMap: Map<string, SVGGElement> = new Map();

  constructor(
    private svgEngine: SvgEngine,
    private mediator: AppMediator,
    private pointGraphManager: PointGraphManager,
    groupName = "points-scene",
  ) {
    this.pointGraphManager = pointGraphManager;
    this.syncRefs();
    this.rootGroup = svgEngine.createGroup(groupName);

    this.registerDragDetector();
    this.setupClickHandler();
    this.subscribeToMediatorEvents();
    this.svgEngine.onZoom((transform) => this.updatePointStyles(transform.k));
  }

  // ========== Публичные методы ==========
  public init(): void {
    this.setPoints([]);
  }

  public setPoints(points: PointModel[]): void {
    this.pointGraphManager.updatePoints(points);
    this.syncRefs();
    this.syncDomWithPoints();
  }

  public getPointById(id: string): PointModel | undefined {
    return this.pointGraphManager.getPointCollection().getById(id);
  }

  public get Entities() {
    return this.pointGraphManager.getPointCollection();
  }

  public removePoints(ids: string[]): void {
    if (ids.length === 0) return;
    for (const id of ids) {
      const group = this.groupMap.get(id);
      if (group) d3.select(group).remove();
      this.groupMap.delete(id);
    }
    this.pointGraphManager.getPointCollection().removes(ids);
    this.syncGroupSelectionAndStyles();
  }

  public removePointsBy(predicate: (point: PointModel) => boolean): void {
    const ids = this.points.filter(predicate).map((p) => p.id);
    if (ids.length) this.removePoints(ids);
  }

  public getPoints(): PointModel[] {
    return this.points;
  }

  public updateAllPointsPositions(): void {
    if (!this.d3Points) return;
    this.d3Points.attr("transform", (d) => `translate(${d.x},${d.y}) `); // scale(${d.z})
    if (this.mediator.autoZoom) this.fitView();
  }

  public updatePointPosition(id: string, x: number, y: number): void {
    const group = this.groupMap.get(id);
    if (group) {
      const point = d3.select<SVGGElement, PointModel>(group).datum();
      if (point) {
        point.x = x;
        point.y = y;
        d3.select(group).attr("transform", `translate(${x},${y})`);
      }
    } else {
      console.warn(`updatePointPosition: point ${id} not found`);
    }
  }

  public fitView(padding = 50): void {
    if (this.points.length === 0) return;
    const xs = this.points.map((p) => p.x);
    const ys = this.points.map((p) => p.y);
    const bounds = {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
    this.svgEngine.applyZoomToBounds(bounds, padding);
  }

  public getSvgEngine(): SvgEngine {
    return this.svgEngine;
  }

  public destroy(): void {
    if (this.unregisterDrag) this.unregisterDrag();
  }

  private syncRefs(): void {
    this.points = this.pointGraphManager.getPointsArray();
    this.edges = this.pointGraphManager.getEdgesArray();
  }

  // ========== Приватные методы синхронизации DOM ==========
  private syncDomWithPoints(): void {
    const selection = this.rootGroup.selectAll<SVGGElement, PointModel>("g.point-group").data(this.points, (d) => d.id);

    // Удаляем старые группы и чистим groupMap
    selection
      .exit<PointModel>()
      .each((d) => this.groupMap.delete(d.id))
      .remove();

    // Создаём новые группы
    const enter = selection.enter().append("g").attr("class", "point-group");
    enter.append("circle").attr("class", "point");
    enter.append("text").attr("class", "point-label").attr("dy", "0.35em");

    // Добавляем новые записи в groupMap
    const map = this.groupMap;
    enter.each(function (d) {
      map.set(d.id, this);
    });

    this.d3Points = selection.merge(enter);
    this.applyUpdatesToGroups();
    this.updatePointStyles();
  }

  private syncGroupSelectionAndStyles(): void {
    // Пересоздаём groupSelection без удаления DOM (группы уже удалены отдельно)
    this.d3Points = this.rootGroup.selectAll<SVGGElement, PointModel>("g.point-group").data(this.points, (d) => d.id);
    this.applyUpdatesToGroups();
    this.updatePointStyles();
  }

  private applyUpdatesToGroups(selection?: d3.Selection<SVGGElement, PointModel, any, any> | null): void {
    const target = selection ?? this.d3Points;
    if (!target) return;

    const s = this.svgEngine.getTransform().k;
    const inv = 1 / s;
    target
      .classed("gragged", (d) => d.dragged)
      .classed("selected", (d) => d.selected)
      .classed("pinned", (d) => d.pinned)
      .attr("transform", (d) => `translate(${d.x},${d.y})`); // scale(${d.z})
    target.select("text.point-label").text((d) => d.text);
    // target
    //   .select("circle.point")
    //   // .attr("r",(d)=>d.z 20 * inv)
    //   .attr("fill", (d) => (d.fixed ? "#ffaa44" : "#00ff001e"));
    if (this.mediator.autoZoom) this.fitView();
  }

  private updatePointStyles(scale?: number): void {
    if (!this.d3Points) return;
    const s = scale ?? this.svgEngine.getTransform().k;
    const inv = 1 / s;
    const fontSize = this.mediator.sizeText;
    this.d3Points
      .selectAll("circle.point")
      .attr("r", 20 * inv)
      .attr("stroke-width", 2 * inv);
    this.d3Points.selectAll("text.point-label").style("font-size", `${fontSize * inv}px`);
  }

  // ========== Инициализация подсистем ==========
  private registerDragDetector(): void {
    this.unregisterDrag = this.svgEngine.registerDragDetector((event) => {
      const target = event.target as Element;
      const element = target.closest?.(".point-group");
      if (event.type === "wheel") return null;
      if (!element) return null;

      const group = d3.select<SVGGElement, PointModel>(element as SVGGElement);
      const point = group.datum();
      if (!point) return null;

      // Временно фиксируем точку на время перетаскивания
      point.dragged = true;
      this.applyUpdatesToGroups(group);

      return {
        element,
        callbacks: {
          onDrag: (el, deltaWorld) => {
            const g = d3.select<SVGGElement, PointModel>(el as SVGGElement);
            g.each((p) => {
              p.x += deltaWorld[0];
              p.y += deltaWorld[1];
            });
            this.applyUpdatesToGroups(g);
          },
          onDragEnd: (el) => {
            const p = d3.select<SVGGElement, PointModel>(el as SVGGElement).datum();
            p.dragged = false;
            this.applyUpdatesToGroups(d3.select(el as SVGGElement));
            this.mediator.startRepulsion();
          },
        },
      };
    });
  }

  dom2Model(domEle?: Element | null): PointModel | null {
    // Если кликнули по пустому месту - снимаем выделение
    if (!domEle) return null;

    let d3Ele = d3.select<SVGGElement, PointModel>(domEle as SVGGElement);
    return d3Ele.datum();
  }

  model2UI(point?: PointModel | null): UIPoint | null {
    return point
      ? {
          id: point.id,
          x: point.x,
          y: point.y,
          z: point.z,
          text: point.text,
          fixed: point.pinned ?? false,
        }
      : null;
  }

  private setupClickHandler(): void {
    this.rootGroup.on("click", (event) => {
      const target = event.target as Element;
      const domEle = target.closest?.(".point-group");

      // Получаем предыдущую выбранную точку из медиатора
      const previousSelectedId = this.mediator.selectedPoint?.id;
      const previousPoint = previousSelectedId ? (this.pointGraphManager.getPointCollection().getById(previousSelectedId) ?? null) : null;

      if (previousPoint) {
        previousPoint.selected = false;
      }

      // Если кликнули по пустому месту - снимаем выделение
      const point = this.dom2Model(domEle);

      // Переключаем состояние текущей точки
      if (point) point.selected = point.id != previousSelectedId;

      this.mediator.selectedPoint = this.model2UI(point);

      this.applyUpdatesToGroups(this.d3Points);
    });
  }

  private subscribeToMediatorEvents(): void {
    this.mediator.onPointUpdate(({ pointId, changes }) => {
      const point = this.getPointById(pointId);
      if (!point) return;
      if (changes.text !== undefined) point.text = changes.text;
      if (changes.fixed !== undefined) point.pinned = changes.fixed;
      if (changes.x !== undefined) point.x = changes.x;
      if (changes.y !== undefined) point.y = changes.y;
      this.applyUpdatesToGroups(this.d3Points);
    });
    this.mediator.onPointsUpdating(() => this.updateAllPointsPositions());
    this.mediator.onSizeText(() => this.updatePointStyles());
  }
}
