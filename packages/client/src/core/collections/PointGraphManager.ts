// core/PointGraphManager.ts
import { PointModel } from "../models/PointModel";
import { Edge } from "../models/Edge";
import { EntityCollection } from "../collections/EntityCollection";
import { NeighborGraph } from "../collections/NeighborGraph";
import { EdgeRef } from "../models/EdgeRef";
import { EdgeRefs } from "../models/EdgeRefs";
import "@utils/array-extensions";
import { AppMediator } from "../AppMediator";
import { IEdgeFactory } from "../interfaces/IEdgeFactory";

export class PointGraphManager {
  private pointCollection: EntityCollection<PointModel> = new EntityCollection((p) => p.id);
  private graph: NeighborGraph;

  constructor(
    private mediator: AppMediator,
    factory?: IEdgeFactory,
  ) {
    this.graph = new NeighborGraph(
      factory ?? {
        create: (edgeRef) => {
          const source = this.pointCollection.getById(edgeRef.sourceId);
          const target = this.pointCollection.getById(edgeRef.targetId);

          if (!source || !target) return null;

          return new Edge(source, target, edgeRef.distance);
        },
      },
    );
  }

  public updatePoints(points: PointModel[]): void {
    const oldIds = new Set(this.pointCollection.indexMap.keys());
    const newIds = new Set(points.map((point) => point.id));

    const removedIds = [...oldIds].filter((id) => !newIds.has(id));
    this.removeEdgesForPoints(removedIds);

    this.pointCollection.clear();
    this.pointCollection._setPoints(points, [], []);
  }

  public removePoints(ids: string[]): void {
    if (ids.length === 0) return;

    const existingIds = ids.filter((id) => this.pointCollection.indexMap.has(id));
    if (existingIds.length === 0) return;

    this.removeEdgesForPoints(existingIds);
    this.pointCollection.removes(existingIds);
    this.mediator.pointsGraphUpdated();
  }

  public update(points: PointModel[], edges: EdgeRefs): void {
    this.updatePoints(points);
    this.initFromRefs(edges);
    this.mediator.pointsGraphUpdated();
  }

  public initRandom(K: number = 3): void {
    const ids = this.getPointIds();
    this.graph.clear();

    if (ids.length < 2) return;

    for (const sourceId of ids) {
      const candidates = ids
        .filter((targetId) => targetId !== sourceId)
        .shuffle()
        .slice(0, Math.min(K, ids.length - 1));

      for (const targetId of candidates) {
        this.graph.addEdge({ sourceId, targetId });
      }
    }
  }

  public initFromRefs(refs: EdgeRefs): void {
    this.graph.clear();

    for (const ref of refs) {
      this.graph.addEdge(ref);
    }
  }

  public addEdge(edgeRef: EdgeRef): Edge | null {
    return this.graph.addEdge(edgeRef);
  }

  public removeEdge(edge: Edge): void {
    this.graph.removeEdge(edge);
  }

  public removeEdges(edges: Edge[]): void {
    this.graph.removeEdges(edges);
  }

  public getPointById(id: string): PointModel | null {
    return this.pointCollection.getById(id) ?? null;
  }

  public getEdgesForPoint(id: string): Edge[] {
    return this.graph.getEdgesForPoint(id);
  }

  public getPoints(): PointModel[] {
    return this.pointCollection.items;
  }

  public getPointsArray(): PointModel[] {
    return this.pointCollection.items;
  }

  public getEdgesArray(): Edge[] {
    return this.graph.getEdgesArrayDirect();
  }

  public getEdgeCollection(): EntityCollection<Edge> {
    return this.graph.getEdgeCollection();
  }

  public getPointIds(): string[] {
    return Array.from(this.pointCollection.indexMap.keys());
  }

  public getPointCollection(): EntityCollection<PointModel> {
    return this.pointCollection;
  }

  public clear(): void {
    this.pointCollection.clear();
    this.graph.clear();
  }

  private removeEdgesForPoints(ids: string[]): void {
    for (const id of ids) {
      const edges = this.graph.getEdgesForPoint(id);

      for (const edge of edges) {
        this.graph.removeEdge(edge);
      }
    }
  }
}
