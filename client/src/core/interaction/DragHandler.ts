import * as d3 from "d3";
import { ZoomTransform } from "d3";
import { Point } from "../Point";

type GetTransformFn = () => ZoomTransform;
type SetDraggedPointFn = (point: Point | null) => void;
type SetDraggingFn = (dragging: boolean) => void;
type UpdatePointFn = (x: number, y: number) => void;
type OnDragEndFn = () => void;

/**
 * Обрабатывает глобальное перетаскивание (drag) на SVG.
 */
export class DragHandler {
  private dragBehavior: d3.DragBehavior<SVGSVGElement, unknown, any>;

  constructor(
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    private getTransform: GetTransformFn,
    private setDraggedPoint: SetDraggedPointFn,
    private setDragging: SetDraggingFn,
    private updatePoint: UpdatePointFn,
    private onDragEnd: OnDragEndFn,
  ) {
    this.dragBehavior = d3
      .drag<SVGSVGElement, unknown>()
      .on("start", this.onDragStart.bind(this))
      .on("drag", this.onDrag.bind(this))
      .on("end", this.onDragEnd.bind(this));
    this.svg.call(this.dragBehavior);
  }

  private findPointUnderCursor(event: d3.D3DragEvent<SVGSVGElement, unknown, any>): Point | null {
    let target = event.sourceEvent.target as HTMLElement;
    const svgNode = this.svg.node();
    while (target && target !== svgNode && target.tagName !== "circle") {
      target = target.parentNode as HTMLElement;
    }
    if (!target || target.tagName !== "circle") return null;
    const group = target.parentNode as SVGGElement;
    return d3.select(group).datum() as Point | null;
  }

  private onDragStart(event: d3.D3DragEvent<SVGSVGElement, unknown, any>): void {
    const point = this.findPointUnderCursor(event);
    if (!point) return;
    this.setDraggedPoint(point);
    this.setDragging(true);
    event.sourceEvent.stopPropagation();
    event.sourceEvent.preventDefault();
  }

  private onDrag(event: d3.D3DragEvent<SVGSVGElement, unknown, any>): void {
    const svgNode = this.svg.node();
    if (!svgNode) return;
    const [mx, my] = d3.pointer(event.sourceEvent, svgNode);
    const transform = this.getTransform();
    const [invX, invY] = transform.invert([mx, my]);
    this.updatePoint(invX, invY);
    event.sourceEvent.stopPropagation();
    event.sourceEvent.preventDefault();
  }

  private onDragEnd(event: d3.D3DragEvent<SVGSVGElement, unknown, any>): void {
    this.setDraggedPoint(null);
    this.setDragging(false);
    this.onDragEnd();
    event.sourceEvent.stopPropagation();
  }
}
