// core/NeighborGraph.ts
import { IEdgeFactory } from "../interfaces/IEdgeFactory";
import { Edge } from "../models/Edge";
import { EdgeRef } from "../models/EdgeRef";
import { EntityCollection } from "./EntityCollection";

export class NeighborGraph {
  private edgeCollection: EntityCollection<Edge>;
  private adjacency: Map<string, Set<string>> = new Map();

  constructor(private factory: IEdgeFactory) {
    this.edgeCollection = new EntityCollection<Edge>((edge) => edge.id);
  }

  public get edgeCount(): number {
    return this.edgeCollection.items.length;
  }

  public get pointCount(): number {
    return this.adjacency.size;
  }

  public get isEmpty(): boolean {
    return this.edgeCollection.items.length === 0;
  }

  private addToAdjacency(pointId: string, edgeId: string): void {
    let set = this.adjacency.get(pointId);
    if (!set) {
      set = new Set();
      this.adjacency.set(pointId, set);
    }
    set.add(edgeId);
  }

  public hasEdge(edgeRef: EdgeRef): boolean {
    if (edgeRef.sourceId === edgeRef.targetId) return false;

    const edgeIds = this.adjacency.get(edgeRef.sourceId);
    if (!edgeIds) return false;

    for (const id of edgeIds) {
      const edge = this.edgeCollection.getById(id);
      if (
        edge &&
        ((edge.sourceId === edgeRef.sourceId && edge.targetId === edgeRef.targetId) ||
          (edge.sourceId === edgeRef.targetId && edge.targetId === edgeRef.sourceId))
      ) {
        return true;
      }
    }

    return false;
  }

  public addEdge(edgeRef: EdgeRef): Edge | null {
    if (edgeRef.sourceId === edgeRef.targetId) return null;

    const edge = this.factory.create(edgeRef);
    if (!edge) return null;

    if (this.edgeCollection.getById(edge.id)) return null;

    this.edgeCollection.add(edge);
    this.addToAdjacency(edge.sourceId, edge.id);
    this.addToAdjacency(edge.targetId, edge.id);
    return edge;
  }

  public addEdges(refs: EdgeRef[]): void {
    for (const ref of refs) this.addEdge(ref);
  }

  public removeEdge(edge: Edge): void {
    const { sourceId, targetId, id } = edge;
    this.edgeCollection.removes([id]);
    this.removeFrom(sourceId, id);
    this.removeFrom(targetId, id);
  }

  public removeEdges(edges: Edge[]): void {
    if (edges.length === 0) return;

    this.edgeCollection.removes(edges.map((edge) => edge.id));

    for (const edge of edges) {
      this.removeFrom(edge.sourceId, edge.id);
      this.removeFrom(edge.targetId, edge.id);
    }
  }

  public removeFrom(pointId: string, edgeId: string): void {
    const edges = this.adjacency.get(pointId);
    if (!edges) return;

    edges.delete(edgeId);
    if (edges.size === 0) this.adjacency.delete(pointId);
  }

  public getEdgesForPoint(id: string): Edge[] {
    const edgeIds = this.adjacency.get(id);
    if (!edgeIds) return [];

    const result: Edge[] = [];
    for (const edgeId of edgeIds) {
      const edge = this.edgeCollection.getById(edgeId);
      if (edge) result.push(edge);
    }
    return result;
  }

  public getNeighbors(id: string): Set<string> {
    const neighbors = new Set<string>();

    for (const edge of this.getEdgesForPoint(id)) {
      if (edge.sourceId !== id) neighbors.add(edge.sourceId);
      if (edge.targetId !== id) neighbors.add(edge.targetId);
    }

    return neighbors;
  }

  public getDegree(id: string): number {
    return this.adjacency.get(id)?.size ?? 0;
  }

  public hasNeighbor(a: string, b: string): boolean {
    if (a === b) return false;

    for (const edge of this.getEdgesForPoint(a)) {
      if (edge.sourceId === b || edge.targetId === b) return true;
    }

    return false;
  }

  public getEdgesBetween(a: string, b: string): Edge[] {
    if (a === b) return [];

    return this.getEdgesForPoint(a).filter(
      (edge) => edge.sourceId === b || edge.targetId === b,
    );
  }

  public getEdgeById(id: string): Edge | null {
    return this.edgeCollection.getById(id);
  }

  public getAllEdgeModels(): Edge[] {
    return this.edgeCollection.items;
  }

  public getEdgesArrayDirect(): Edge[] {
    return this.edgeCollection.items;
  }

  public getEdgeCollection(): EntityCollection<Edge> {
    return this.edgeCollection;
  }

  public getPointsWithEdges(): string[] {
    return [...this.adjacency.keys()];
  }

  public removeEdgesForPoint(pointId: string): Edge[] {
    const edges = this.getEdgesForPoint(pointId);
    if (edges.length === 0) return [];

    this.edgeCollection.removes(edges.map((edge) => edge.id));

    for (const edge of edges) {
      this.removeFrom(edge.sourceId, edge.id);
      this.removeFrom(edge.targetId, edge.id);
    }

    return edges;
  }

  public validate(): { ok: boolean; errors: string[] } {
    const errors: string[] = [];

    for (const edge of this.edgeCollection.items) {
      const sourceSet = this.adjacency.get(edge.sourceId);
      const targetSet = this.adjacency.get(edge.targetId);

      if (!sourceSet || !sourceSet.has(edge.id)) {
        errors.push(`Edge ${edge.id} not registered under sourceId ${edge.sourceId}`);
      }
      if (!targetSet || !targetSet.has(edge.id)) {
        errors.push(`Edge ${edge.id} not registered under targetId ${edge.targetId}`);
      }
    }

    for (const [pointId, edgeIds] of this.adjacency.entries()) {
      for (const edgeId of edgeIds) {
        const edge = this.edgeCollection.getById(edgeId);

        if (!edge) {
          errors.push(`Adjacency[${pointId}] references non-existent edge ${edgeId}`);
          continue;
        }

        if (edge.sourceId !== pointId && edge.targetId !== pointId) {
          errors.push(
            `Adjacency[${pointId}] references edge ${edgeId} which doesn't touch this point`,
          );
        }
      }
    }

    return { ok: errors.length === 0, errors };
  }

  public rebuildAdjacency(): void {
    this.adjacency.clear();

    for (const edge of this.edgeCollection.items) {
      this.addToAdjacency(edge.sourceId, edge.id);
      this.addToAdjacency(edge.targetId, edge.id);
    }
  }

  public clone(): NeighborGraph {
    const newGraph = new NeighborGraph(this.factory);

    for (const edge of this.edgeCollection.items) {
      const cloned = { ...edge } as Edge;
      newGraph.edgeCollection.add(cloned);
      newGraph.addToAdjacency(cloned.sourceId, cloned.id);
      newGraph.addToAdjacency(cloned.targetId, cloned.id);
    }

    return newGraph;
  }

  public clear(): void {
    this.adjacency.clear();
    this.edgeCollection.clear();
  }
}
