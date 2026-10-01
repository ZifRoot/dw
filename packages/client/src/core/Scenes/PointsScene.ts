import { DragElem, SvgEngine } from "@core/Engines/SvgEngine";
import * as d3 from "d3";
import { AppMediator, PointChange } from "@core/AppMediator";
import { Point } from "@core/models/Point";
import { PointGraphManager } from "@core/collections/PointGraphManager";

export class PointsScene {
  private rootGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private points: Point[] = [];
  private selectedPoint: Point | null = null;
  private unregisterDrag: (() => void) | null = null;
  private d3Points: d3.Selection<SVGGElement, Point, SVGGElement, unknown> | null = null;
  private domMap: Map<string, SVGGElement> = new Map();
  private unsubPointsGraphUpdated: () => void;
  private unsubPointChange: () => void;
  private unsubPointsUpdating: () => void;
  private unsubSizeText: () => void;
  private unsubAutoZoom: () => void;

  constructor(
    private mediator: AppMediator,
    private svgEngine: SvgEngine,
    private pointGraphManager: PointGraphManager,
    groupName = "points-scene",
  ) {
    this.points = this.pointGraphManager.getPointsArray();
    this.selectedPoint = this.points.find((point) => point.selected) ?? null;
    this.rootGroup = svgEngine.createGroup(groupName);
    this.rootGroup.on("click", (event) => this.groupClick(event));
    this.unregisterDrag = this.svgEngine.registerDragDetector((event) => this.dragDetector(event));
    this.svgEngine.onZoom((transform) => this.updatePointStyles(transform.k));
    this.unsubPointsGraphUpdated = this.mediator.onPointsGraphUpdated(() => this.syncDomWithPoints());
    this.unsubPointChange = this.mediator.onPointChange(({ pointId, changes }) => this.pointChange(pointId, changes));
    this.unsubPointsUpdating = this.mediator.onPointsUpdating(() => this.pointsUpdating());
    this.unsubSizeText = this.mediator.onSizeText(() => this.updatePointStyles());
    this.unsubAutoZoom = this.mediator.onAutoZoom(() => this.fitView());
  }

  public getPointById(id?: string | null): Point | null {
    return id != null ? this.pointGraphManager.getPointById(id) : null;
  }

  public removePoints(ids: string[]): void {
    this.pointGraphManager.removePoints(ids);
  }

  public removePointsBy(predicate: (point: Point) => boolean): void {
    const ids = this.points.filter(predicate).map((p) => p.id);
    if (ids.length) this.removePoints(ids);
  }

  public getPoints(): Point[] {
    return this.points;
  }

  public pointChange(pointId: string, changes: PointChange): void {
    const point = this.getPointById(pointId);
    if (!point) return;
    if (changes.text !== undefined) point.text = changes.text;
    if (changes.pinned !== undefined) point.pinned = changes.pinned;
    if (changes.selected !== undefined) {
      if (changes.selected) {
        this.setSelectedPoint(point);
      } else if (this.selectedPoint === point) {
        this.setSelectedPoint(null);
      }
    }
    if (changes.x !== undefined) point.x = changes.x;
    if (changes.y !== undefined) point.y = changes.y;
    if (changes.z !== undefined) point.z = changes.z;
    this.mediator.pointUpdated(pointId);
    this.updateUIById(pointId);
  }

  public fitView(padding = 50): void {
    if (!this.mediator.autoZoom || this.points.length === 0) return;
    const xs = this.points.map((p) => p.x);
    const ys = this.points.map((p) => p.y);
    this.svgEngine.applyZoomToBounds(
      {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      },
      padding,
    );
  }

  public getSvgEngine(): SvgEngine {
    return this.svgEngine;
  }

  public destroy(): void {
    this.unregisterDrag?.();
    this.unsubPointsGraphUpdated();
    this.unsubPointChange();
    this.unsubPointsUpdating();
    this.unsubSizeText();
    this.unsubAutoZoom();
  }

  private syncDomWithPoints(): void {
    const selection = this.rootGroup.selectAll<SVGGElement, Point>("g.point-group").data(this.points, (d) => d.id);
    selection
      .exit<Point>()
      .each((d) => this.domMap.delete(d.id))
      .remove();

    const enter = selection.enter().append("g").attr("class", "point-group");
    const thisMap = this.domMap;
    enter.append("circle").attr("class", "point");
    enter.append("text").attr("class", "point-label").attr("dy", "0.35em");

    enter.each(function (d) {
      const element = this as SVGGElement;
      // Store the actual SVG group so point updates do not depend on domain types.
      thisMap.set(d.id, element);
    });

    this.d3Points = selection.merge(enter);
    this.updateAllProperties();
    this.updatePointStyles();

    if (this.selectedPoint && this.getPointById(this.selectedPoint.id) !== this.selectedPoint) {
      this.selectedPoint = null;
    }

    this.mediator.pointSelected(this.selectedPoint);
  }

