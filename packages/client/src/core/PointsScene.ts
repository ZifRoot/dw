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
    this.points = [
      { id: "A", x: 200, y: 150, text: "A", color: "red" },
      { id: "B", x: 400, y: 350, text: "B", color: "blue" },
    ];
    this.render();
  }

  // ========== Управление точками ==========

  /** Обновить/добавить точки (upsert) – мутирует массив, обновляет объекты */
  public setPoints(points: Point[]): void {
    const toInsert: Point[] = [];
    for (const p of points) {
      const idx = this.pointsIndex.get(p.id);
      if (idx !== undefined) {
        // Обновляем существующий объект (сохраняем ссылку)
        Object.assign(this.points[idx], p);
      } else {
        toInsert.push(p);
      }
    }
    if (toInsert.length) {
      const startIdx = this.points.length;
      for (let i = 0; i < toInsert.length; i++) {
        const p = toInsert[i];
        this.points.push(p);
        this.pointsIndex.set(p.id, startIdx + i);
      }
    }
    this.render();
  }

  /** Удалить точки по списку id – оптимизированная версия с двумя бегунками и for */
  public removePoints(ids: string[]): void {
    if (ids.length === 0) return;
    const toDelete = new Set(ids);
    let i, tail;
    for (i = 0, tail = this.points.length - 1; i <= tail; i++, tail--) {
      // Пропускаем живые элементы слева
      while (i <= tail && !toDelete.has(this.points[i].id)) i++;
      // Пропускаем удаляемые элементы справа
      while (i <= tail && toDelete.has(this.points[tail].id)) tail--;
      if (i >= tail) break;
      // Замена: последний живой элемент затирает удаляемый
      const replacement = this.points[tail];
      this.pointsIndex.delete(this.points[i].id);
      this.points[i] = replacement;
      this.pointsIndex.set(replacement.id, i);
      // i++ и tail-- произойдут в третьем блоке for
    }

    const newLength = tail + 1; // tail после цикла – индекс последнего живого элемента
    // Зануляем хвост для сборщика мусора
    for (let j = newLength; j < this.points.length; j++) {
      this.points[j] = null as any;
    }
    this.points.length = newLength;

    // Удаляем из индекса все id удалённых точек
    for (const id of ids) {
      this.pointsIndex.delete(id);
    }

    this.render();
  }

  /** Удалить точки по предикату – аналогично, но с перестроением индекса в конце */
  public removePointsBy(predicate: (point: Point) => boolean): void {
    let i, tail;
    for (i = 0, tail = this.points.length - 1; i <= tail; i++, tail--) {
      // пропускаем элементы, которые НЕ нужно удалять (оставляем)
      while (i <= tail && !predicate(this.points[i])) i++;
      // пропускаем элементы, которые нужно удалить, с конца
      while (i <= tail && predicate(this.points[tail])) tail--;

      if (i >= tail) break;

      // замена: элемент из tail перемещаем на место i
      const replacement = this.points[tail];
      this.pointsIndex.delete(this.points[i].id); // удаляем старый id (удаляемая точка)
      this.points[i] = replacement;
      this.pointsIndex.set(replacement.id, i);
      this.points[tail] = null!; // ← зануляем, чтобы не удалить индекс позже

      i++;
      tail--;
    }

    const newLength = tail + 1;
    // удаляем из индекса всё, что осталось за новой границей
    for (let j = newLength; j < this.points.length; j++) {
      const point = this.points[j];
      if (point !== null) {
        this.pointsIndex.delete(point.id);
      }
      this.points[j] = null as any;
    }
    this.points.length = newLength;

    this.render();
  }

  /** Очистить все точки */
  public clear(): void {
    this.points.length = 0;
    this.pointsIndex.clear();
    this.render();
  }

  // ========== Приватные методы ==========

  /** Полностью синхронизирует DOM с массивом this.points, используя D3 data join */
  private render(): void {
    const groups = this.svgEngine.container.selectAll<SVGGElement, Point>("g.point-group").data(this.points, (d: Point) => d.id);

    groups.exit().remove();

    const enter = groups
      .enter()
      .append("g")
      .attr("class", "point-group")
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    enter
      .append("circle")
      .attr("class", "point")
      .attr("r", 20)
      .attr("stroke", "black")
      .attr("stroke-width", 2)
      .attr("fill", (d) => d.color);

    enter
      .append("text")
      .attr("class", "point-label")
      .text((d) => d.text)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "white");

    const merged = enter.merge(groups);
    merged.attr("transform", (d) => `translate(${d.x},${d.y})`);

    this.groupSelection = merged;

    const currentScale = this.svgEngine.getTransform().k;
    this.updatePointStyles(currentScale);
  }

  public updateAllPointsPositions(): void {
    if (this.groupSelection) {
      this.groupSelection.attr("transform", (d) => `translate(${d.x},${d.y})`);
    }
  }

  private updatePointStyles(scale: number): void {
    if (!this.groupSelection) return;
    const invScale = 1 / scale;
    this.groupSelection
      .selectAll<SVGCircleElement, Point>("circle.point")
      .attr("r", 20 * invScale)
      .attr("stroke-width", 2 * invScale);
    this.groupSelection.selectAll<SVGTextElement, Point>("text.point-label").style("font-size", `${16 * invScale}px`);
    this.svgEngine.container.selectAll<SVGTextElement, Point>("text.point-label").style("font-size", `${16 * invScale}px`);
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
}
