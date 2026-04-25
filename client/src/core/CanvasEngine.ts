import * as d3 from "d3";

import { ZoomTransform } from "d3";

export class CanvasEngine {
  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private container!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private points: { id: string; x: number; y: number }[] = [];
  transform?: ZoomTransform;

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

  private updatePointsStyle() {
    if (!this.transform) {
      return;
    }
    let tr = this.transform?.toString();
    let scale = this.transform.k;
    this.container.attr("transform", tr);
    this.container
      .selectAll("circle")
      .attr("r", 4 / scale)
      .attr("stroke-width", 2 / scale);
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

    this.updatePointsStyle();
  }

  // Публичный метод для добавления точки (вызывается из UI)
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
