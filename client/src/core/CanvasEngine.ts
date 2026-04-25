import * as d3 from "d3";
import { ZoomTransform } from "d3";

export class CanvasEngine {
  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private container!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private points: { id: string; x: number; y: number }[] = [];
  transform?: ZoomTransform;

  // Создаём поведение перетаскивания
  private dragBehavior = d3.drag<SVGCircleElement, any>().on("drag", this.onDrag.bind(this));

  constructor(private element: HTMLElement) {
    this.initSvg();
    this.initZoom();
    this.addInitialPoints();
  }

  private initSvg() {
    this.svg = d3.select(this.element).append("svg").attr("width", "100%").attr("height", "100%").attr("viewBox", "0 0 800 600");

    this.container = this.svg.append("g");
  }

  private initZoom() {
    const zoom = d3.zoom<SVGSVGElement, unknown>().on("zoom", (event) => {
      this.transform = event.transform;
      this.updatePointsStyle();
    });
    this.svg.call(zoom);
  }

  // Обновление стилей точек при масштабировании
  private updatePointsStyle() {
    if (!this.transform) return;
    this.container.attr("transform", this.transform.toString());
    const scale = this.transform.k;
    this.container
      .selectAll("circle")
      .attr("r", 6 / scale)
      .attr("stroke-width", 2 / scale);
  }

  // Обработчик перетаскивания
  private onDrag(event: d3.D3DragEvent<SVGCircleElement, any, any>, d: any) {
    event.sourceEvent.stopPropagation(); // Отключаем масштабирование при drag
    if (!this.transform) return;

    // Получаем координаты мыши в системе координат SVG
    const [mx, my] = d3.pointer(event.sourceEvent, this.svg.node()!);
    // Преобразуем их в координаты исходного пространства (без трансформации)
    const [invX, invY] = this.transform.invert([mx, my]);

    // Обновляем данные точки
    d.x = invX;
    d.y = invY;

    // Обновляем позицию круга на экране
    d3.select(event.sourceEvent.target).attr("cx", d.x).attr("cy", d.y);

    // Сохраняем изменения в массиве points
    const point = this.points.find((p) => p.id === d.id);
    if (point) {
      point.x = d.x;
      point.y = d.y;
    }
  }

  // Навешиваем поведение drag на все круги
  private applyDragToCircles() {
    this.container.selectAll<SVGCircleElement, any>("circle").call(this.dragBehavior);
  }

  private addInitialPoints() {
    for (let i = 0; i < 5; i++) {
      this.points.push({
        id: `p-${i}`,
        x: Math.random() * 800,
        y: Math.random() * 600,
      });
    }
    this.renderPoints();
  }

  private renderPoints() {
    const circles = this.container.selectAll<SVGCircleElement, any>("circle").data(this.points, (d: any) => d.id);

    // Обновляем, добавляем и удаляем круги
    circles.join(
      (enter) =>
        enter
          .append("circle")
          .attr("class", "point")
          .attr("cx", (d) => d.x)
          .attr("cy", (d) => d.y)
          .attr("r", 6)
          .attr("stroke-width", 2),
      (update) => update.attr("cx", (d) => d.x).attr("cy", (d) => d.y),
      (exit) => exit.remove(),
    );

    // Применяем drag ко всем кругам (новым и существующим)
    this.applyDragToCircles();
    this.updatePointsStyle();
  }

  public addPoint() {
    this.points.push({
      id: `p-${Date.now()}`,
      x: Math.random() * 800,
      y: Math.random() * 600,
    });
    this.renderPoints();
  }

  public clearPoints() {
    this.points = [];
    this.renderPoints();
  }
}
