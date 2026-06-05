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
    // Фильтр zoom: запрещаем zoom на элементах с классом "point-group"
    this.svgEngine.setZoomFilter((event) => {
      const target = event.target as Element;
      return !target.closest?.(".point-group");
    });
    // Регистрируем перетаскиваемые элементы (селектор .point-group)
    this.svgEngine.registerDraggable<SVGGElement>(".point-group", {
      onDrag: (group, deltaWorld) => {
        // Получаем привязанные данные группы – объект Point
        const point = d3.select(group).datum() as Point;
        if (!point) return;
        // Обновляем координаты в объекте (который лежит в массиве points)
        point.x += deltaWorld[0];
        point.y += deltaWorld[1];
        // Обновляем transform группы
        d3.select(group).attr("transform", `translate(${point.x},${point.y})`);
      },
      onDragEnd: (group) => {
        const point = d3.select(group).datum() as Point;
        if (point) {
          console.log(`Point ${point.id} moved to (${point.x}, ${point.y})`);
          // Здесь потом вызовем сохранение позиций в DataManager
        }
      },
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
