import * as d3 from "d3";
import { ZoomTransform } from "d3";

export type ZoomFilter = (event: MouseEvent) => boolean;

interface DragCallbacks<T extends Element> {
  onDragStart?: (element: T, worldPos: [number, number], event: MouseEvent) => void;
  onDrag?: (element: T, deltaWorld: [number, number], worldPos: [number, number], event: MouseEvent) => void;
  onDragEnd?: (element: T, event: MouseEvent) => void;
}

/**
 * SvgEngine – универсальный движок для работы с SVG-холстом.
 * Предоставляет:
 * - создание и управление SVG с зумом/паном
 * - преобразование экранных координат в мировые и обратно
 * - регистрацию перетаскиваемых элементов (без привязки к точкам)
 * - подписку на события зума
 * - возможность фильтровать zoom (чтобы не конфликтовать с drag)
 */
export class SvgEngine {
  public svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  public container: d3.Selection<SVGGElement, unknown, null, undefined>;
  private transform: ZoomTransform = d3.zoomIdentity;
  private zoomBehavior?: d3.ZoomBehavior<SVGSVGElement, unknown>;
  private zoomCallbacks = new Set<(transform: ZoomTransform) => void>();
  private zoomFilter: ZoomFilter = () => true;
  private zoomEnabled = true;

  // Drag state
  private dragCallbacks = new Map<string, DragCallbacks<Element>>();
  private currentDragElement: Element | null = null;
  private currentDragCallbacks: DragCallbacks<Element> | null = null;
  private dragStartWorld: [number, number] | null = null;

  constructor(private element: HTMLElement) {
    // Инициализация SVG
    this.svg = d3.select(element).append("svg").attr("width", "100%").attr("height", "100%");
    this.container = this.svg.append("g");

    // Настройка zoom
    this.updateZoomBehavior();

    // Глобальный drag-обработчик
    const dragHandler = d3
      .drag<SVGSVGElement, unknown>()
      .filter((event) => {
        const target = event.target as Element;
        for (const selector of this.dragCallbacks.keys()) {
          if (target.closest?.(selector)) return true;
        }
        return false;
      })
      .on("start", (event) => {
        const target = event.sourceEvent.target as Element;
        for (const [selector, callbacks] of this.dragCallbacks.entries()) {
          const element = target.closest?.(selector);
          if (element) {
            this.currentDragElement = element;
            this.currentDragCallbacks = callbacks;
            break;
          }
        }
        if (!this.currentDragElement || !this.currentDragCallbacks) return;
        const [mx, my] = this.screenToWorld(event.sourceEvent.clientX, event.sourceEvent.clientY);
        this.dragStartWorld = [mx, my];
        if (this.currentDragCallbacks.onDragStart) {
          this.currentDragCallbacks.onDragStart(this.currentDragElement, [mx, my], event.sourceEvent);
        }
        event.sourceEvent.stopPropagation();
      })
      .on("drag", (event) => {
        if (!this.currentDragElement || !this.currentDragCallbacks || !this.dragStartWorld) return;
        const [mx, my] = this.screenToWorld(event.sourceEvent.clientX, event.sourceEvent.clientY);
        const dx = mx - this.dragStartWorld[0];
        const dy = my - this.dragStartWorld[1];
        if (this.currentDragCallbacks.onDrag) {
          this.currentDragCallbacks.onDrag(this.currentDragElement, [dx, dy], [mx, my], event.sourceEvent);
        }
        this.dragStartWorld = [mx, my];
        event.sourceEvent.stopPropagation();
      })
      .on("end", (event) => {
        if (this.currentDragCallbacks?.onDragEnd) {
          this.currentDragCallbacks.onDragEnd(this.currentDragElement!, event.sourceEvent);
        }
        this.currentDragElement = null;
        this.currentDragCallbacks = null;
        this.dragStartWorld = null;
      });
    this.svg.call(dragHandler);
  }

  private updateZoomBehavior(): void {
    this.svg.on(".zoom", null);
    this.zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .filter((event) => {
        if (!this.zoomEnabled) return false;
        const mouseEvent = event as MouseEvent;
        return this.zoomFilter(mouseEvent);
      })
      .on("zoom", (event) => {
        this.transform = event.transform;
        this.container.attr("transform", this.transform.toString());
        this.zoomCallbacks.forEach((cb) => cb(this.transform));
      });
    this.svg.call(this.zoomBehavior);
  }

  // ========== Публичные методы ==========

  /** Установить фильтр для zoom (решает, разрешить ли zoom для данного события) */
  public setZoomFilter(filter: ZoomFilter): void {
    this.zoomFilter = filter;
    this.updateZoomBehavior();
  }

  /** Временно отключить zoom (например, на время анимации) */
  public disableZoom(): void {
    this.zoomEnabled = false;
    this.updateZoomBehavior();
  }

  /** Включить zoom обратно */
  public enableZoom(): void {
    this.zoomEnabled = true;
    this.updateZoomBehavior();
  }

  /** Зарегистрировать перетаскиваемые элементы по CSS-селектору */
  public registerDraggable<T extends Element>(selector: string, callbacks: DragCallbacks<T>): () => void {
    this.dragCallbacks.set(selector, callbacks as DragCallbacks<Element>);
    return () => this.dragCallbacks.delete(selector);
  }

  /** Применить zoom/pan так, чтобы заданная область (bounds) поместилась во вьюпорт с отступом */
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

  /** Программно установить трансформацию (с анимацией) */
  public setTransform(transform: ZoomTransform, duration = 300): void {
    this.transform = transform;
    this.svg
      .transition()
      .duration(duration)
      .call(this.zoomBehavior.transform as any, transform);
  }

  /** Текущая трансформация */
  public getTransform(): ZoomTransform {
    return this.transform;
  }

  /** Размеры контейнера в пикселях */
  public getClientSize(): [number, number] {
    return [this.element.clientWidth || 800, this.element.clientHeight || 600];
  }

  /** Преобразовать экранные координаты в мировые */
  public screenToWorld(screenX: number, screenY: number): [number, number] {
    return this.transform.invert([screenX, screenY]);
  }

  /** Преобразовать мировые координаты в экранные */
  public worldToScreen(worldX: number, worldY: number): [number, number] {
    return this.transform.apply([worldX, worldY]);
  }

  /** Создать группу внутри контейнера (будет подвержена zoom/pan) */
  public createGroup(className?: string): d3.Selection<SVGGElement, unknown, null, undefined> {
    const group = this.container.append("g");
    if (className) group.attr("class", className);
    return group;
  }

  /** Удалить D3-элемент */
  public removeElement(selection: d3.Selection<any, any, any, any>): void {
    selection.remove();
  }

  /** Очистить всё содержимое контейнера */
  public clearContainer(): void {
    this.container.selectAll("*").remove();
  }

  /** Подписаться на события zoom */
  public onZoom(cb: (transform: ZoomTransform) => void): () => void {
    this.zoomCallbacks.add(cb);
    return () => this.zoomCallbacks.delete(cb);
  }
}
