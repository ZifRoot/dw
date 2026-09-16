import { SvgEngine } from "../Engines/SvgEngine.ts";
import * as d3 from "d3";
import { AppMediator } from "../AppMediator.ts";
import { UIEdge } from "../ui-models.ts";
import { EdgeModel } from "../models/EdgeModel.ts";
import { PointModel } from "../models/PointModel.ts";
import { PointGraphManager } from "../PointGraphManager.ts";

export class EdgesScene {
  private rootGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private edges: EdgeModel[] = [];
  private points: PointModel[] = [];
  private d3Edges: d3.Selection<SVGLineElement, EdgeModel, SVGGElement, unknown> | null = null;

  unregisterSelectedPoint: () => void;
  private unsubPointsGraphUpdated: () => void;
  private unsubPointsMoved: (() => void) | null = null;
  private unsubPointsUpdated: (() => void) | null = null;

  constructor(
    private svgEngine: SvgEngine,
    private mediator: AppMediator,
    private pointGraphManager: PointGraphManager,
    groupName = "edges-scene",
  ) {
    this.syncRefs();
    this.rootGroup = svgEngine.createGroup(groupName);
    this.svgEngine.onZoom((transform) => this.updatePointStyles(transform.k));
    this.unregisterSelectedPoint = this.mediator.onSelectedPoint((point) => this.highlightEdgesForPoint(point?.id ?? null));

    // Граф хранится в PointGraphManager. Через mediator приходит только сигнал.
    this.unsubPointsGraphUpdated = this.mediator.onPointsGraphUpdated(() => {
      this.syncRefs();
      this.renderLines();
    });

    this.mediator.onPointsUpdating(() => this.updateLines());
    this.rootGroup.on("click", (event) => {
      const target = event.target as Element;
      const line = target.closest?.(".highlighted");
      if (!line) return;
      const edge = d3.select(line).datum() as EdgeModel;
      if (!edge) return;
      const uiEdge: UIEdge = {
        id: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        distance: edge.distance,
        visible: true,
      };
      this.mediator.selectedEdge = uiEdge;
    });

    this.unsubPointsUpdated = this.mediator.onPointsUpdated(() => this.updateLines());
    this.unsubPointsMoved = this.mediator.onPointUpdated(() => this.updateLines());
  }

  // Подсветка рёбер, инцидентных данной точке (или снятие подсветки).
  private highlightEdgesForPoint(pointId: string | null): void {
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
    if (this.unsubPointsMoved) this.unsubPointsMoved();
    if (this.unsubPointsUpdated) this.unsubPointsUpdated();
    this.clear();
  }

  /** Обновить отображение после изменения графа в PointGraphManager. */
  public setEdges(_edges: EdgeModel[]): void {
    this.syncRefs();
    this.renderLines();
  }

  public removeEdges(ids: string[]): void {
    for (const id of ids) {
      const edge = this.pointGraphManager.getEdgeCollection().getById(id);
      if (edge) {
        this.pointGraphManager.removeEdge(edge);
      }
    }
    this.renderLines();
  }

  public removeEdgesBy(predicate: (edge: EdgeModel) => boolean): void {
    const toDeleteIds = this.edges.filter(predicate).map((e) => e.id);
    this.removeEdges(toDeleteIds);
  }

  public clear(): void {
    this.rootGroup.selectAll("*").remove();
    this.d3Edges = null;
  }

  private renderLines(): void {
    const lines = this.rootGroup.selectAll<SVGLineElement, EdgeModel>("line.edge").data(this.edges, (d) => d.id);

    lines.exit().remove();
    const enter = lines.enter().append("line").attr("class", "edge");

    this.d3Edges = enter.merge(lines);
    this.updateLines();
  }

  private updateLines(): void {
    if (!this.d3Edges) return;
    this.d3Edges
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

  public getEdges(): EdgeModel[] {
    return this.edges;
  }

  public getEdgeById(id: string): EdgeModel | null {
    return this.pointGraphManager.getEdgeCollection().getById(id);
  }

  private syncRefs(): void {
    this.edges = this.pointGraphManager.getEdgesArray();
    this.points = this.pointGraphManager.getPointsArray();
  }
}
