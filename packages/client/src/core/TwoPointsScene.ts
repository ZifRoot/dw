import { AppMediator } from "./AppMediator";
import { SvgCanvasController } from "./SvgCanvasController";
import * as d3 from "d3";

interface PointData {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
}

/**
 * Простейшая сцена для проверки SvgCanvasController.
 * Рисует две точки, каждая из которых перетаскивается мышью.
 * Zoom/pan работают одновременно, не конфликтуя с drag.
 */
export class TwoPointsScene {
  private svgCtrl: SvgCanvasController;
  private points: Map<string, PointData> = new Map();
  private groups: Map<string, d3.Selection<SVGGElement, unknown, null, undefined>> = new Map();

  constructor(
    element: HTMLElement,
    private mediator: AppMediator,
  ) {
    this.mediator.temperature = 100;
    this.svgCtrl = new SvgCanvasController(element);
    this.init();
  }

  /**
   * Инициализация сцены: создаём две фиксированные точки.
   */
  public init(): void {
    const pointA: PointData = { id: "A", x: 200, y: 150, text: "A", color: "red" };
    const pointB: PointData = { id: "B", x: 400, y: 350, text: "B", color: "blue" };
    this.points.set(pointA.id, pointA);
    this.points.set(pointB.id, pointB);

    this.render();
  }

  /**
   * Отрисовать все точки (создать группы, круги, текст, добавить drag).
   */
  private render(): void {
    for (const point of this.points.values()) {
      // Создаём группу для точки
      const group = this.svgCtrl.createGroup("point");
      group.attr("transform", `translate(${point.x},${point.y})`);
      // Рисуем круг
      group.append("circle").attr("r", 20).attr("fill", point.color).attr("stroke", "black").attr("stroke-width", 2);
      // Рисуем текст
      group.append("text").text(point.text).attr("text-anchor", "middle").attr("dy", "0.35em").attr("fill", "white").attr("font-size", "16px");
      // Сохраняем группу
      this.groups.set(point.id, group);
    }

    // После создания всех точек добавляем обработку перетаскивания
    this.enableDragging();
  }

  /**
   * Включить drag для всех точек.
   * При перетаскивании точки координаты обновляются в мире, трансформация группы меняется,
   * а zoom временно отключается.
   */
  private enableDragging(): void {
    for (const [id, group] of this.groups.entries()) {
      const point = this.points.get(id)!;
      const dragHandler = d3
        .drag<SVGGElement, unknown>()
        .on("start", (event) => {
          this.svgCtrl.disableZoom(); // отключаем zoom на время драга
          event.sourceEvent.stopPropagation();
        })
        .on("drag", (event) => {
          // event.dx, event.dy – смещение мыши в экранных пикселях.
          // Переводим в мировое смещение с помощью screenToWorld.
          const [dxWorld, dyWorld] = this.svgCtrl.screenToWorld(event.dx, event.dy);
          point.x += dxWorld;
          point.y += dyWorld;
          group.attr("transform", `translate(${point.x},${point.y})`);
        })
        .on("end", () => {
          this.svgCtrl.enableZoom(); // включаем zoom обратно
          console.log(`Point ${id} moved to (${point.x}, ${point.y})`);
        });
      group.call(dragHandler);
    }
  }

  /**
   * Центрировать и масштабировать вид так, чтобы обе точки были видны целиком с отступом.
   */
  public fitView(): void {
    const pointsArray = Array.from(this.points.values());
    const xs = pointsArray.map((p) => p.x);
    const ys = pointsArray.map((p) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const padding = 50;
    this.svgCtrl.applyZoomToBounds({ minX, minY, maxX, maxY }, padding);
  }

  /**
   * Очистить сцену (удалить все группы и данные).
   */
  public destroy(): void {
    this.groups.forEach((group) => this.svgCtrl.removeElement(group));
    this.groups.clear();
    this.points.clear();
  }
}
