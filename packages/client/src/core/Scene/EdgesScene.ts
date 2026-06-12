import { SvgEngine } from "../Engines/SvgEngine.ts";
import { EntityCollection } from "./indexer.ts";
import { PointsScene } from "./PointsScene.ts";
import * as d3 from "d3";
import { AppMediator } from "../AppMediator.ts";
import { UIEdge } from "../ui-models.ts";
import { Edge } from "../models/Edge.ts";

export class EdgesScene {
  private rootGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private edges: Edge[] = [];
  public entites: EntityCollection<Edge>;
  private groupSelection: d3.Selection<SVGLineElement, Edge, SVGGElement, unknown> | null = null;
  private pointsScene!: PointsScene;
  unregisterSelectedPoint: () => void;

  constructor(
    private svgEngine: SvgEngine,
    private mediator: AppMediator,
    groupName = "edges-scene",
  ) {
    this.entites = new EntityCollection<Edge>((p) => p.id);
    this.edges = this.entites.items;
    this.svgEngine = svgEngine;
    this.rootGroup = svgEngine.createGroup(groupName);
    this.svgEngine.onZoom((transform) => this.updatePointStyles(transform.k));
    this.unregisterSelectedPoint = this.mediator.onSelectedPoint((point) => this.highlightEdgesForPoint(point?.id ?? null));

    this.mediator.onPointsUpdate(() => this.updateLines());
    this.rootGroup.on("click", (event) => {
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
        visible: true,
      };
      this.mediator.selectedEdge = uiEdge;
      // this.mediator.selectedPoint = null;
    });
  }

  // Подсветка рёбер, инцидентных данной точке (или снятие подсветки)
  private highlightEdgesForPoint(pointId: string | null): void {
    if (!this.groupSelection) return;
    if (!pointId) {
      // Снимаем подсветку со всех рёбер
      this.groupSelection.classed("highlighted", false);
      return;
    }
    // Находим рёбра, где sourceId или targetId совпадает с pointId
    const relatedEdgeIds = new Set<string>();
    for (const edge of this.edges) {
      if (edge.sourceId === pointId || edge.targetId === pointId) {
        relatedEdgeIds.add(edge.id);
      }
    }
    // Применяем класс highlighted и делаем кликабельными
    this.groupSelection.classed("highlighted", (d) => relatedEdgeIds.has(d.id));
  }

  // При уничтожении сцены отписываемся
  public destroy(): void {
    if (this.unregisterSelectedPoint) this.unregisterSelectedPoint();
  }

  /** Подключить сцену точек для автоматического обновления линий при движении точек */
  public attachToPointsScene(pointsScene: PointsScene): void {
    this.pointsScene = pointsScene;
    pointsScene.onPointMoved = () => this.updateLines();
    // При зуме линии не меняют координат, но если стили зависят от зума – можно обновить
  }

  // ========== Управление рёбрами (upsert, удаление, очистка) ==========

  /** Обновить существующие рёбра и добавить новые (upsert) – мутирует массив */
  public setEdges(edges: Edge[]): void {
    const toInsert: Edge[] = [];
    const toUpdate: Edge[] = [];
    this.entites.clear();

    this.entites._setPoints(edges, toInsert, toUpdate);

    // Синхронизируем DOM
    this.renderLines();
  }

  /** Удалить рёбра по списку id */
  public removeEdges(ids: string[]): void {
    this.entites._removePoints(ids);
    // После мутации перерисовываем DOM
    this.renderLines();
  }

  /** Удалить рёбра по предикату */
  public removeEdgesBy(predicate: (edge: Edge) => boolean): void {
    const toDeleteIds = this.edges.filter(predicate).map((e) => e.id);
    this.removeEdges(toDeleteIds);
  }

  /** Очистить все рёбра */
  public clear(): void {
    this.rootGroup.selectAll("*").remove();
    this.entites.clear();
    this.groupSelection = null;
  }

  // ========== Приватные методы синхронизации DOM ==========

  private renderLines(): void {
    if (this.edges.length === 0) return;

    // Создаём линии с привязкой данных
    this.groupSelection = this.rootGroup.selectAll<SVGLineElement, Edge>("line.edge").data(this.edges, (d) => d.id);

    this.groupSelection.enter().append("line").attr("class", "edge");

    this.groupSelection.exit().remove();

    this.groupSelection = this.rootGroup.selectAll<SVGLineElement, Edge>("line.edge").data(this.edges, (d) => d.id);

    this.updateLines();
  }

  private updateLines(): void {
    if (!this.groupSelection || !this.pointsScene) return;
    this.groupSelection
      .attr("x1", (e) => e.source.x)
      .attr("y1", (e) => e.source.y)
      .attr("x2", (e) => e.target.x)
      .attr("y2", (e) => e.target.y);
  }
  private updatePointStyles(scale: number): void {
    if (!this.groupSelection) return;
    const invScale = 1 / scale;
    // this.groupSelection.attr("stroke-width", 10 * invScale);
  }

  // ========== Публичные методы для внешнего доступа ==========
  public getEdges(): Edge[] {
    return this.edges;
  }

  public getEdgeById(id: string): Edge | undefined {
    const idx = this.entites.indexMap.get(id);
    return idx !== undefined ? this.edges[idx] : undefined;
  }
}
