import { DragElem, SvgEngine } from "../Engines/SvgEngine";
import * as d3 from "d3";
import { UIPoint } from "../ui-models";
import { AppMediator } from "../AppMediator";
import { PointModel } from "../models/PointModel";
import { PointGraphManager } from "../PointGraphManager";

export class PointsScene {
  private rootGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private points: PointModel[] = [];
  private unregisterDrag: (() => void) | null = null;
  private d3Points: d3.Selection<SVGGElement, PointModel, SVGGElement, unknown> | null = null;
  private domMap: Map<string, SVGGElement> = new Map();
  private unsubPointsGraphUpdated: () => void;
  private unsubSelectedPoint: () => void;
  private unsubPointUpdate: () => void;
  private unsubPointsUpdating: () => void;
  private unsubSizeText: () => void;

  constructor(
    private svgEngine: SvgEngine,
    private mediator: AppMediator,
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
    this.unsubSelectedPoint = this.mediator.onSelectedPoint((point) => this.selectedPoint(point));
    this.unsubPointUpdate = this.mediator.onPointUpdate(({ pointId, changes }) => this.pointUpdate(pointId, changes));
    this.unsubPointsUpdating = this.mediator.onPointsUpdating(() => this.pointsUpdating());
    this.unsubSizeText = this.mediator.onSizeText(() => this.updatePointStyles());
  }

  public getPointById(id: string): PointModel | null {
    return this.pointGraphManager.getPointById(id);
  }

  public removePoints(ids: string[]): void {
    this.pointGraphManager.removePoints(ids);
  }

  public removePointsBy(predicate: (point: PointModel) => boolean): void {
    const ids = this.points.filter(predicate).map((p) => p.id);
    if (ids.length) this.removePoints(ids);
  }

  public getPoints(): PointModel[] {
    return this.points;
  }

  public selectedPoint(point: UIPoint | null) {
    if (point !== null) return;

    // UI-команда "Выйти" снимает выбор в Model.
    const selectedPoint = this.points.find((item) => item.selected);
    if (selectedPoint) {
      selectedPoint.selected = false;
      // this.domMap.get()
      this.updateAllProperties(this.d3Points);
    }
  }
  public pointUpdate(pointId: string, changes: Partial<Omit<UIPoint, "id">>) {
    const point = this.getPointById(pointId);
    if (!point) return;
    if (changes.text != null) point.text = changes.text;
    if (changes.pinned != null) point.pinned = changes.pinned;
    if (changes.x != null) point.x = changes.x;
    if (changes.y != null) point.y = changes.y;
    if (changes.z != null) point.z = changes.z;
    const group = this.domMap.get(point.id);
    if (group) {
      let d3dom = d3.select<SVGGElement, PointModel>(group);
      if (d3dom) this.updateAllProperties(d3dom);
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
    this.unsubPointsGraphUpdated();
    this.unsubSelectedPoint();
    this.unsubPointUpdate();
    this.unsubPointsUpdating();
    this.unsubSizeText();
  }

  // ========== Приватные методы синхронизации DOM ==========
  private syncDomWithPoints(): void {
    const selection = this.rootGroup.selectAll<SVGGElement, PointModel>("g.point-group").data(this.points, (d) => d.id);

    // Удаляем старые группы и чистим groupMap.
    selection
      .exit<PointModel>()
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
  }

  pointsUpdating() {
    this.updatePositions();
    if (this.mediator.autoZoom) this.fitView();
  }

  private updateAllProperties(d3Sel?: d3.Selection<SVGGElement, PointModel, any, any> | null): void {
    d3Sel ??= this.d3Points;
    if (!d3Sel) return;

    d3Sel
      .classed("dragged", (d) => d.dragged)
      .classed("selected", (d) => d.selected)
      .classed("pinned", (d) => d.pinned);
    d3Sel.select("text.point-label").text((d) => d.text);

    this.updatePositions(d3Sel);
  }

  public updatePositions(d3Sel?: d3.Selection<SVGGElement, PointModel, any, any> | null): void {
    d3Sel ??= this.d3Points;
    if (!d3Sel) return;

    d3Sel.attr("transform", (d) => `translate(${d.x},${d.y})`); // scale(${d.z})
  }

  private updatePointStyles(scale?: number, d3Sel?: d3.Selection<SVGGElement, PointModel, any, any> | null): void {
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

  // ========== Инициализация подсистем ==========

  dragDetector(event: MouseEvent): DragElem {
    if (event.type === "wheel") return null;
    const target = event.target as Element;
    const element = target.closest?.(".point-group");
    if (!element) return null;

    const group = d3.select<SVGGElement, PointModel>(element as SVGGElement);
    const point = group.datum();
    if (!point) return null;

    // Временно фиксируем точку на время перетаскивания.
    point.dragged = true;
    this.updateAllProperties(group);

    return {
      element,
      callbacks: {
        onDrag: (el, deltaWorld) => {
          const g = d3.select<SVGGElement, PointModel>(el as SVGGElement);
          g.each((p) => {
            p.x += deltaWorld[0];
            p.y += deltaWorld[1];
          });
          this.updateAllProperties(g);
        },
        onDragEnd: (el) => {
          const p = d3.select<SVGGElement, PointModel>(el as SVGGElement).datum();
          if (!p) return;
          p.dragged = false;
          this.updateAllProperties(d3.select(el as SVGGElement));

          // Сигнализируем о завершённом изменении Model-позиции.
          this.mediator.pointUpdated(p.id);
        },
      },
    };
  }

  dom2Model(domEle?: Element | null): PointModel | null {
    return this.checkModel(domEle instanceof Element ? d3.select<Element, PointModel>(domEle).datum() : null);
  }

  checkModel(x: any): PointModel | null {
    return x instanceof PointModel ? x : null;
  }

  model2UI(point?: PointModel | null): UIPoint | null {
    return point
      ? {
          id: point.id,
          x: point.x,
          y: point.y,
          z: point.z,
          text: point.text,
          pinned: point.pinned,
        }
      : null;
  }

  groupClick(event: any) {
    const target = event.target as Element;
    const domEle = target.closest?.(".point-group");

    // PointModel.selected — единственный источник состояния выбора.
    const previousPoint = this.points.find((point) => point.selected) ?? null;
    const point = this.dom2Model(domEle);

    if (previousPoint) {
      previousPoint.selected = false;
    }

    // Повторный клик по выбранной точке снимает выбор.
    if (point && point !== previousPoint) {
      point.selected = true;
    }

    this.mediator.selectPoint(point && point !== previousPoint ? this.model2UI(point) : null);
    this.updateAllProperties(this.d3Points);
  }
}
