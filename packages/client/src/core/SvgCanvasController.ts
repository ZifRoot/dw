import * as d3 from "d3";
import { ZoomTransform } from "d3";

export type ZoomCallback = (transform: ZoomTransform) => void;

/**
 * Абстрактный контроллер SVG-холста.
 * Отвечает за создание SVG, управление масштабированием (zoom) и панорамированием (pan),
 * преобразование координат, создание/удаление групп и подписку на события зума.
 * Не содержит логики, специфичной для точек или другой предметной области.
 */
export class SvgCanvasController {
  public svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  public container: d3.Selection<SVGGElement, unknown, null, undefined>;
  private transform: ZoomTransform = d3.zoomIdentity;
  private zoomBehavior: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private zoomCallbacks = new Set<ZoomCallback>();
  private zoomEnabled = true;

  constructor(private element: HTMLElement) {
    // Создаём SVG и группу-контейнер
    this.svg = d3.select(element).append("svg").attr("width", "100%").attr("height", "100%");

    this.container = this.svg.append("g");

    // Настраиваем zoom поведение
    this.zoomBehavior = d3.zoom<SVGSVGElement, unknown>().on("zoom", (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
      if (!this.zoomEnabled) return;
      this.transform = event.transform;
      this.container.attr("transform", this.transform.toString());
      // Уведомляем подписчиков
      this.zoomCallbacks.forEach((cb) => cb(this.transform));
    });

    this.svg.call(this.zoomBehavior);
    this.transform = d3.zoomIdentity;
  }

  /**
   * Применить zoom/pan так, чтобы заданная область (bounds) поместилась во вьюпорт с отступом.
   * @param bounds Область в мировых координатах { minX, minY, maxX, maxY }
   * @param padding Отступ в пикселях от краёв
   */
  public applyZoomToBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number }, padding = 50): void {
    const { minX, minY, maxX, maxY } = bounds;
    if (maxX <= minX || maxY <= minY) return;

    const [width, height] = this.getClientSize();
    const boundsWidth = maxX - minX;
    const boundsHeight = maxY - minY;

    const scaleX = (width - padding * 2) / boundsWidth;
    const scaleY = (height - padding * 2) / boundsHeight;
    const scale = Math.min(scaleX, scaleY, 10); // ограничим масштаб

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const newTransform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-centerX, -centerY);

    this.setTransform(newTransform);
  }

  /**
   * Программно установить трансформацию (zoom, pan).
   * @param transform Новая трансформация
   * @param duration Длительность анимации (по умолчанию 300 мс)
   */
  public setTransform(transform: ZoomTransform, duration = 300): void {
    this.transform = transform;
    this.svg
      .transition()
      .duration(duration)
      .call(this.zoomBehavior.transform as any, transform);
  }

  /** Получить текущую трансформацию */
  public getTransform(): ZoomTransform {
    return this.transform;
  }

  /** Получить размеры контейнера (ширина, высота) в пикселях */
  public getClientSize(): [number, number] {
    const width = this.element.clientWidth || 800;
    const height = this.element.clientHeight || 600;
    return [width, height];
  }

  /**
   * Преобразовать экранные координаты (пиксели) в мировые с учётом трансформации.
   */
  public screenToWorld(screenX: number, screenY: number): [number, number] {
    return this.transform.invert([screenX, screenY]);
  }

  /**
   * Преобразовать мировые координаты в экранные.
   */
  public worldToScreen(worldX: number, worldY: number): [number, number] {
    const [x, y] = this.transform.apply([worldX, worldY]);
    return [x, y];
  }

  /**
   * Подписаться на события zoom. Возвращает функцию для отписки.
   */
  public onZoom(callback: ZoomCallback): () => void {
    this.zoomCallbacks.add(callback);
    return () => this.zoomCallbacks.delete(callback);
  }

  /** Временно отключить zoom (полезно при drag точек) */
  public disableZoom(): void {
    this.zoomEnabled = false;
  }

  /** Включить zoom обратно */
  public enableZoom(): void {
    this.zoomEnabled = true;
  }

  /** Создать новую группу внутри контейнера (все группы будут автоматически подвержены zoom/pan) */
  public createGroup(className?: string): d3.Selection<SVGGElement, unknown, null, undefined> {
    const group = this.container.append("g");
    if (className) group.attr("class", className);
    return group;
  }

  /** Удалить любой D3-элемент (группу, круг и т.д.) */
  public removeElement(selection: d3.Selection<d3.BaseType, unknown, HTMLElement, any>): void {
    selection.remove();
  }

  /** Очистить всё содержимое контейнера (все группы, фигуры) */
  public clearContainer(): void {
    this.container.selectAll("*").remove();
  }
}
