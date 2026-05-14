import * as d3 from "d3";
import { Point } from "../Point";
import { CanvasRenderer } from "../renderer/CanvasRenderer";

export class DragHandler {
  private dragBehavior: d3.DragBehavior<SVGSVGElement, unknown, any>;
  public draggedPoint: Point | null = null;
  public isDragging = false;
  public onDragEndCallback: (() => void) | null = null;

  constructor(
    private svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    private renderer: CanvasRenderer,
  ) {
    this.dragBehavior = d3
      .drag<SVGSVGElement, unknown>()
      .filter((event) => {
        const target = event.target as HTMLElement;
        return target.tagName === "circle";
      })
      .on("start", this.onDragStart.bind(this))
      .on("drag", this.onDrag.bind(this))
      .on("end", this.onDragEnd.bind(this));
    this.svg.call(this.dragBehavior);
  }

  private findPointUnderCursor(event: d3.D3DragEvent<SVGSVGElement, unknown, any>): Point | null {
    let target = event.sourceEvent.target as HTMLElement;
    const svgNode = this.svg.node() as any as HTMLElement;
    while (target && target !== svgNode && target.tagName !== "circle") {
      target = target.parentNode as HTMLElement;
    }
    if (!target || target.tagName !== "circle") return null;
    const group = target.parentNode as SVGGElement;
    return d3.select(group).datum() as Point | null;
  }

  private onDragStart(event: d3.D3DragEvent<SVGSVGElement, unknown, any>): void {
    if (this.draggedPoint) return;
    const point = this.findPointUnderCursor(event);
    if (!point) return;
    this.draggedPoint = point;
    this.isDragging = true;
    event.sourceEvent.stopPropagation();
    event.sourceEvent.preventDefault();
  }

  private onDrag(event: d3.D3DragEvent<SVGSVGElement, unknown, any>): void {
    if (!this.draggedPoint || !this.renderer.transform) return;
    const svgNode = this.svg.node();
    if (!svgNode) return;
    const [mx, my] = d3.pointer(event.sourceEvent, svgNode);
    const [invX, invY] = this.renderer.transform.invert([mx, my]);
    this.updateDraggedPoint(invX, invY);
    event.sourceEvent.stopPropagation();
    event.sourceEvent.preventDefault();
  }

  private onDragEnd(event: d3.D3DragEvent<SVGSVGElement, unknown, any>): void {
    if (this.draggedPoint) {
      this.draggedPoint = null;
      this.isDragging = false;
      event.sourceEvent.stopPropagation();
      if (this.onDragEndCallback) this.onDragEndCallback();
    }
  }

  private updateDraggedPoint(x: number, y: number): void {
    if (!this.draggedPoint) return;
    this.draggedPoint.x = x;
    this.draggedPoint.y = y;
    if (this.draggedPoint.groupElement) {
      d3.select(this.draggedPoint.groupElement).attr("transform", `translate(${x},${y})`);
    }
  }
}