  public pointsUpdating(): void {
    this.updatePositions();
    if (this.mediator.autoZoom) this.fitView();
  }

  private updateAllProperties(d3Sel?: d3.Selection<SVGGElement, Point, any, any> | null): void {
    d3Sel ??= this.d3Points;
    if (!d3Sel) return;
    d3Sel
      .classed("dragged", (d) => d.dragged)
      .classed("selected", (d) => d.selected)
      .classed("pinned", (d) => d.pinned);
    d3Sel.select("text.point-label").text((d) => d.text);
    this.updatePositions(d3Sel);
  }

  public updatePositions(d3Sel?: d3.Selection<SVGGElement, Point, any, any> | null): void {
    d3Sel ??= this.d3Points;
    if (!d3Sel) return;
    d3Sel.attr("transform", (d) => `translate(${d.x},${d.y})`);
  }

  private updatePointStyles(scale?: number, d3Sel?: d3.Selection<SVGGElement, Point, any, any> | null): void {
    d3Sel ??= this.d3Points;
    if (!d3Sel) return;
    const inv = 1 / (scale ?? this.svgEngine.getTransform().k);
    const fontSize = this.mediator.sizeText;
    d3Sel
      .selectAll("circle.point")
      .attr("r", 20 * inv)
      .attr("stroke-width", 2 * inv);
    d3Sel.selectAll("text.point-label").style("font-size", `${fontSize * inv}px`);
  }

  public updateUIById(pointId: string): void {
    const domEle = this.domMap.get(pointId);
    if (!domEle) return;
    this.updateAllProperties(d3.select<SVGGElement, Point>(domEle));
  }

  public dragDetector(event: MouseEvent): DragElem {
    if (event.type === "wheel") return null;
    const target = event.target as Element;
    const element = target.closest?.(".point-group");
    if (!element) return null;

    const group = d3.select<SVGGElement, Point>(element as SVGGElement);
    const point = group.datum();
    if (!point) return null;

    point.dragged = true;
    this.updateAllProperties(group);

    return {
      element,
      callbacks: {
        onDrag: (el, deltaWorld) => {
          const d3Dom = d3.select<SVGGElement, Point>(el as SVGGElement);
          const p = d3Dom.datum();
          if (!p) return;
          p.x += deltaWorld[0];
          p.y += deltaWorld[1];
          this.updateAllProperties(d3Dom);
          this.mediator.pointUpdating(p.id);
        },
        onDragEnd: (el) => {
          const d3Dom = d3.select<SVGGElement, Point>(el as SVGGElement);
          const p = d3Dom.datum();
          if (!p) return;
          p.dragged = false;
          this.updateAllProperties(d3Dom);
          this.mediator.pointUpdated(p.id);
        },
      },
    };
  }

  public dom2Point(domEle?: Element | null): Point | null {
    return domEle instanceof Element ? this.checkModel(d3.select<Element, Point>(domEle).datum()) : null;
  }

  public checkModel(value: unknown): Point | null {
    return value instanceof Point ? value : null;
  }

  public groupClick(event: MouseEvent): void {
    const target = event.target as Element;
    const domEle = target.closest?.(".point-group");
    const previousPoint = this.selectedPoint;
    const point = this.dom2Point(domEle);

    if (point && point !== previousPoint) {
      this.setSelectedPoint(point);
      if (previousPoint) this.updateUIById(previousPoint.id);
      this.updateUIById(point.id);
      this.mediator.pointSelected(point);
      return;
    }

    if (previousPoint) {
      this.setSelectedPoint(null);
      this.updateUIById(previousPoint.id);
    }

    this.mediator.pointSelected(null);
  }

  private setSelectedPoint(point: Point | null): void {
    if (this.selectedPoint === point) return;

    if (this.selectedPoint) {
      this.selectedPoint.selected = false;
    }

    this.selectedPoint = point;

    if (this.selectedPoint) {
      this.selectedPoint.selected = true;
    }
  }
}
