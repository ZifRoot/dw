import { SvgEngine } from "../Engines/SvgEngine.ts";
import * as d3 from "d3";
import { AppMediator } from "../AppMediator.ts";
import { UIEdge, UIPoint } from "../models/ui-models.ts";
import { Edge } from "../models/Edge.ts";
import { PointGraphManager } from "../collections/PointGraphManager.ts";

export class EdgesScene {
  private rootGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private readonly edges: Edge[];
  private d3Edges: d3.Selection<SVGLineElement, Edge, SVGGElement, unknown> | null = null;

  private unregisterSelectedPoint: () => void;
  private unsubPointsGraphUpdated: () => void;
  private unsubPointsUpdating: () => void;
  private unsubPointUpdated: (() => void) | null = null;
  private unsubPointUpdating: (() => void) | null = null;
  private unsubPointsUpdated: (() => void) | null = null;

  constructor(
    private mediator: AppMediator,
    private svgEngine: SvgEngine,
    private pointGraphManager: PointGraphManager,
    groupName = "edges-scene",
  ) {
    this.edges = this.pointGraphManager.getEdgesArray();
    this.svgEngine.onZoom((transform) => this.updatePointStyles(transform.k));

    this.rootGroup = svgEngine.createGroup(groupName);
    this.rootGroup.on("click", (e) => this.groupClick(e));

    this.unregisterSelectedPoint = this.mediator.onSelectedPoint((point) => this.highlightEdgesForPoint(point));
    this.unsubPointsGraphUpdated = this.mediator.onPointsGraphUpdated(() => {
      this.renderLines();
    });
    this.unsubPointsUpdating = this.mediator.onPointsUpdating(() => this.updateLines());
    this.unsubPointsUpdated = this.mediator.onPointsUpdated(() => this.updateLines());
    this.unsubPointUpdated = this.mediator.onPointUpdated(() => this.updateLines());
    this.unsubPointUpdating = this.mediator.onPointUpdating(() => this.updateLines());
  }

  groupClick(event: any) {
    const target = event.target as Element;
    const line = target.closest?.(".highlighted");
    if (!line) return;
    const edge = d3.select(line).datum() as Edge;
    if (!edge) return;
    const uiEdge: UIEdge = {
      id: edge.id,
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      distance: edge.distance,
      visible: edge.visible,
    };
    this.mediator.selectedEdge = uiEdge;
  }

  // Подсветка рёбер, инцидентных данной точке (или снятие подсветки).
  private highlightEdgesForPoint(point: UIPoint | null): void {
    const pointId = point?.id ?? null;
    if (!this.d3Edges) return;
    if (!pointId) {
      this.d3Edges.classed("highlighted", false);
      return;
    }
    const relatedEdgeIds = new Set<string>();
    for (const edge of this.edges) {
      if (edge.sourceId === pointId || edge.targetId === pointId) {
        relatedEdgeIds.add(edge.id);
      }
    }
    this.d3Edges.classed("highlighted", (d) => relatedEdgeIds.has(d.id));
  }

  public destroy(): void {
    if (this.unregisterSelectedPoint) this.unregisterSelectedPoint();
    if (this.unsubPointsGraphUpdated) this.unsubPointsGraphUpdated();
    if (this.unsubPointUpdated) this.unsubPointUpdated();
    if (this.unsubPointUpdating) this.unsubPointUpdating();
    if (this.unsubPointsUpdated) this.unsubPointsUpdated();
    this.clear();
  }

  public clear(): void {
    this.rootGroup.selectAll("*").remove();
    this.d3Edges = null;
  }

  private renderLines(): void {
    const lines = this.rootGroup
      .selectAll<SVGLineElement, Edge>("line.edge")
      .data(this.edges, (d) => d.id);

    lines.exit().remove();
    const enter = lines.enter().append("line").attr("class", "edge");

    this.d3Edges = enter.merge(lines);
    this.updateLines();
  }

  private updateLines(): void {
    if (!this.d3Edges) return;
    this.d3Edges
      .style("display", (e) => e.visible ? null : "none")
      .attr("x1", (e) => e.source.x)
      .attr("y1", (e) => e.source.y)
      .attr("x2", (e) => e.target.x)
      .attr("y2", (e) => e.target.y);
  }

  private updatePointStyles(scale: number): void {
    if (!this.d3Edges) return;
    const invScale = 1 / scale;
    this.d3Edges.style("stroke-width", 2 * invScale);
  }

  public getEdgeById(id: string): Edge | null {
    return this.pointGraphManager.getEdgeCollection().getById(id);
  }

}
