import * as d3 from "d3";
import { ZoomTransform } from "d3";

export type DragPredicate = (event: MouseEvent) => boolean;
export type GetDragElement = (event: MouseEvent) => Element | null;

export interface DragCallbacks<T extends Element> {
  onDragStart?: (element: T, worldPos: [number, number], event: MouseEvent) => void;
  onDrag?: (element: T, deltaWorld: [number, number], worldPos: [number, number], event: MouseEvent) => void;
  onDragEnd?: (element: T, event: MouseEvent) => void;
}
export interface Detector {
  predicate: (event: MouseEvent) => { element: Element; callbacks: DragCallbacks<Element> } | null;
}

export type ZoomCallback = (transform: ZoomTransform) => void;
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

  private zoomCallbacks: Set<ZoomCallback> = new Set();
  private zoomEnabled = true;

  // Drag detectors registry
  private detectors: Set<Detector> = new Set();
  private currentDragElement: Element | null = null;
  private currentDragCallbacks: DragCallbacks<Element> | null = null;
  private dragStartWorld: [number, number] | null = null;

  constructor(private element: HTMLElement) {
    this.svg = d3.select(element).append("svg").attr("width", "100%").attr("height", "100%");
    this.container = this.svg.append("g");

    this.updateZoomBehavior();
    this.setupGlobalDrag();
  }

  onZoom(zoomCallback: ZoomCallback): () => void {
    this.zoomCallbacks.add(zoomCallback);
    return () => this.zoomCallbacks.delete(zoomCallback);
  }

  // ========== Настройка zoom ==========
  private updateZoomBehavior(): void {
    this.svg.on(".zoom", null);
    this.zoomBehavior = d3
      .zoom<SVGSVGElement, unknown>()
      .filter((event) => {
        if (!this.zoomEnabled) return false;
        const mouseEvent = event as MouseEvent;
        // Zoom разрешён, если ни один детектор не захватил событие
        for (const d of this.detectors) {
          if (d.predicate(mouseEvent)) return false;
        }
        return true;
      })
      .on("zoom", (event) => {
        this.transform = event.transform;
        this.container.attr("transform", this.transform.toString());
        for (const zoomCallback of this.zoomCallbacks) {
          zoomCallback(this.transform);
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
        // Drag разрешён, если хотя бы один детектор вернул элемент
        for (const d of this.detectors) {
          if (d.predicate(mouseEvent)) return true;
        }
        return false;
      })
      .on("start", (event) => {
        const mouseEvent = event.sourceEvent;
        let dragElement: Element | null = null;
        let dragCallbacks: DragCallbacks<Element> | null = null;
        for (const d of this.detectors) {
          const result = d.predicate(mouseEvent);
          if (result) {
            dragElement = result.element;
            dragCallbacks = result.callbacks;
            break;
          }
        }
        if (!dragElement || !dragCallbacks) return;
        this.currentDragElement = dragElement;
        this.currentDragCallbacks = dragCallbacks;
        const [mx, my] = this.screenToWorld(event.sourceEvent.clientX, event.sourceEvent.clientY);
        this.dragStartWorld = [mx, my];
        if (dragCallbacks.onDragStart) {
          dragCallbacks.onDragStart(this.currentDragElement, [mx, my], event.sourceEvent);
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
        if (this.currentDragCallbacks?.onDragEnd && this.currentDragElement) {
          this.currentDragCallbacks.onDragEnd(this.currentDragElement, event.sourceEvent);
        }
        this.currentDragElement = null;
        this.dragStartWorld = null;
        this.currentDragCallbacks = null;
      });
    this.svg.call(dragHandler);
  }

  // ========== Публичные методы ==========

  /**
   * Зарегистрировать детектор перетаскивания.
   * @param predicate Функция, получающая MouseEvent и возвращающая { element, callbacks } или null.
   * @returns Функция для отписки.
   */
  public registerDragDetector(predicate: (event: MouseEvent) => { element: Element; callbacks: DragCallbacks<Element> } | null): () => void {
    const detector = { predicate };
    this.detectors.add(detector);
    // Обновляем zoom-фильтр, чтобы он учитывал новый предикат
    this.updateZoomBehavior();
    return () => {
      this.detectors.delete(detector);
      this.updateZoomBehavior();
    };
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
