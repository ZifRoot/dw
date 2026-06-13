import { SvgEngine } from "../Engines/SvgEngine";
import * as d3 from "d3";
import { EntityCollection } from "./indexer";
import { UIPoint } from "../ui-models";
import { AppMediator } from "../AppMediator";
import { Point } from "../models/Point";

export class PointsScene {
  private rootGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  public entites: EntityCollection<Point>;
  private points: Point[] = [];
  private unregisterDrag: (() => void) | null = null;

  private groupSelection: d3.Selection<Element, Point, SVGGElement, unknown> | null = null;
  private groupMap: Map<string, SVGGElement> = new Map(); // id → DOM-группа

  public onPointMoved: ((point: Point) => void) | null = null;

  constructor(
    private svgEngine: SvgEngine,
    private mediator: AppMediator,
    groupName = "points-scene",
  ) {
    this.entites = new EntityCollection<Point>((p) => p.id);
    this.points = this.entites.items;

    this.rootGroup = svgEngine.createGroup(groupName);
    // Регистрируем детектор перетаскивания для точек
    this.unregisterDrag = this.svgEngine.registerDragDetector((event) => {
      const target = event.target as Element;
      const element = target.closest?.(".point-group");
      if (!element) return null;
      const group = d3.select<Element, Point>(element);
      const point = group.datum();
      if (!point) return null;
      point.fixed = true;
      this.applyUpdatesToGroups(group);
      return {
        element: element,
        callbacks: {
          onDrag: (element, deltaWorld) => {
            const group = d3.select<Element, Point>(element);
            group.each((point) => {
              point.x += deltaWorld[0];
              point.y += deltaWorld[1];
            });

            this.applyUpdatesToGroups(group);
            // .attr("transform", (d) => `translate(${d.x},${d.y})`);
          },
          onDragEnd: (group) => {
            const point = d3.select(group).datum() as Point;
            point.fixed = false;
            if (point && this.onPointMoved) this.onPointMoved(point);
          },
        },
      };
    });

    this.svgEngine.onZoom((transform) => this.updatePointStyles(transform.k));
    this.svgEngine.svg.on("click", (event) => {
      const target = event.target as Element;
      const group = target.closest?.(".point-group");
      if (group) {
        const point = d3.select(group).datum() as Point;
        if (point) {
          const uiPoint: UIPoint = {
            id: point.id,
            x: point.x,
            y: point.y,
            text: point.text,
            fixed: point.fixed ?? false,
          };
          this.mediator!.selectedPoint = uiPoint;
        }
      }
    });
    this.mediator.onPointUpdate(({ pointId, changes }) => {
      const point = this.getPointById(pointId);
      if (!point) return;

      // Обновляем модель
      if (changes.text !== undefined) point.text = changes.text;
      if (changes.fixed !== undefined) point.fixed = changes.fixed;
      if (changes.x !== undefined) point.x = changes.x;
      if (changes.y !== undefined) point.y = changes.y;

      // Обновляем DOM
      this.applyUpdatesToGroups(this.groupSelection!);
    });
    this.mediator.onPointsUpdate(() => this.updateAllPointsPositions());
    this.mediator.onSizeText(() => this.updatePointStyles());
  }

  public init(): void {
    this.setPoints([
      { id: "A", x: 200, y: 150, text: "A" },
      { id: "B", x: 400, y: 350, text: "B" },
    ]);
  }

  // ========== Управление точками ==========

  /** Обновить/добавить точки (upsert) – мутирует массив, обновляет объекты */
  public setPoints(points: Point[]): void {
    const toInsert: Point[] = [];
    const toUpdate: Point[] = [];

    this.entites._setPoints(points, toInsert, toUpdate);

    this.createNewPoints();
    this.applyUpdatesToGroups(this.groupSelection!);
    this.updatePointStyles();
  }

  // ========== Публичные методы для физики и внешнего использования ==========

  /** Получить точку по id (через indexMap) */
  public getPointById(id: string): Point | undefined {
    return this.entites.getPointById(id);
  }

