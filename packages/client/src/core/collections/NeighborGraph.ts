// core/NeighborGraph.ts
import { IEdgeFactory } from "../interfaces/IEdgeFactory";
import { Edge } from "../models/Edge";
import { EdgeRef } from "../models/EdgeRef";
import { EntityCollection } from "./EntityCollection";

/**
 * NeighborGraph — единое хранилище графа связей.
 *
 * ## Концепция
 *
 * Граф хранится как ДВА синхронизированных представления одного набора рёбер:
 *
 * 1. **Плоский список рёбер** — `edgeCollection: EntityCollection<Edge>`.
 *    Единственный источник правды. Каждое ребро лежит здесь ровно один раз,
 *    независимо от количества инцидентных точек.
 *
 * 2. **Индекс смежности** — `adjacency: Map<pointId, Set<edgeId>>`.
 *    Для каждой точки — множество id инцидентных рёбер.
 *    ВАЖНО: adjacency хранит именно **id**, а не индексы в массиве.
 *    Это ключевое решение: EntityCollection удаляет через swap-with-last,
 *    то есть `items` переупорядочивается. Если бы adjacency хранил индексы,
 *    его пришлось бы переиндексировать при каждом удалении. Id-ссылки
 *    от переупорядочивания не страдают — adjacency остаётся валидным.
 *
 * Ключевая идея: ребро одно, а точек у него две. Регистрируем ребро
 * в adjacency под обоими концами — граф становится неориентированным
 * по хранению, при том что модель ребра помнит направление.
 *
 * ## Инвариант
 *
 * В любой момент после любой публичной операции:
 * - каждое ребро из `edgeCollection` присутствует в `adjacency[sourceId]`
 *   и в `adjacency[targetId]` под своим id;
 * - в `adjacency` нет id, которых нет в `edgeCollection`;
 * - каждая точка в adjacency реально является концом указанного ребра.
 *
 * Проверяется `validate()`, восстанавливается `rebuildAdjacency()`.
 *
 * ## Самодиагностика
 *
 * `hasEdge()` предупреждает через `console.warn`, если ребро найдено
 * только в одном направлении. Это детектор рассинхронизации между
 * `edgeCollection` и `adjacency`.
 */
export class NeighborGraph {
  /**
   * Плоский список рёбер — единственный источник правды.
   *
   * Наследует все свойства EntityCollection: стабильную ссылку на items
   * и всегда актуальный indexMap.
   */
  private edgeCollection: EntityCollection<Edge>;

  /**
   * Индекс смежности: pointId → множество id инцидентных рёбер.
   *
   * Хранит id (не индексы и не модели). Ребро регистрируется здесь
   * дважды: под sourceId и под targetId. Set, а не Array — чтобы
   * повторная регистрация была идемпотентной.
   */
  private adjacency: Map<string, Set<string>> = new Map();

  /**
   * @param factory Фабрика Edge из EdgeRef. Граф не знает конкретный класс ребра.
   */
  constructor(private factory: IEdgeFactory) {
    this.edgeCollection = new EntityCollection<Edge>((edge) => edge.id);
  }

  // ───────────────────── getters ─────────────────────

  /** Количество рёбер. */
  public get edgeCount(): number {
    return this.edgeCollection.items.length;
  }

  /** Количество точек, у которых есть хотя бы одно ребро. */
  public get pointCount(): number {
    return this.adjacency.size;
  }

  /** Граф пуст? */
  public get isEmpty(): boolean {
    return this.edgeCollection.items.length === 0;
  }

