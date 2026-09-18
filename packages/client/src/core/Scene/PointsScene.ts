import { DragElem, SvgEngine } from "../Engines/SvgEngine";
import * as d3 from "d3";
import { UIPoint } from "../models/ui-models";
import { AppMediator } from "../AppMediator";
import { Point } from "../models/Point";
import { EdgeModel } from "../models/EdgeModel";
import { PointGraphManager } from "../collections/PointGraphManager";
import { PointModel } from "../models/PointModel";

export class PointsScene {
  private rootGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private points: Point[] = [];
  private unregisterDrag: (() => void) | null = null;
  private d3Points: d3.Selection<SVGGElement, Point, SVGGElement, unknown> | null = null;
  private domMap: Map<string, SVGGElement> = new Map();
  private unsubPointsGraphUpdated: () => void;
  // private unsubSelectedPoint: () => void;
  private unsubPointChange: () => void;
  private unsubPointsUpdating: () => void;
  private unsubSizeText: () => void;

  constructor(
    private mediator: AppMediator,
    private svgEngine: SvgEngine,
    private pointGraphManager: PointGraphManager,
    groupName = "points-scene",
  ) {
    this.points = this.pointGraphManager.getPointsArray();

    this.rootGroup = svgEngine.createGroup(groupName);
    this.rootGroup.on("click", (event) => this.groupClick(event));

    this.unregisterDrag = this.svgEngine.registerDragDetector((event) => this.dragDetector(event));
    this.svgEngine.onZoom((transform) => this.updatePointStyles(transform.k));
    // Подписка на обновление графа точек (без передачи данных).
    this.unsubPointsGraphUpdated = this.mediator.onPointsGraphUpdated(() => this.syncDomWithPoints());
    // this.unsubSelectedPoint = this.mediator.onSelectedPoint((point) => this.selectedPoint(point));
    this.unsubPointChange = this.mediator.onPointChange(({ pointId, changes }) => this.pointChange(pointId, changes));
    this.unsubPointsUpdating = this.mediator.onPointsUpdating(() => this.pointsUpdating());
    this.unsubSizeText = this.mediator.onSizeText(() => this.updatePointStyles());
    this.mediator.onAutoZoom(() => this.fitView());
  }

  public getPointById(id?: string | null): Point | null {
    return id != null ? this.pointGraphManager.getPointById(id) : null;
  }

  public removePoints(ids: string[]): void {
    this.pointGraphManager.removePoints(ids);
  }

  public removePointsBy(predicate: (point: Point) => boolean): void {
    const ids = this.points.filter(predicate).map((p) => p.id);
    if (ids.length) this.removePoints(ids);
  }

  public getPoints(): Point[] {
    return this.points;
  }

  public pointChange(pointId: string, changes: Partial<Omit<UIPoint, "id">>) {
    const point = this.getPointById(pointId);
    if (!point) return;
    if (changes.text != null) point.text = changes.text;
    if (changes.pinned != null) point.pinned = changes.pinned;
    if (changes.selected != null) point.selected = changes.selected;
    if (changes.x != null) point.x = changes.x;
    if (changes.y != null) point.y = changes.y;
    if (changes.z != null) point.z = changes.z;
    this.mediator.pointUpdated(pointId);
    this.updateUIById(pointId);
  }

  public fitView(padding = 50): void {
    if (!this.mediator.autoZoom) return;
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
    this.unsubPointsGraphUpdated();
    // this.unsubSelectedPoint();
    this.unsubPointChange();
    this.unsubPointsUpdating();
    this.unsubSizeText();
  }

  // ========== Приватные методы синхронизации DOM ==========
  private syncDomWithPoints(): void {
    const selection = this.rootGroup.selectAll<SVGGElement, Point>("g.point-group").data(this.points, (d) => d.id);

    // Удаляем старые группы и чистим groupMap.
    selection
      .exit<Point>()
      .each((d) => this.domMap.delete(d.id))
      .remove();

    // Создаём новые группы.
    const enter = selection.enter().append("g").attr("class", "point-group");
    enter.append("circle").attr("class", "point");
    enter.append("text").attr("class", "point-label").attr("dy", "0.35em");

    // Добавляем новые записи в groupMap.
    const map = this.domMap;
    enter.each(function (d) {
      map.set(d.id, this);
    });

    this.d3Points = selection.merge(enter);
    this.updateAllProperties();
    this.updatePointStyles();

    // Обновляем информацию о соседях для выбранной точки.
    const selectedPointId = this.mediator.selectedPoint?.id;
    if (selectedPointId) {
      const selectedPoint = this.pointGraphManager.getPointById(selectedPointId);
      if (selectedPoint) {
        this.mediator.selectedPoint = this.model2UI(selectedPoint);
      }
    }
  }

  pointsUpdating() {
    this.updatePositions();
    if (this.mediator.autoZoom) this.fitView();
  }

