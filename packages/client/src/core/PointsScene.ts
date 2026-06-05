import { SvgEngine } from "./SvgEngine";
import * as d3 from "d3";

export interface Point {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}

export class PointsScene {
  private svgEngine: SvgEngine;
  private points: Point[] = [];
  private pointsIndex: Map<string, number> = new Map(); // id → индекс в массиве
  private groupSelection: d3.Selection<SVGGElement, Point, SVGGElement, unknown> | null = null;
  private groupMap: Map<string, SVGGElement> = new Map(); // id → DOM-группа

  public onPointMoved: ((point: Point) => void) | null = null;

  constructor(element: HTMLElement) {
    this.svgEngine = new SvgEngine(element);

    this.svgEngine.setDragHandler(
      {
        onDrag: (group, deltaWorld) => {
          const point = d3.select(group).datum() as Point;
          if (point) {
            point.x += deltaWorld[0];
            point.y += deltaWorld[1];
            d3.select(group).attr("transform", `translate(${point.x},${point.y})`);
          }
        },
        onDragEnd: (group) => {
          const point = d3.select(group).datum() as Point;
          if (point && this.onPointMoved) this.onPointMoved(point);
        },
      },
      (event) => (event?.target as Element)?.closest?.(".point-group") || null,
    );

    this.svgEngine.setZoomCallback((transform) => this.updatePointStyles(transform.k));
  }

  public init(): void {
    this.setPoints([
      { id: "A", x: 200, y: 150, text: "A", color: "red" },
      { id: "B", x: 400, y: 350, text: "B", color: "blue" },
    ]);
  }

  // ========== Управление точками ==========

  /** Обновить/добавить точки (upsert) – мутирует массив, обновляет объекты */
  public setPoints(points: Point[]): void {
    const toInsert: Point[] = [];
    const toUpdate: Point[] = [];

    for (const p of points) {
      if (this.pointsIndex.has(p.id)) {
        const idx = this.pointsIndex.get(p.id)!;
        // Обновляем существующий объект (сохраняем ссылку)
        Object.assign(this.points[idx], p);
        toUpdate.push(p);
      } else {
        toInsert.push(p);
      }
    }

    if (toInsert.length) {
      this.points.push(...toInsert);
      const startIdx = this.points.length;
      for (let i = 0; i < toInsert.length; i++) this.pointsIndex.set(toInsert[i].id, startIdx + i);
    }

    let targetSelection = this.updateExistingPoints(toUpdate);
    if (targetSelection) {
      this.applyUpdatesToGroups(targetSelection);
    }
    this.createNewPoints(toInsert);
    this.rebuildGroupSelection();

    const scale = this.svgEngine.getTransform().k;
    this.updatePointStyles(scale);
  }

  // ========== Приватные методы ==========

  /** Мутировать существующие модели и обновить DOM */
  private updateExistingPoints(points: Point[]): d3.Selection<SVGGElement, Point, any, any> | null {
    if (points.length === 0) return null;

    const total = this.points.length;
    const useMassUpdate = points.length > total / 4;

    if (useMassUpdate) {
      return this.groupSelection;
    }
    const updElements = points.map((p) => this.groupMap.get(p.id)).filter((el): el is SVGGElement => el !== undefined);
    if (updElements.length === 0) return null;
    return d3.selectAll(updElements);
  }

  /** Применить обновления (transform, текст, цвет) к D3-селекции групп */
  private applyUpdatesToGroups(selection: d3.Selection<SVGGElement, Point, any, any>): void {
    selection.attr("transform", (d) => `translate(${d.x},${d.y})`);
    selection.select<SVGTextElement>("text.point-label").text((d) => d.text);
    selection.select<SVGCircleElement>("circle.point").attr("fill", (d) => d.color);
    // datum остаётся тем же объектом
  }

  /** Перестроить groupSelection после структурных изменений (добавление/удаление) */
  private rebuildGroupSelection(): void {
    this.groupSelection = this.svgEngine.container.selectAll<SVGGElement, Point>("g.point-group").data(this.points, (d) => d.id);
  }

