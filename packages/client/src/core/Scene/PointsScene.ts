import { SvgEngine } from "../Engines/SvgEngine";
import * as d3 from "d3";
import { EntityCollection } from "./indexer";
import { UIPoint } from "../ui-models";
import { AppMediator } from "../AppMediator";
import { Point } from "../models/Point";

export class PointsScene {
  private rootGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  public entities: EntityCollection<Point>; // исправлено имя
  private points: Point[] = [];

  private unregisterDrag: (() => void) | null = null;
  private groupSelection: d3.Selection<SVGGElement, Point, SVGGElement, unknown> | null = null;
  private groupMap: Map<string, SVGGElement> = new Map();

  public onPointMoved: ((point: Point) => void) | null = null;

  constructor(
    private svgEngine: SvgEngine,
    private mediator: AppMediator,
    groupName = "points-scene",
  ) {
    this.entities = new EntityCollection<Point>((p) => p.id);
    this.points = this.entities.items;
    this.rootGroup = svgEngine.createGroup(groupName);

    this.registerDragDetector();
    this.setupClickHandler();
    this.subscribeToMediatorEvents();
    this.svgEngine.onZoom((transform) => this.updatePointStyles(transform.k));
  }

  // ========== Публичные методы ==========
  public init(): void {
    this.setPoints([
      { id: "A", x: 200, y: 150, text: "A" },
      { id: "B", x: 400, y: 350, text: "B" },
    ]);
  }

  public setPoints(points: Point[]): void {
    const toInsert: Point[] = [];
    const toUpdate: Point[] = [];
    this.entities._setPoints(points, toInsert, toUpdate);
    this.syncDomWithPoints();
  }

  public getPointById(id: string): Point | undefined {
    return this.entities.getPointById(id);
  }

  public removePoints(ids: string[]): void {
    if (ids.length === 0) return;
    for (const id of ids) {
      const group = this.groupMap.get(id);
      if (group) d3.select(group).remove();
      this.groupMap.delete(id);
    }
    this.entities._removePoints(ids);
    this.syncGroupSelectionAndStyles();
  }

  public removePointsBy(predicate: (point: Point) => boolean): void {
    const ids = this.points.filter(predicate).map((p) => p.id);
    if (ids.length) this.removePoints(ids);
  }

  public getPoints(): Point[] {
    return this.points;
  }

  public updateAllPointsPositions(): void {
    if (!this.groupSelection) return;
    this.groupSelection.attr("transform", (d) => `translate(${d.x},${d.y})`);
    if (this.mediator.autoZoom) this.fitView();
  }

  public updatePointPosition(id: string, x: number, y: number): void {
    const group = this.groupMap.get(id);
    if (group) {
      const point = d3.select(group).datum() as Point;
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

  // ========== Приватные методы синхронизации DOM ==========
  private syncDomWithPoints(): void {
    const selection = this.rootGroup.selectAll<SVGGElement, Point>("g.point-group").data(this.points, (d) => d.id);

    // Удаляем старые группы и чистим groupMap
    selection
      .exit()
      .each((d) => {
        this.groupMap.delete(d.id);
      })
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

    this.groupSelection = selection.merge(enter);
    this.applyUpdatesToGroups(this.groupSelection);
    this.updatePointStyles();
  }

  private syncGroupSelectionAndStyles(): void {
    // Пересоздаём groupSelection без удаления DOM (группы уже удалены отдельно)
    this.groupSelection = this.rootGroup.selectAll<SVGGElement, Point>("g.point-group").data(this.points, (d) => d.id);
    this.applyUpdatesToGroups(this.groupSelection);
    this.updatePointStyles();
  }

  private applyUpdatesToGroups(selection?: d3.Selection<SVGGElement, Point, any, any> | null): void {
    const target = selection ?? this.groupSelection;
    if (!target) return;
    target.attr("transform", (d) => `translate(${d.x},${d.y})`);
    target.select<SVGTextElement>("text.point-label").text((d) => d.text);
    target.select<SVGCircleElement>("circle.point").attr("fill", (d) => (d.fixed ? "#ffaa44" : "steelblue"));
  }

  private updatePointStyles(scale?: number): void {
    if (!this.groupSelection) return;
    const s = scale ?? this.svgEngine.getTransform().k;
    const inv = 1 / s;
    const fontSize = this.mediator.sizeText;
    this.groupSelection
      .selectAll<SVGCircleElement, Point>("circle.point")
      .attr("r", 20 * inv)
      .attr("stroke-width", 2 * inv);
    this.groupSelection.selectAll<SVGTextElement, Point>("text.point-label").style("font-size", `${fontSize * inv}px`);
  }

  // ========== Инициализация подсистем ==========
  private registerDragDetector(): void {
    this.unregisterDrag = this.svgEngine.registerDragDetector((event) => {
      const target = event.target as Element;
      const element = target.closest?.(".point-group");
      if (!element) return null;

      const group = d3.select<SVGGElement, Point>(element);
      const point = group.datum();
      if (!point) return null;

      // Временно фиксируем точку на время перетаскивания
      point.fixed = true;
      this.applyUpdatesToGroups(group);

      return {
        element,
        callbacks: {
          onDrag: (el, deltaWorld) => {
            const g = d3.select<SVGGElement, Point>(el);
            g.each((p) => {
              p.x += deltaWorld[0];
              p.y += deltaWorld[1];
            });
            this.applyUpdatesToGroups(g);
          },
          onDragEnd: (el) => {
            const p = d3.select(el).datum() as Point;
            p.fixed = false;
            this.applyUpdatesToGroups(d3.select(el));
            if (p && this.onPointMoved) this.onPointMoved(p);
          },
        },
      };
    });
  }

  private setupClickHandler(): void {
    this.rootGroup.on("click", (event) => {
      const target = event.target as Element;
      const group = target.closest?.(".point-group");
      if (!group) return;
      const point = d3.select(group).datum() as Point;
      if (!point) return;
      const uiPoint: UIPoint = {
        id: point.id,
        x: point.x,
        y: point.y,
        text: point.text,
        fixed: point.fixed ?? false,
      };
      this.mediator.selectedPoint = uiPoint;
    });
  }

  private subscribeToMediatorEvents(): void {
    this.mediator.onPointUpdate(({ pointId, changes }) => {
      const point = this.getPointById(pointId);
      if (!point) return;
      if (changes.text !== undefined) point.text = changes.text;
      if (changes.fixed !== undefined) point.fixed = changes.fixed;
      if (changes.x !== undefined) point.x = changes.x;
      if (changes.y !== undefined) point.y = changes.y;
      this.applyUpdatesToGroups(this.groupSelection);
    });
    this.mediator.onPointsUpdate(() => this.updateAllPointsPositions());
    this.mediator.onSizeText(() => this.updatePointStyles());
  }
}