  private updateAllProperties(d3Sel?: d3.Selection<SVGGElement, Point, any, any> | null): void {
    d3Sel ??= this.d3Points;
    if (!d3Sel) return;

    d3Sel
      .classed("dragged", (d) => d.dragged)
      .classed("selected", (d) => d.selected)
      .classed("pinned", (d) => d.pinned);
    d3Sel.select("text.point-label").text((d) => d.text);

    this.updatePositions(d3Sel);
  }

  public updatePositions(d3Sel?: d3.Selection<SVGGElement, Point, any, any> | null): void {
    d3Sel ??= this.d3Points;
    if (!d3Sel) return;

    d3Sel.attr("transform", (d) => `translate(${d.x},${d.y})`); // scale(${d.z})
  }

  private updatePointStyles(scale?: number, d3Sel?: d3.Selection<SVGGElement, Point, any, any> | null): void {
    d3Sel ??= this.d3Points;
    if (!d3Sel) return;

    const s = scale ?? this.svgEngine.getTransform().k;
    const inv = 1 / s;
    const fontSize = this.mediator.sizeText;
    d3Sel
      .selectAll("circle.point")
      .attr("r", 20 * inv)
      .attr("stroke-width", 2 * inv);
    d3Sel.selectAll("text.point-label").style("font-size", `${fontSize * inv}px`);
  }

  updateUIById(pointId: string) {
    const domEle = this.domMap.get(pointId);
    if (!domEle) return;
    let d3dom = d3.select<SVGGElement, Point>(domEle);
    if (d3dom) this.updateAllProperties(d3dom);
  }
  // ========== Инициализация подсистем ==========

  dragDetector(event: MouseEvent): DragElem {
    if (event.type === "wheel") return null;
    const target = event.target as Element;
    const element = target.closest?.(".point-group");
    if (!element) return null;

    const group = d3.select<SVGGElement, Point>(element as SVGGElement);
    const point = group.datum();
    if (!point) return null;

    // Временно фиксируем точку на время перетаскивания.
    point.dragged = true;
    this.updateAllProperties(group);

    return {
      element,
      callbacks: {
        onDrag: (el, deltaWorld) => {
          const d3Dom = d3.select<SVGGElement, Point>(el as SVGGElement);
          const p = d3Dom.datum();
          if (!p) return;
          d3Dom.each((p) => {
            p.x += deltaWorld[0];
            p.y += deltaWorld[1];
          });
          this.updateAllProperties(d3Dom);
          this.mediator.pointUpdating(p.id);
        },
        onDragEnd: (el) => {
          const d3Dom = d3.select<SVGGElement, Point>(el as SVGGElement);
          const p = d3Dom.datum();
          if (!p) return;
          p.dragged = false;
          this.updateAllProperties(d3Dom);

          // Сигнализируем о завершённом изменении Model-позиции.
          this.mediator.pointUpdated(p.id);
        },
      },
    };
  }

  dom2Point(domEle?: Element | null): Point | null {
    return this.checkModel(domEle instanceof Element ? d3.select<Element, Point>(domEle).datum() : null);
  }

  checkModel(x: any): Point | null {
    return x instanceof Point ? x : null;
  }

  model2UI(point?: Point | null): UIPoint | null {
    if (!point) return null;

    const neighbors = this.pointGraphManager
      .getEdgesForPoint(point.id)
      .map((edge) => {
        const neighborId = edge.sourceId === point.id ? edge.targetId : edge.sourceId;
        const neighbor = this.pointGraphManager.getPointById(neighborId);
        if (!neighbor) return null;

        return {
          id: neighbor.id,
          name: neighbor.text,
          cosineDistance: edge instanceof EdgeModel ? edge.cosineDistance : undefined,
        };
      })
      .filter((neighbor): neighbor is NonNullable<typeof neighbor> => neighbor !== null)
      .sort((a, b) => (a.cosineDistance || 0) - (b.cosineDistance || 0));

    return {
      id: point.id,
      x: point.x,
      y: point.y,
      z: point.z,
      text: point.text,
      pinned: point.pinned,
      selected: point.selected,
      neighbors,
      embeddingModelNames: point instanceof PointModel ? Array.from(point.embeddings.values()).map((embedding) => embedding.modelName) : undefined,
    };
  }

  groupClick(event: any) {
    const target = event.target as Element;
    const domEle = target.closest?.(".point-group");

    const previousPoint = this.getPointById(this.mediator.selectedPoint?.id);

    if (previousPoint) {
      previousPoint.selected = false;
      this.updateUIById(previousPoint.id);
    }

    const point = this.dom2Point(domEle);

    // Повторный клик по выбранной точке снимает выбор.
    if (point && point !== previousPoint) {
      point.selected = true;
      this.updateUIById(point.id);
    }

    this.mediator.selectedPoint = point !== previousPoint ? this.model2UI(point) : null;
  }
}
