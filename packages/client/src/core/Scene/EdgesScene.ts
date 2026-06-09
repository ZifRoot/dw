import { SvgEngine } from "../SvgEngine";
import { EntityCollection } from "./indexer.ts";
import { PointsScene, Point } from "./PointsScene.ts";
import * as d3 from "d3";

export interface Edge {
  id: string; // уникальный идентификатор ребра (например, "sourceId-targetId")
  sourceId: string;
  targetId: string;
  distance?: number; // опционально
  // другие поля, например, thickness, color, fixed и т.д.
}

export class EdgesScene {
  private rootGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private edges: Edge[] = [];
  public entites: EntityCollection<Edge>;
  private groupSelection: d3.Selection<SVGLineElement, Edge, SVGGElement, unknown> | null = null;
  private pointsScene!: PointsScene;

  constructor(
    private svgEngine: SvgEngine,
    groupName = "edges-scene",
  ) {
    this.entites = new EntityCollection<Edge>((p) => p.id);
    this.edges = this.entites.items;
    this.svgEngine = svgEngine;
    this.rootGroup = svgEngine.createGroup(groupName);
    this.svgEngine.onZoom((transform) => this.updatePointStyles(transform.k));
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
    this.syncDomWithEdges(toUpdate, toInsert);
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

  private syncDomWithEdges(toUpdate: Edge[], toInsert: Edge[]): void {
    // Полная перерисовка – проще, чем поддерживать частичное обновление.
    // Для производительности можно реализовать инкрементальное обновление,
    // но поскольку рёбер обычно меньше, чем точек, оставим полную перерисовку.
    this.renderLines();
  }

  private renderLines(): void {
    if (this.edges.length === 0) return;

    // Создаём линии с привязкой данных
    this.groupSelection = this.rootGroup.selectAll<SVGLineElement, Edge>("line.edge").data(this.edges, (d) => d.id);

    this.groupSelection.enter().append("line").attr("class", "edge").attr("stroke", "#999").attr("stroke-width", 1).attr("stroke-opacity", 0.5);

    this.groupSelection.exit().remove();

    this.updateLines();
  }

  private updateLines(): void {
    if (!this.groupSelection || !this.pointsScene) return;

    const pointsMap = new Map(this.pointsScene.getPoints().map((p) => [p.id, p]));
    // let source = pointsMap.get(e.sourceId);
    // let target = pointsMap.get(e.targetId);
    // if (!source || !target) return;
    this.groupSelection
      .attr("x1", (e) => this.pointsScene.getPointById(e.sourceId)?.x ?? 0)
      .attr("y1", (e) => this.pointsScene.getPointById(e.sourceId)?.y ?? 0)
      .attr("x2", (e) => this.pointsScene.getPointById(e.targetId)?.x ?? 0)
      .attr("y2", (e) => this.pointsScene.getPointById(e.targetId)?.y ?? 0);
  }
  private updatePointStyles(scale: number): void {
    if (!this.groupSelection) return;
    const invScale = 1 / scale;
    this.groupSelection
      .selectAll<SVGCircleElement, Point>("circle.point")
      .attr("r", 20 * invScale)
      .attr("stroke-width", 2 * invScale);
    this.groupSelection.selectAll<SVGTextElement, Point>("text.point-label").style("font-size", `${16 * invScale}px`);
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