  // ───────────────────── private helpers ─────────────────────
  /**
   * Есть ли среди рёбер, инцидентных `fromId`, ребро в `toId`.
   * Направление в модели не учитывается — граф неориентированный.
   */
  private hasDirection(fromId: string, toId: string): boolean {
    const edgeIds = this.adjacency.get(fromId);
    if (!edgeIds) return false;

    for (const id of edgeIds) {
      const e = this.edgeCollection.getById(id);
      if (!e) continue;
      if (e.sourceId === toId || e.targetId === toId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Единая проверка обоих направлений. Используется и в hasEdge (с варном),
   * и в addEdge (без варна — там нормально, что ребра ещё нет).
   */
  private checkBothDirections(edgeRef: EdgeRef): { forward: boolean; backward: boolean } {
    const { sourceId, targetId } = edgeRef;
    return {
      forward: this.hasDirection(sourceId, targetId),
      backward: this.hasDirection(targetId, sourceId),
    };
  }

  /** Идемпотентно регистрирует ребро в adjacency под указанной точкой. */
  private addToAdjacency(pointId: string, edgeId: string): void {
    let set = this.adjacency.get(pointId);
    if (!set) {
      set = new Set();
      this.adjacency.set(pointId, set);
    }
    set.add(edgeId);
  }

  // ───────────────────── core API ─────────────────────

  /**
   * Проверяет наличие ребра между точками.
   *
   * Работает и как детектор несимметричности: если ребро есть только
   * с одной стороны — предупреждает. Это признак того, что adjacency
   * и edgeCollection разъехались.
   *
   * @returns true, если ребро существует хотя бы в одном направлении.
   */
  public hasEdge(edgeRef: EdgeRef): boolean {
    const { sourceId, targetId } = edgeRef;
    if (sourceId === targetId) return false;

    const { forward, backward } = this.checkBothDirections(edgeRef);

    if (forward && backward) return true;

    if (forward || backward) {
      console.warn(`[NeighborGraph] Inconsistent edge between ${sourceId} and ${targetId}. Only one direction present.`);
      return true;
    }

    return false;
  }

  /**
   * Добавляет ребро-кандидат.
   *
   * Петли игнорируются. Если ребро уже есть в любом направлении — выходим.
   * Фабрика создаёт модель; регистрируем её в edgeCollection (источник правды)
   * и в adjacency под обоими концами.
   */
  public addEdge(edgeRef: EdgeRef): Edge | null {
    const { sourceId, targetId } = edgeRef;

    if (edgeRef.sourceId === edgeRef.targetId) return null;
    const { forward, backward } = this.checkBothDirections(edgeRef);

    if (forward && backward) return null;

    if (forward || backward) {
      console.warn(`[NeighborGraph] Inconsistent edge between ${sourceId} and ${targetId}. Only one direction present.`);
      return null;
    }

    const edge = this.factory.create(edgeRef);
    if (!edge) return null;

    if (this.edgeCollection.getById(edge.id)) return null;

    this.edgeCollection.add(edge);
    this.addToAdjacency(edge.sourceId, edge.id);
    this.addToAdjacency(edge.targetId, edge.id);
    return edge;
  }

  /**
   * Пакетное добавление рёбер.
   *
   * Просто цикл — специальной пакетной логики для добавления не нужно,
   * каждое ребро уникально и добавляется независимо.
   */
  public addEdges(refs: EdgeRef[]): void {
    for (const ref of refs) this.addEdge(ref);
  }

  /**
   * Удаляет одно ребро по модели.
   * Коллекция (swap-with-last) переупорядочится, adjacency — нет:
   * он держит id, а не индексы.
   */
  public removeEdge(edge: Edge): void {
    const { sourceId, targetId, id } = edge;
    this.edgeCollection.removes([id]);
    this.removeFrom(sourceId, id);
    this.removeFrom(targetId, id);
  }

  /**
   * Пакетное удаление рёбер по моделям.
   *
   * Все id уходят в EntityCollection.removes одним вызовом —
   * swap-with-last отработает один раз, а не N.
   */
  public removeEdges(edges: Edge[]): void {
    if (edges.length === 0) return;

    this.edgeCollection.removes(edges.map((edge) => edge.id));

    for (const edge of edges) {
      this.removeFrom(edge.sourceId, edge.id);
      this.removeFrom(edge.targetId, edge.id);
    }
  }

  /**
   * Точечно убирает ссылку на ребро из adjacency указанной точки.
   * Если у точки больше нет рёбер — удаляет запись целиком,
   * чтобы Map не разрасталась пустыми Set'ами.
   *
   * Низкоуровневая операция. Обычно вызывается из removeEdge/removeEdges.
   * Публична — для случаев, когда внешний код сам оркестрирует удаление.
   */
  public removeFrom(pointId: string, edgeId: string): void {
    const edges = this.adjacency.get(pointId);
    if (!edges) return;

    edges.delete(edgeId);
    if (edges.size === 0) this.adjacency.delete(pointId);
  }

  // ───────────────────── queries ─────────────────────

  /**
   * Все рёбра, инцидентные точке.
   * Один проход по Set, без промежуточных массивов.
   */
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

  /** Количество рёбер, инцидентных точке (степень). */
  public getDegree(id: string): number {
    return this.adjacency.get(id)?.size ?? 0;
  }

  /**
   * Быстрая проверка соседства (без варнов о несимметричности).
   * Не путать с hasEdge: тот диагностирует состояние графа,
   * а этот — просто отвечает на вопрос «есть ли ребро между a и b».
   */
  public hasNeighbor(a: string, b: string): boolean {
    if (a === b) return false;

    for (const edge of this.getEdgesForPoint(a)) {
      if (edge.sourceId === b || edge.targetId === b) return true;
    }

    return false;
  }

  /** Все рёбра между двумя точками (может быть несколько при разных modelName). */
  public getEdgesBetween(a: string, b: string): Edge[] {
    if (a === b) return [];

    return this.getEdgesForPoint(a).filter((edge) => edge.sourceId === b || edge.targetId === b);
  }

  /** Модель ребра по id — O(1) через indexMap коллекции. */
  public getEdgeById(id: string): Edge | null {
    return this.edgeCollection.getById(id);
  }

  /**
   * Все модели рёбер (по одной на ребро).
   * Возвращается ЖИВОЙ массив коллекции, не копия. Ссылка стабильна,
   * порядок может меняться после удаления (swap-with-last).
   */
  public getAllEdges(): Edge[] {
    return this.edgeCollection.items;
  }

  /** То же, что getAllEdges — оставлено для совместимости. */
  public getEdgesArrayDirect(): Edge[] {
    return this.edgeCollection.items;
  }

  /** Доступ к самой коллекции — для validate/clone на её уровне. */
  public getEdgeCollection(): EntityCollection<Edge> {
    return this.edgeCollection;
  }

  /** Все точки, у которых есть хотя бы одно ребро. */
  public getPointsWithEdges(): string[] {
    return [...this.adjacency.keys()];
  }

  // ───────────────────── maintenance ─────────────────────

  /**
   * Удаляет все рёбра, инцидентные точке. Возвращает удалённые модели.
   *
   * Полезно при удалении узла из внешней системы: одна операция —
   * и в графе не остаётся «висячих» рёбер.
   */
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

  /**
   * Проверяет согласованность edgeCollection и adjacency.
   *
   * Правила:
   * 1. Каждое ребро из коллекции должно быть зарегистрировано
   *    под обоими своими концами.
   * 2. Каждая ссылка в adjacency должна указывать на существующее ребро.
   * 3. Точка, под которой зарегистрировано ребро, должна быть одним из его концов.
   *
   * @returns { ok, errors } — как у EntityCollection.validate().
   */
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
          errors.push(`Adjacency[${pointId}] references edge ${edgeId} which doesn't touch this point`);
        }
      }
    }

    return { ok: errors.length === 0, errors };
  }

  /**
   * Пересобирает adjacency из edgeCollection — «ремонт» после рассинхрона.
   *
   * Инвариант «коллекция — источник правды» даёт простой recovery:
   * сносим индекс и строим заново по актуальным рёбрам.
   */
  public rebuildAdjacency(): void {
    this.adjacency.clear();

    for (const edge of this.edgeCollection.items) {
      this.addToAdjacency(edge.sourceId, edge.id);
      this.addToAdjacency(edge.targetId, edge.id);
    }
  }

  /**
   * Поверхностная копия графа.
   *
   * - модели рёбер копируются через { ...edge } — вложенные объекты общие;
   * - adjacency строится заново, но симметрично исходному;
   * - factory переиспользуется (нужна только для будущих addEdge).
   */
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

  /**
   * Полная очистка графа.
   * Чистим оба представления — иначе adjacency останется с мёртвыми id.
   */
  public clear(): void {
    this.adjacency.clear();
    this.edgeCollection.clear();
  }
}
