import { SvgEngine } from "./SvgEngine";
import * as d3 from "d3";

export interface Point {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}

export class TwoPointsScene {
  private svgEngine: SvgEngine;
  private points: Point[] = [];
  private groupSelection: d3.Selection<SVGGElement, Point, SVGGElement, unknown> | null = null;

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
    this.svgEngine.setZoomCallback((transform) => {
      this.updatePointStyles(transform.k);
    });
  }

  public init(): void {
    this.points = [
      { id: "A", x: 200, y: 150, text: "A", color: "red" },
      { id: "B", x: 400, y: 350, text: "B", color: "blue" },
    ];
    this.render();
  }

  private render(): void {
    // Data join: привязываем массив точек к группам
    const groups = this.svgEngine.container.selectAll<SVGGElement, Point>("g.point-group").data(this.points, (d: Point) => d.id);

    // Удаляем лишние группы
    groups.exit().remove();

    // Создаём новые группы
    const enter = groups
      .enter()
      .append("g")
      .attr("class", "point-group")
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    // Добавляем круг и текст
    enter
      .append("circle")
      .attr("class", "point")
      .attr("r", 20)
      .attr("stroke", "black")
      .attr("stroke-width", 2)
      .attr("fill", (d) => d.color);
    enter
      .append("text")
      .text((d) => d.text)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "white");

    // Объединяем enter и update
    const merged = enter.merge(groups);
    // Обновляем позиции (на случай, если координаты изменились до перерисовки)
    merged.attr("transform", (d) => `translate(${d.x},${d.y})`);

    this.groupSelection = merged;
  }
  
  /** Массовое обновление позиций всех точек (для физики) */
  public updateAllPointsPositions(): void {
    if (this.groupSelection) {
      this.groupSelection.attr("transform", (d) => `translate(${d.x},${d.y})`);
    }
  }

  private updatePointStyles(scale: number): void {
    const invScale = 1 / scale;
    this.svgEngine.container
      .selectAll<SVGCircleElement, Point>("circle.point")
      .attr("r", 20 * invScale) // базовый радиус 20px
      .attr("stroke-width", 2 * invScale);
    this.svgEngine.container.selectAll<SVGTextElement, Point>("text.point-label").style("font-size", `${16 * invScale}px`);
  }

  public fitView(): void {
    if (this.points.length === 0) return;
    const xs = this.points.map((p) => p.x);
    const ys = this.points.map((p) => p.y);
    const bounds = {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
    this.svgEngine.applyZoomToBounds(bounds, 50);
  }

  public getPoints(): Point[] {
    return this.points;
  }
}
