import { SvgEngine } from "../Engines/SvgEngine.ts";
import { EntityCollection } from "./indexer.ts";
import * as d3 from "d3";
import { AppMediator } from "../AppMediator.ts";
import { UIEdge } from "../ui-models.ts";
import { Edge } from "../models/Edge.ts";
import { EdgeRefs } from "../models/EdgeRefs.ts";
import { EdgeRef } from "../models/EdgeRef.ts";
import { EdgeModel } from "../models/EdgeModel.ts";
import { edgeIndexToEdgeModel } from "../edge-utils.ts";
import { PatternMatcher } from "../PatternMatcher.ts";
import { PointsScene } from "./PointsScene.ts";

export class EdgesScene {
  private rootGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private edges: EdgeModel[] = [];
  private entities: EntityCollection<EdgeModel>;
  private d3Edges: d3.Selection<SVGLineElement, EdgeModel, SVGGElement, unknown> | null = null;

  unregisterSelectedPoint: () => void;
  private unsubEdges: () => void;
  private unsubPointsMoved: (() => void) | null = null;
  private unsubPointsUpdated: (() => void) | null = null;

  constructor(
    private svgEngine: SvgEngine,
    private mediator: AppMediator,
    private pointsScene: PointsScene,
    groupName = "edges-scene",
  ) {
    this.unsubEdges = this.mediator.onEdges((e) => this.onEdgeRefsUpd(e));
    this.entities = new EntityCollection<EdgeModel>((p) => p.id);
    this.edges = this.entities.items;
    this.rootGroup = svgEngine.createGroup(groupName);
    this.svgEngine.onZoom((transform) => this.updatePointStyles(transform.k));
    this.unregisterSelectedPoint = this.mediator.onSelectedPoint((point) => this.highlightEdgesForPoint(point?.id ?? null));

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
      // this.mediator.selectedPoint = null;
    });

    this.unsubPointsUpdated = this.mediator.onPointsUpdated(() => this.updateLines());
    this.unsubPointsMoved = this.mediator.onPointUpdated(() => this.updateLines());
  }

  private onEdgeRefsUpd(edges: EdgeRefs) {
    this.setEdges(edges.map((e) => this.conv(e)).filter((a) => a != null));
  }

  private conv(edge: EdgeRef): EdgeModel | null {
    return edgeIndexToEdgeModel(edge, this.pointsScene.Entities, new PatternMatcher());
  }

  // Подсветка рёбер, инцидентных данной точке (или снятие подсветки)
  private highlightEdgesForPoint(pointId: string | null): void {
    if (!this.d3Edges) return;
    if (!pointId) {
      // Снимаем подсветку со всех рёбер
      this.d3Edges.classed("highlighted", false);
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
    this.d3Edges.classed("highlighted", (d) => relatedEdgeIds.has(d.id));
  }

  // При уничтожении сцены отписываемся
  public destroy(): void {
    if (this.unregisterSelectedPoint) this.unregisterSelectedPoint();

    this.unsubEdges();
    if (this.unsubPointsMoved) this.unsubPointsMoved();
    if (this.unsubPointsUpdated) this.unsubPointsUpdated();
    this.clear();
  }

  // ========== Управление рёбрами (upsert, удаление, очистка) ==========

  /** Обновить существующие рёбра и добавить новые (upsert) – мутирует массив */
  public setEdges(edges: EdgeModel[]): void {
    const toInsert: EdgeModel[] = [];
    const toUpdate: EdgeModel[] = [];
    this.entities.clear();

    this.entities._setPoints(edges, toInsert, toUpdate);

    // Синхронизируем DOM
    this.renderLines();
  }

  /** Удалить рёбра по списку id */
  public removeEdges(ids: string[]): void {
    this.entities._removePoints(ids);
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
    this.entities.clear();
    this.d3Edges = null;
  }

  // ========== Приватные методы синхронизации DOM ==========

  // Подписка на обновление позиций точек (чтобы перерисовывать линии)
  // Ожидаем, что PointsScene будет подключена позже через attachToPointsScene

  /**
   * Полностью перерисовать линии (data join)
   */
  private renderLines(): void {
    if (this.edges.length === 0) return;

    // Создаём линии с привязкой данных
    const lines = this.rootGroup.selectAll<SVGLineElement, EdgeModel>("line.edge").data(this.edges, (d) => d.id);

    lines.exit().remove();
    const enter = lines.enter().append("line").attr("class", "edge");

    this.d3Edges = enter.merge(lines);

    // Устанавливаем координаты линий
    this.updateLines();
  }

  /**
   * Обновить координаты всех линий (без пересоздания DOM)
   */
  private updateLines(): void {
    if (!this.d3Edges) return;
    this.d3Edges
      .attr("x1", (e) => e.source.x)
      .attr("y1", (e) => e.source.y)
      .attr("x2", (e) => e.target.x)
      .attr("y2", (e) => e.target.y);
  }

  /**
   * Обновить стили линий (например, при изменении масштаба)
   * Вызывается извне при zoom (можно подписаться на SvgEngine.onZoom)
   */
  private updatePointStyles(scale: number): void {
    if (!this.d3Edges) return;
    const invScale = 1 / scale;
    this.d3Edges.style("stroke-width", 2 * invScale);
  }

  public getEdges(): EdgeModel[] {
    return this.edges;
  }

  public getEdgeById(id: string): Edge | undefined {
    const idx = this.entities.indexMap.get(id);
    return idx !== undefined ? this.edges[idx] : undefined;
  }
}