  /** Удалить точки по списку id – мутация массива */
  public removePoints(ids: string[]): void {
    if (ids.length === 0) return;

    // Удаляем DOM-группы и записи из groupMap для удаляемых точек (до мутации массива)
    for (const id of ids) {
      const group = this.groupMap.get(id);
      if (group) d3.select(group).remove();
      this.groupMap.delete(id);
    }

    this._removePoints(ids);
    // Перестраиваем groupSelection после изменений
    // this.rebuildGroupSelection();
    this.applyUpdatesToGroups();

    this.updatePointStyles();
  }

  private _removePoints(ids: string[]) {
    this.entites._removePoints(ids);
  }

  /** Удалить точки по предикату – аналогично, но с перестроением индекса в конце */
  public removePointsBy(predicate: (point: Point) => boolean): void {
    // Предварительно собираем id точек, которые нужно удалить, и удаляем DOM-группы
    const toDeleteIds = this.points.filter((p) => predicate(p)).map((p) => p.id);
    if (toDeleteIds.length === 0) return;
    this.removePoints(toDeleteIds);
  }

  /** Очистить все точки */
  // public clear(): void {
  //   if (this.groupSelection) {
  //     this.groupSelection.remove();
  //     this.groupSelection = null;
  //   }
  //   this.groupMap.clear();
  //   this.points.length = 0;
  //   // this.pointsIndex.clear();
  //   this.setPoints([]);
  // }

  // ========== Приватные методы ==========
  /** Создать новые точки DOM */
  private createNewPoints(): void {
    const existingGroups = this.rootGroup.selectAll<Element, Point>("g.point-group").data(this.points, (d) => d.id);

    // Новые точки появятся в enter
    const enter = existingGroups.enter().append("g").attr("class", "point-group");
    enter.append("circle").attr("class", "point");

    enter.append("text").attr("class", "point-label").attr("dy", "0.35em");

    existingGroups.exit().remove();

    this.groupSelection = this.rootGroup.selectAll<Element, Point>("g.point-group").data(this.points, (d) => d.id);

    // 3. Обновляем groupMap для новых групп
    let groupMap = this.groupMap;
    enter.each(function (d) {
      groupMap.set(d.id, this);
    });
  }

  /** Быстрое обновление позиции одной точки (без перерисовки всей сцены) */
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

  public updateAllPointsPositions(): void {
    if (!this.groupSelection) return;
    this.groupSelection.attr("transform", (d) => `translate(${d.x},${d.y})`);
    if (this.mediator.autoZoom) this.fitView();
  }
  /** Применить обновления (transform, текст, цвет) к D3-селекции групп */
  private applyUpdatesToGroups(selection?: d3.Selection<Element, Point, any, any> | null): void {
    selection ||= this.groupSelection;
    if (!selection) return;
    selection.attr("transform", (d) => `translate(${d.x},${d.y})`);
    selection.select<SVGTextElement>("text.point-label").text((d) => d.text);
    selection.selectAll<SVGCircleElement, Point>("circle.point").attr("fill", (d) => (d.fixed ? "rgb(255, 166, 0)" : "rgb(0, 0, 0)"));
    // datum остаётся тем же объектом
  }

  /** Обновить стили (радиус, обводка, шрифт) в зависимости от масштаба */
  private updatePointStyles(scale?: number): void {
    if (!this.groupSelection) return;
    scale ??= this.svgEngine.getTransform().k;
    const invScale = 1 / scale;

    let sizeText = this.mediator.sizeText;
    this.groupSelection
      .selectAll<SVGCircleElement, Point>("circle.point")
      .attr("r", 20 * invScale)
      .attr("stroke-width", 2 * invScale);
    this.groupSelection.selectAll<SVGTextElement, Point>("text.point-label").style("font-size", `${sizeText * invScale}px`);
  }

  /** Центрировать и масштабировать вид по всем точкам */
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

  public getPoints(): Point[] {
    return this.points;
  }
  // ========== Доступ к SvgEngine (при необходимости) ==========
  public getSvgEngine(): SvgEngine {
    return this.svgEngine;
  }
  public destroy(): void {
    if (this.unregisterDrag) this.unregisterDrag();
  }
}