  // ========== Публичные методы для физики и внешнего использования ==========

  /** Получить точку по id (через indexMap) */
  public getPointById(id: string): Point | undefined {
    const idx = this.pointsIndex.get(id);
    return idx !== undefined ? this.points[idx] : undefined;
  }

  /** Удалить точки по списку id – мутация массива */
  public removePoints(ids: string[]): void {
    if (ids.length === 0) return;
    const toDelete = new Set(ids);
    // Удаляем DOM-группы и записи из groupMap для удаляемых точек (до мутации массива)
    for (const id of ids) {
      const group = this.groupMap.get(id);
      if (group) d3.select(group).remove();
      this.groupMap.delete(id);
    }

    let i, tail;
    for (i = 0, tail = this.points.length - 1; i <= tail; i++, tail--) {
      // Пропускаем живые элементы слева
      while (i <= tail && !toDelete.has(this.points[i].id)) i++;
      // Пропускаем удаляемые элементы справа
      while (i <= tail && toDelete.has(this.points[tail].id)) tail--;
      if (i >= tail) break;
      // Замена: последний живой элемент затирает удаляемый
      const replacement = this.points[tail];
      // Удаляем старую запись индекса для точки, которая будет перезаписана
      this.pointsIndex.delete(this.points[i].id);
      this.points[i] = replacement;
      this.pointsIndex.set(replacement.id, i);
    }

    const newLength = tail + 1;
    // Удаляем из индекса все id удалённых точек (оставшиеся в хвосте)
    for (let j = newLength; j < this.points.length; j++) {
      const point = this.points[j];
      if (point) this.pointsIndex.delete(point.id);
      this.points[j] = null as any;
    }
    this.points.length = newLength;
    // Перестраиваем groupSelection после изменений
    this.rebuildGroupSelection();
    const scale = this.svgEngine.getTransform().k;
    this.updatePointStyles(scale);
  }

  /** Удалить точки по предикату – аналогично, но с перестроением индекса в конце */
  public removePointsBy(predicate: (point: Point) => boolean): void {
    // Предварительно собираем id точек, которые нужно удалить, и удаляем DOM-группы
    const toDeleteIds: string[] = [];
    for (const p of this.points) {
      if (predicate(p)) toDeleteIds.push(p.id);
    }
    if (toDeleteIds.length === 0) return;
    this.removePoints(toDeleteIds);
  }

  /** Очистить все точки */
  public clear(): void {
    if (this.groupSelection) {
      this.groupSelection.remove();
      this.groupSelection = null;
    }
    this.groupMap.clear();
    this.points.length = 0;
    this.pointsIndex.clear();
    this.setPoints([]);
  }

  // ========== Приватные методы ==========
  /** Создать новые точки DOM */
  private createNewPoints(points: Point[]): void {
    if (points.length === 0) return;

    for (const p of points) {
      const enter = this.svgEngine.createGroup("point-group").datum(p);
      enter.attr("transform", (d) => `translate(${d.x},${d.y})`);
      enter.append("circle").attr("class", "point").attr("r", 20).attr("stroke-width", 2);
      enter
        .append("text")
        .attr("class", "point-label")
        .text((d) => d.text)
        // .attr("text-anchor", "middle")
        .attr("dy", "0.35em");

      this.groupMap.set(p.id, enter.node() as SVGGElement);
    }

    const currentScale = this.svgEngine.getTransform().k;
    this.updatePointStyles(currentScale);
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
    if (this.groupSelection) {
      this.groupSelection.attr("transform", (d) => `translate(${d.x},${d.y})`);
    }
  }

  /** Обновить стили (радиус, обводка, шрифт) в зависимости от масштаба */
  private updatePointStyles(scale: number): void {
    if (!this.groupSelection) return;
    const invScale = 1 / scale;
    this.groupSelection
      .selectAll<SVGCircleElement, Point>("circle.point")
      .attr("r", 20 * invScale)
      .attr("stroke-width", 2 * invScale);
    this.groupSelection.selectAll<SVGTextElement, Point>("text.point-label").style("font-size", `${16 * invScale}px`);
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
}
