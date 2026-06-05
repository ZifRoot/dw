import * as d3 from "d3";
import { ZoomTransform } from "d3";

export type DragPredicate = (event: MouseEvent) => boolean;
export type GetDragElement = (event: MouseEvent) => Element | null;

interface DragCallbacks<T extends Element> {
  onDragStart?: (element: T, worldPos: [number, number], event: MouseEvent) => void;
  onDrag?: (element: T, deltaWorld: [number, number], worldPos: [number, number], event: MouseEvent) => void;
  onDragEnd?: (element: T, event: MouseEvent) => void;
}

/**
 * SvgEngine – универсальный движок для работы с SVG-холстом.
 * - Управление SVG, zoom/pan, координатами.
 * - Поддержка перетаскивания элементов через единый предикат (определяется сценой).
 * - Zoom автоматически отключается на элементах, для которых dragPredicate возвращает true.
 */
export class SvgEngine {
  public svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  public container: d3.Selection<SVGGElement, unknown, null, undefined>;
  private transform: ZoomTransform = d3.zoomIdentity;
  private zoomBehavior?: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private zoomCallback: ((transform: ZoomTransform) => void) | null = null;
  private zoomEnabled = true;

  // Drag state
  private dragPredicate: GetDragElement = () => null;
  private getDragElement: GetDragElement = () => null;
  private dragCallbacks: DragCallbacks<Element> | null = null;
  private currentDragElement: Element | null = null;
  private dragStartWorld: [number, number] | null = null;

  constructor(private element: HTMLElement) {
    this.svg = d3.select(element).append("svg").attr("width", "100%").attr("height", "100%");
    this.container = this.svg.append("g");

    this.updateZoomBehavior();
    this.setupGlobalDrag();
  }

  // ========== Настройка zoom ==========
  private updateZoomBehavior(): void {
    this.svg.on(".zoom", null);
    this.zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .filter((event) => {
        if (!this.zoomEnabled) return false;
        const mouseEvent = event as MouseEvent;
        // Zoom разрешён, только если dragPredicate вернул false
        return !this.dragPredicate(mouseEvent);
      })
      .on("zoom", (event) => {
        this.transform = event.transform;
        this.container.attr("transform", this.transform.toString());
        if (this.zoomCallback) {
          this.zoomCallback(this.transform);
        }
      });
    this.svg.call(this.zoomBehavior);
  }

  // ========== Настройка глобального drag ==========
  private setupGlobalDrag(): void {
    const dragHandler = d3
      .drag<SVGSVGElement, unknown>()
      .filter((event) => {
        const mouseEvent = event as MouseEvent;
        // Drag разрешён, только если dragPredicate вернул true
        return !!this.dragPredicate(mouseEvent);
      })
      .on("start", (event) => {
        const dragElement = this.getDragElement(event.sourceEvent);
        if (!dragElement) return;
        this.currentDragElement = dragElement;
        const [mx, my] = this.screenToWorld(event.sourceEvent.clientX, event.sourceEvent.clientY);
        this.dragStartWorld = [mx, my];
        if (this.dragCallbacks?.onDragStart) {
          this.dragCallbacks.onDragStart(this.currentDragElement, [mx, my], event.sourceEvent);
        }
        event.sourceEvent.stopPropagation();
      })
      .on("drag", (event) => {
        if (!this.currentDragElement || !this.dragCallbacks || !this.dragStartWorld) return;
        const [mx, my] = this.screenToWorld(event.sourceEvent.clientX, event.sourceEvent.clientY);
        const dx = mx - this.dragStartWorld[0];
        const dy = my - this.dragStartWorld[1];
        if (this.dragCallbacks.onDrag) {
          this.dragCallbacks.onDrag(this.currentDragElement, [dx, dy], [mx, my], event.sourceEvent);
        }
        this.dragStartWorld = [mx, my];
        event.sourceEvent.stopPropagation();
      })
      .on("end", (event) => {
        if (this.dragCallbacks?.onDragEnd && this.currentDragElement) {
          this.dragCallbacks.onDragEnd(this.currentDragElement, event.sourceEvent);
        }
        this.currentDragElement = null;
        this.dragStartWorld = null;
      });
    this.svg.call(dragHandler);
  }

  public setZoomCallback(cb: (transform: ZoomTransform) => void): void {
    this.zoomCallback = cb;
  }

  // ========== Публичные методы ==========

  /**
   * Установить обработчик перетаскивания.
   * @param predicate Функция, определяющая, является ли событие началом перетаскивания.
   * @param getDragElement Функция, возвращающая DOM-элемент, который будет перетаскиваться.
   * @param callbacks Колбэки для событий drag.
   */
  public setDragHandler(callbacks: DragCallbacks<Element>, getDragElement: GetDragElement): void {
    this.dragPredicate = getDragElement;
    this.getDragElement = getDragElement;
    this.dragCallbacks = callbacks;
    // Обновляем zoom-фильтр, чтобы он учитывал новый предикат
    this.updateZoomBehavior();
  }

  /** Временно отключить zoom (например, на время анимации) */
  public disableZoom(): void {
    this.zoomEnabled = false;
    this.updateZoomBehavior();
  }

  /** Включить zoom */
  public enableZoom(): void {
    this.zoomEnabled = true;
    this.updateZoomBehavior();
  }

  /** Применить zoom/pan по bounds */
  public applyZoomToBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number }, padding = 50): void {
    const { minX, minY, maxX, maxY } = bounds;
    if (maxX <= minX || maxY <= minY) return;
    const [width, height] = this.getClientSize();
    const scaleX = (width - padding * 2) / (maxX - minX);
    const scaleY = (height - padding * 2) / (maxY - minY);
    const scale = Math.min(scaleX, scaleY, 10);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const newTransform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-centerX, -centerY);
    this.setTransform(newTransform);
  }

  /** Программно установить трансформацию */
  public setTransform(transform: ZoomTransform, duration = 300): void {
    this.transform = transform;
    this.svg
      .transition()
      .duration(duration)
      .call(this.zoomBehavior!.transform as any, transform);
  }

  public getTransform(): ZoomTransform {
    return this.transform;
  }

  public getClientSize(): [number, number] {
    return [this.element.clientWidth || 800, this.element.clientHeight || 600];
  }

  public screenToWorld(screenX: number, screenY: number): [number, number] {
    return this.transform.invert([screenX, screenY]);
  }

  public worldToScreen(worldX: number, worldY: number): [number, number] {
    return this.transform.apply([worldX, worldY]);
  }

  public createGroup(className?: string): d3.Selection<SVGGElement, unknown, null, undefined> {
    const group = this.container.append("g");
    if (className) group.attr("class", className);
    return group;
  }

  public removeElement(selection: d3.Selection<any, any, any, any>): void {
    selection.remove();
  }

  public clearContainer(): void {
    this.container.selectAll("*").remove();
  }
}
