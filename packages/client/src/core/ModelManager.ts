// core/ModelManager.ts
import { AppMediator } from "./AppMediator";
import { PointModel } from "./models/PointModel";
import { EmbeddingModel } from "./models/EmbeddingModel";
import { EdgeModel } from "./models/EdgeModel";
import { ActiveDimensionsBuilder } from "./ActiveDimensionsBuilder";
import { PatternMatcher } from "./PatternMatcher";
import { NeighborGraph } from "./NeighborGraph";
import { EntityCollection } from "./Scene/indexer";
import { edgeIndexesToEdgeModels } from "./edge-utils";

export class ModelManager {
  private pointCollection: EntityCollection<PointModel> = new EntityCollection((p) => p.id);
  private binaryMap: Map<string, EmbeddingModel> = new Map();
  private vectorMap: Map<string, number[]> = new Map();
  private graph: NeighborGraph;
  private matcher: PatternMatcher;
  private builder: ActiveDimensionsBuilder;
  private edges: EdgeModel[] = [];
  private readonly edgeWeight = 100;

  private unsubPoints: () => void;
  private unsubStep: () => void;

  constructor(
    private mediator: AppMediator,
    activationThreshold: number = 0.5,
    K: number = 3,
    maxCandidates: number = 20,
  ) {
    this.builder = new ActiveDimensionsBuilder(activationThreshold);
    this.matcher = new PatternMatcher();
    this.graph = new NeighborGraph(K, maxCandidates, this.matcher);

    this.unsubPoints = this.mediator.onPointsModelReady((points: PointModel[]) => {
      this.updatePoints(points);
    });

    this.unsubStep = this.mediator.onModelManagerStep(() => {
      this.step();
    });
  }

  public destroy(): void {
    this.unsubPoints();
    this.unsubStep();
  }

  private updatePoints(points: PointModel[]): void {
    this.pointCollection.clear();
    this.pointCollection._setPoints(points, [], []);
    this.buildBinaryEmbeddings();
    this.buildVectorMap();
    const ids = Array.from(this.binaryMap.keys());
    if (ids.length > 0) {
      this.graph.initRandom(ids);
      this.rebuildEdges();
    }
  }

  private buildBinaryEmbeddings(): void {
    this.binaryMap.clear();
    const threshold = this.builder.computeThreshold(this.pointCollection.items);
    for (const point of this.pointCollection.items) {
      // Берём первую модель (можно расширить логику)
      const firstModel = point.embeddings.keys().next().value;
      if (firstModel) {
        const binary = this.builder.buildForPoint(point, firstModel, threshold);
        if (binary) {
          this.binaryMap.set(point.id, binary);
        }
      }
    }
  }

  private buildVectorMap(): void {
    this.vectorMap.clear();
    for (const point of this.pointCollection.items) {
      const firstModel = point.embeddings.keys().next().value;
      if (firstModel) {
        const emb = point.embeddings.get(firstModel);
        if (emb) {
          this.vectorMap.set(point.id, emb.value);
        }
      }
    }
  }

  private step(): void {
    const ids = Array.from(this.binaryMap.keys());
    if (ids.length === 0) return;
    this.graph.improve(ids, this.binaryMap, this.vectorMap, this.cosineDistance);
    this.rebuildEdges();
  }

  private rebuildEdges(): void {
    const edgeIndexes = this.graph.getAllEdgeIndexes();
    this.edges = edgeIndexesToEdgeModels(edgeIndexes, this.pointCollection, this.matcher, { distance: this.edgeWeight });
    // Отправляем в медиатор
    const edgeData = this.edges.map((e) => ({
      sourceId: e.source.id,
      targetId: e.target.id,
      distance: e.distance,
      color: e.color,
    }));
    this.mediator.edges = edgeData;
  }

  private cosineDistance(v1: number[], v2: number[]): number {
    if (!v1 || !v2 || v1.length === 0 || v2.length === 0) return 1;
    let dot = 0,
      norm1 = 0,
      norm2 = 0;
    for (let i = 0; i < v1.length; i++) {
      dot += v1[i] * v2[i];
      norm1 += v1[i] * v1[i];
      norm2 += v2[i] * v2[i];
    }
    if (norm1 === 0 || norm2 === 0) return 1;
    return 1 - dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  /** Метод для физики – возвращает пары точек для притяжения */
  public getPairs(): { source: PointModel; target: PointModel }[] {
    const pairs: { source: PointModel; target: PointModel }[] = [];
    for (const edge of this.edges) {
      pairs.push({ source: edge.source, target: edge.target });
    }
    return pairs;
  }
}
