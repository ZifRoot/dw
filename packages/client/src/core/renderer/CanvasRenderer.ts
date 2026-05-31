import * as d3 from "d3";
import { ZoomTransform } from "d3";
import { Point } from "../Point";

/**
 * Отвечает за SVG, zoom, рендеринг и обновление точек.
 * Не содержит бизнес-логики и физики.
 */
export class CanvasRenderer {
  public svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  public container!: d3.Selection<SVGGElement, unknown, null, undefined>;
  public transform: ZoomTransform;

  constructor(private element: HTMLElement) {
    this.transform = d3.zoomIdentity;
    this.initSvg();
    this.initZoom();
  }

  private initSvg(): void {
    const width = this.element.clientWidth || 800;
    const height = this.element.clientHeight || 600;
    this.svg = d3.select(this.element).append("svg").attr("width", "100%").attr("height", "100%").attr("viewBox", `0 0 ${width} ${height}`);
    this.container = this.svg.append("g");
  }

  private initZoom(): void {
    const zoom = d3.zoom<SVGSVGElement, unknown>().on("zoom", (event) => {
      this.transform = event.transform;
      this.container.attr("transform", this.transform.toString());
      this.updatePointsStyle();
    });
    this.svg.call(zoom);
  }

  public getSvg(): d3.Selection<SVGSVGElement, unknown, null, undefined> {
    return this.svg;
  }

  public getTransform(): ZoomTransform {
    return this.transform;
  }

  // Полный рендеринг (при добавлении/удалении точек)
  public renderPoints(points: Point[]): void {
    const groups = this.container.selectAll<SVGGElement, Point>("g.point-group").data(points, (d) => d.id);
    groups.exit().remove();

    const enter = this.createGroups(groups.enter());
    this.updateGroups(enter, groups);
    this.saveGroupReferences(groups, enter);
    this.updatePointsStyle();
  }

  private createGroups(enter: d3.Selection<d3.EnterElement, Point, SVGGElement, unknown>): d3.Selection<SVGGElement, Point, SVGGElement, unknown> {
    const groups = enter
      .append("g")
      .attr("class", "point-group")
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    groups.append("circle").attr("class", "point").attr("cx", 0).attr("cy", 0).attr("r", 15);

    groups
      .append("text")
      .attr("class", "point-label")
      .attr("x", (d) => d.labelOffset?.dx ?? 8)
      .attr("y", (d) => d.labelOffset?.dy ?? 4)
      .text((d) => d.text);

    return groups;
  }

  private updateGroups(
    enter: d3.Selection<SVGGElement, Point, SVGGElement, unknown>,
    groups: d3.Selection<SVGGElement, Point, SVGGElement, unknown>,
  ): void {
    const merged = enter.merge(groups);
    merged.attr("transform", (d) => `translate(${d.x},${d.y})`);
    merged.select("text.point-label").text((d) => d.text);
  }

  private saveGroupReferences(
    groups: d3.Selection<SVGGElement, Point, SVGGElement, unknown>,
    enter: d3.Selection<SVGGElement, Point, SVGGElement, unknown>,
  ): void {
    const merged = enter.merge(groups);
    merged.each(function (d) {
      d.groupElement = this;
    });
  }

  // Обновление transform для всех точек (вызывается каждый кадр)
  public updatePointsTransform(points: Point[]): void {
    this.container.selectAll<SVGGElement, Point>("g.point-group").attr("transform", (d) => `translate(${d.x},${d.y})`);
  }

  // Обновление transform для одной точки (drag)
  public updatePointTransform(point: Point): void {
    if (point.groupElement) {
      d3.select(point.groupElement).attr("transform", `translate(${point.x},${point.y})`);
    }
  }

  private updatePointsStyle(): void {
    const scaleInv = 1 / this.transform.k;
    this.container
      .selectAll<SVGCircleElement, any>("circle.point")
      .attr("r", 6 * scaleInv)
      .attr("stroke-width", 2 * scaleInv);

    this.container
      .selectAll<SVGTextElement, any>("text.point-label")
      .style("font-size", `${20 * scaleInv}px`)
      .attr("x", (d) => (d.labelOffset?.dx ?? 12) * scaleInv)
      .attr("y", (d) => (d.labelOffset?.dy ?? 4) * scaleInv);
  }

  // Автомасштабирование по всем точкам с использованием реальных размеров контейнера
  public fitZoomToAllPoints(points: Point[]): void {
    if (points.length === 0) return;
    const bounds = this.computeBoundingBox(points);
    if (bounds.width === 0 || bounds.height === 0) return;
    const width = this.element.clientWidth || 800;
    const height = this.element.clientHeight || 600;
    const padding = 50;
    const scaleX = (width - padding * 2) / bounds.width;
    const scaleY = (height - padding * 2) / bounds.height;
    const scale = Math.min(scaleX, scaleY);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const newTransform = d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(scale)
      .translate(-centerX, -centerY);

    this.svg
      .transition()
      .duration(300)
      .call(d3.zoom().transform as any, newTransform);
    this.transform = newTransform;
    this.updatePointsStyle();
  }

  private computeBoundingBox(points: Point[]): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }
}
