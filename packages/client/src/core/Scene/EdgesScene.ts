import { SvgEngine } from "../SvgEngine";
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
  private svgEngine: SvgEngine;
  private rootGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  private edges: Edge[] = [];
  private edgesIndex: Map<string, number> = new Map(); // id → индекс в массиве
  private lineSelection: d3.Selection<SVGLineElement, Edge, SVGGElement, unknown> | null = null;
  private pointsScene: PointsScene | null = null;

  constructor(svgEngine: SvgEngine, groupName = "edges-scene") {
    this.svgEngine = svgEngine;
    this.rootGroup = svgEngine.createGroup(groupName);
  }

  /** Подключить сцену точек для автоматического обновления линий при движении точек */
  public attachToPointsScene(pointsScene: PointsScene): void {
    this.pointsScene = pointsScene;
    pointsScene.onPointMoved = () => this.updateLines();
    // При зуме линии не меняют координат, но если стили зависят от зума – можно обновить
    this.svgEngine.onZoom(() => this.updateLines());
  }

  // ========== Управление рёбрами (upsert, удаление, очистка) ==========

  /** Обновить существующие рёбра и добавить новые (upsert) – мутирует массив */
  public setEdges(edges: Edge[]): void {
    const toUpdate: Edge[] = [];
    const toInsert: Edge[] = [];

    for (const e of edges) {
      if (this.edgesIndex.has(e.id)) {
        const idx = this.edgesIndex.get(e.id)!;
        // Мутируем существующий объект (сохраняем ссылку)
        Object.assign(this.edges[idx], e);
        toUpdate.push(e);
      } else {
        toInsert.push(e);
      }
    }

    if (toInsert.length) {
      this.edges.push(...toInsert);
      const startIdx = this.edges.length - toInsert.length;
      for (let i = 0; i < toInsert.length; i++) {
        this.edgesIndex.set(toInsert[i].id, startIdx + i);
      }
    }

    // Синхронизируем DOM
    this.syncDomWithEdges(toUpdate, toInsert);
  }

  /** Удалить рёбра по списку id */
  public removeEdges(ids: string[]): void {
    if (ids.length === 0) return;
    const toDelete = new Set(ids);
    // Удаляем DOM-элементы
    for (const id of ids) {
      // Находим индекс для удаления (но лучше удалять через селекцию)
      // Для простоты перестроим весь DOM после мутации массива
    }
    // Мутация массива с двумя указателями
    let i = 0,
      tail = this.edges.length - 1;
    while (i <= tail) {
      while (i <= tail && !toDelete.has(this.edges[i].id)) i++;
      while (i <= tail && toDelete.has(this.edges[tail].id)) tail--;
      if (i >= tail) break;
      const replacement = this.edges[tail];
      this.edgesIndex.delete(this.edges[i].id);
      this.edges[i] = replacement;
      this.edgesIndex.set(replacement.id, i);
      i++;
      tail--;
    }
    const newLength = tail + 1;
    for (let j = newLength; j < this.edges.length; j++) {
      const e = this.edges[j];
      if (e) this.edgesIndex.delete(e.id);
      this.edges[j] = null as any;
    }
    this.edges.length = newLength;
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
    this.edges = [];
    this.edgesIndex.clear();
    this.lineSelection = null;
  }

  // ========== Приватные методы синхронизации DOM ==========

  private syncDomWithEdges(toUpdate: Edge[], toInsert: Edge[]): void {
    // Полная перерисовка – проще, чем поддерживать частичное обновление.
    // Для производительности можно реализовать инкрементальное обновление,
    // но поскольку рёбер обычно меньше, чем точек, оставим полную перерисовку.
    this.renderLines();
  }

  private renderLines(): void {
    // Очищаем группу
    this.rootGroup.selectAll("*").remove();
    if (this.edges.length === 0) return;

    // Создаём линии с привязкой данных
    this.lineSelection = this.rootGroup
      .selectAll<SVGLineElement, Edge>("line.edge")
      .data(this.edges, (d) => d.id)
      .enter()
      .append("line")
      .attr("class", "edge")
      .attr("stroke", "#999")
      .attr("stroke-width", 1)
      .attr("stroke-opacity", 0.5);

    this.updateLines();
  }

  private updateLines(): void {
    if (!this.lineSelection || !this.pointsScene) return;
    const pointsMap = new Map(this.pointsScene.getPoints().map((p) => [p.id, p]));
    // let source = pointsMap.get(e.sourceId);
    // let target = pointsMap.get(e.targetId);
    // if (!source || !target) return;
    this.lineSelection
      .attr("x1", (e) => pointsMap.get(e.sourceId)?.x ?? 0)
      .attr("y1", (e) => pointsMap.get(e.sourceId)?.y ?? 0)
      .attr("x2", (e) => pointsMap.get(e.targetId)?.x ?? 0)
      .attr("y2", (e) => pointsMap.get(e.targetId)?.y ?? 0);
  }

  // ========== Публичные методы для внешнего доступа ==========
  public getEdges(): Edge[] {
    return this.edges;
  }

  public getEdgeById(id: string): Edge | undefined {
    const idx = this.edgesIndex.get(id);
    return idx !== undefined ? this.edges[idx] : undefined;
  }
}
