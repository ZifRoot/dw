// core/PointGraphManager.ts
import { Point } from "../models/Point";
import { Edge } from "../models/Edge";
import { EntityCollection } from "./EntityCollection";
import { NeighborGraph } from "./NeighborGraph";
import { EdgeRef } from "../models/EdgeRef";
import { EdgeRefs } from "../models/EdgeRefs";
import "@utils/array-extensions";
import { AppMediator } from "@core/AppMediator";
import { IEdgeFactory } from "@core/interfaces/IEdgeFactory";

/**
 * Управляет жизненным циклом точек и рёбер графа.
 *
 * Идеология PGM:
 * - PGM — единственная точка, через которую изменяется количество точек.
 * - PGM поддерживает согласованность: при удалении точки удаляются её рёбра.
 * - NeighborGraph отвечает за хранение рёбер и индекс смежности; PGM отвечает
 *   за согласованное изменение точек + графа.
 * - PGM не знает об эмбеддингах. Специализированный IEdgeFactory определяет,
 *   какой конкретный Edge создавать из EdgeRef.
 * - PGM следует идеологии in-place: внутренние массивы коллекций не пересоздаются
 *   при изменении состава. Поэтому полученный через PGM живой массив остаётся
 *   тем же самым массивом на протяжении всего жизненного цикла PGM. Его содержимое
 *   изменяется in-place. Это важный контракт PGM, на который могут опираться сцены
 *   и алгоритмы, хранящие ссылку на массив.
 * - Методы чтения, возвращающие массивы, возвращают именно эти стабильные живые
 *   массивы, а не новые копии. Такой доступ является частью архитектуры PGM.
 * - Событие pointsGraphUpdated() сообщает View о завершении логической группы
 *   изменений. Для нескольких изменений следует использовать batch().
 *
 * ВАЖНО: API этого класса исторически формировался разными разработчиками,
 * поэтому названия сейчас неоднородны. Ниже у методов явно указаны варианты
 * будущих имён. Эти комментарии являются частью документации API и не меняют
 * текущие имена методов.
 */
export class PointGraphManager {
  private pointCollection: EntityCollection<Point> = new EntityCollection((p) => p.id);
  private graph: NeighborGraph;
  private deep = 0;
  private changedInBatch = false;

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

  /**
   * Полностью заменить коллекцию точек.
   *
   * Это НЕ "обновление одной точки": существующая коллекция заменяется
   * переданным набором. Точки, которых больше нет, удаляют свои рёбра.
   *
   * Будущие варианты имени из API-аудита:
   * - replacePoints
   * - setPoints
   * - resetPoints
   * - syncPoints
   *
   * Предпочтительный смысл: replacePoints.
   *
   * Изменение API пока НЕ выполнять — имя будет переименовано отдельно в IDE.
   */
  public updatePoints(points: Point[]): void {
    const oldIds = new Set(this.pointCollection.indexMap.keys());
    const newIds = new Set(points.map((point) => point.id));

    const removedIds = [...oldIds].filter((id) => !newIds.has(id));
    this.removeEdgesForPoints(removedIds);

    this.pointCollection.clear();
    this.pointCollection._setPoints(points, [], []);
    this.notifyGraphChanged();
  }

  /**
   * Добавить точки в существующую коллекцию.
   *
   * Не следует использовать этот метод для полной синхронизации набора точек.
   * Для полной замены предназначен updatePoints(), а для композиции удаления
   * и добавления — splicePoints().
   *
   * Будущие варианты имени:
   * - addPoints
   * - insertPoints
   * - appendPoints
   *
   * Предпочтительный вариант: addPoints.
   */
  public addPoints(points: Point[]): void {
    if (points.length === 0) return;

    this.pointCollection._setPoints(points, [], []);
    this.notifyGraphChanged();
  }

  /**
   * Удалить точки по идентификаторам.
   *
   * Сначала удаляются все инцидентные рёбра, затем сами точки.
   * Неизвестные идентификаторы игнорируются.
   *
   * Будущие варианты имени:
   * - removePoints
   * - deletePoints
   * - detachPoints
   *
   * Предпочтительный вариант: removePoints.
   */
  public removePoints(ids: string[]): void {
    if (ids.length === 0) return;

    const existingIds = ids.filter((id) => this.pointCollection.indexMap.has(id));
    if (existingIds.length === 0) return;

    this.removeEdgesForPoints(existingIds);
    this.pointCollection.removes(existingIds);
    this.notifyGraphChanged();
  }

  /**
   * Выполнить типичную замену части коллекции точек за одну логическую операцию.
   *
   * Сначала удаляются указанные точки, затем добавляются новые.
   * Событие pointsGraphUpdated() отправляется только один раз.
   *
   * Новые варианты имени:
   * - splicePoints
   * - changePoints
   * - updatePoints
   * - mutatePoints
   * - replacePoints
   *
   * Предпочтительный вариант: splicePoints.
   */
  public splicePoints(removeIds: string[], addPoints: Point[]): void {
    this.batch((pgm) => {
      pgm.removePoints(removeIds);
      pgm.addPoints(addPoints);
    });
  }

  /**
   * Полностью заменить точки и рёбра графа.
   *
   * Текущее имя историческое и слишком общее: метод не делает "update",
   * а именно заменяет состояние графа.
   *
   * Будущие варианты имени:
   * - replaceGraph
   * - replace
   * - setGraph
   * - resetGraph
   * - loadGraph
   *
   * Предпочтительный вариант: replaceGraph.
   *
   * TODO: старое имя update() не удалять до отдельного переименования.
   */
  public update(points: Point[], edges: EdgeRefs): void {
    this.batch((pgm) => {
      pgm.updatePoints(points);
      pgm.initFromRefs(edges);
    });
  }

  /**
   * Добавить несколько рёбер из EdgeRef.
   *
   * Все рёбра создаются через IEdgeFactory. PGM не знает, являются ли
   * создаваемые Edge обычными Edge, EdgeModel, LevenshteinEdgeModel и т. п.
   *
   * Новые варианты имени:
   * - addEdges
   * - createEdges
   * - addEdgesFromRefs
   *
   * Предпочтительный вариант: addEdges.
   */
  public addEdges(refs: EdgeRefs): Edge[] {
    const edges: Edge[] = [];

    for (const ref of refs) {
      const edge = this.graph.addEdge(ref);
      if (edge) edges.push(edge);
    }

    if (edges.length > 0) {
      this.notifyGraphChanged();
    }

    return edges;
  }

  /**
   * Создать случайный граф: для каждой точки выбрать до K случайных соседей.
   *
   * Метод заменяет существующий набор рёбер случайным графом.
   * PGM не интерпретирует содержимое EdgeRef — конкретное ребро создаёт фабрика.
   *
   * Будущие варианты имени:
   * - createRandomGraph
   * - generateRandomGraph
   * - resetRandomGraph
   * - replaceWithRandomGraph
   *
   * Предпочтительный вариант: createRandomGraph.
   *
   * TODO: initRandom() не удалять до отдельного переименования.
   */
  public initRandom(K: number = 3): void {
    const ids = this.getPointIds();
    this.graph.clear();

    if (ids.length < 2) {
      this.notifyGraphChanged();
      return;
    }

    for (const sourceId of ids) {
      const candidates = ids
        .filter((targetId) => targetId !== sourceId)
        .shuffle()
        .slice(0, Math.min(K, ids.length - 1));

      for (const targetId of candidates) {
        this.graph.addEdge({ sourceId, targetId });
      }
    }

    this.notifyGraphChanged();
  }

  /**
   * Заменить текущий набор рёбер набором, заданным EdgeRef.
   *
   * Название initFromRefs вводит в заблуждение: метод не только "инициализирует"
   * граф, но и предварительно очищает существующие рёбра.
   *
   * Будущие варианты имени:
   * - replaceEdges
   * - setEdges
   * - resetEdges
   * - loadEdges
   * - replaceGraphEdges
   *
   * Предпочтительный вариант: replaceEdges.
   *
   * TODO: метод планируется переименовать; пока НЕ удалять.
   */
  public initFromRefs(refs: EdgeRefs): void {
    this.graph.clear();

    for (const ref of refs) {
      this.graph.addEdge(ref);
    }

    this.notifyGraphChanged();
  }

  /**
   * Добавить одно ребро из EdgeRef.
   *
   * EdgeRef — описание связи; реальный Edge создаёт IEdgeFactory.
   * Если фабрика не смогла создать ребро, возвращается null.
   *
   * Будущие варианты имени:
   * - addEdge
   * - createEdge
   * - addEdgeFromRef
   *
   * Предпочтительный вариант: addEdge.
   */
  public addEdge(edgeRef: EdgeRef): Edge | null {
    const edge = this.graph.addEdge(edgeRef);

    if (edge) {
      this.notifyGraphChanged();
    }

    return edge;
  }

  /**
   * Удалить одно ребро по объекту Edge.
   *
   * Будущие варианты имени:
   * - removeEdge
   * - deleteEdge
   *
   * Предпочтительный вариант: removeEdge.
   */
  public removeEdge(edge: Edge): void {
    this.graph.removeEdge(edge);
    this.notifyGraphChanged();
  }

  /**
   * Удалить несколько рёбер.
   *
   * Будущие варианты имени:
   * - removeEdges
   * - deleteEdges
   *
   * Предпочтительный вариант: removeEdges.
   */
  public removeEdges(edges: Edge[]): void {
    if (edges.length === 0) return;

    this.graph.removeEdges(edges);
    this.notifyGraphChanged();
  }

  /**
   * Получить точку по идентификатору.
   *
   * Это операция чтения и она не генерирует событие.
   */
  public getPointById(id: string): Point | null {
    return this.pointCollection.getById(id) ?? null;
  }

  /**
   * Получить все рёбра, инцидентные данной точке.
   *
   * Возможное более точное имя:
   * - getIncidentEdges
   *
   * Текущее getEdgesForPoint допустимо и пока сохраняется.
   */
  public getEdgesForPoint(id: string): Edge[] {
    return this.graph.getEdgesForPoint(id);
  }

  /**
   * Получить живой массив точек.
   *
   * PGM следует in-place идеологии: внутренний массив точек не пересоздаётся.
   * Поэтому возвращаемая ссылка стабильна и продолжает указывать на тот же
   * массив после addPoints(), removePoints(), splicePoints() и других изменений.
   *
   * Массив НЕ копируется. Изменение его состава напрямую обходит PGM
   * и потому не должно использоваться для изменения количества точек.
   *
   * T используется для embedding-specific потребителей, которым нужен
   * более конкретный тип (например PointModel).
   *
   * Возможные варианты имени:
   * - getPoints
   * - getPointsOfType
   * - getModels
   *
   * Текущее имя getPoints сохраняется.
   */
  public getPoints<T extends Point>(): T[] {
    return this.pointCollection.items as T[];
  }

  /**
   * Получить ссылку на живой массив точек (не копию).
   *
   * Внутренний массив не пересоздаётся: PGM изменяет его содержимое in-place.
   * Поэтому ссылка, возвращённая этим методом, остаётся актуальной после любых
   * изменений количества точек через PGM.
   *
   * Используется сценами и алгоритмами для прямого доступа к текущему набору.
   * Для изменения количества точек необходимо использовать PGM:
   * addPoints(), removePoints(), splicePoints() и т. п.
   *
   * Возможные варианты имени:
   * - getPoints
   * - getMutablePoints
   * - getLivePoints
   * - getPointsArray
   *
   * Текущее имя сохраняется из-за существующих потребителей.
   */
  public getPointsArray(): Point[] {
    return this.pointCollection.items;
  }

  /**
   * Получить ссылку на живой массив рёбер (не копию).
   *
   * Внутренний массив рёбер не пересоздаётся. PGM/NeighborGraph изменяют его
   * содержимое in-place, поэтому сохранённая ссылка остаётся актуальной после
   * добавления и удаления рёбер.
   *
   * Возможные варианты имени:
   * - getEdges
   * - getLiveEdges
   * - getEdgesArray
   *
   * Важно: прямое изменение количества рёбер через массив обходит API PGM.
   * Такой доступ предназначен для чтения/алгоритмов, которым нужен live view.
   */
  public getEdgesArray(): Edge[] {
    return this.graph.getEdgesArrayDirect();
  }

  /**
   * Получить внутреннюю коллекцию рёбер.
   *
   * Это низкоуровневый compatibility API, который раскрывает EntityCollection.
   * В перспективе его можно удалить после перевода потребителей на более
   * специализированные методы PGM.
   *
   * Возможные варианты имени:
   * - getEdgeCollection
   * - getEdgesCollection
   * - getEdgeStore
   *
   * TODO: кандидат на удаление после миграции потребителей. Пока НЕ удалять.
   */
  public getEdgeCollection(): EntityCollection<Edge> {
    return this.graph.getEdgeCollection();
  }

  /**
   * Получить идентификаторы всех точек.
   *
   * Это операция чтения; возвращается новый массив идентификаторов.
   */
  public getPointIds(): string[] {
    return Array.from(this.pointCollection.indexMap.keys());
  }

  /**
   * Получить внутреннюю коллекцию точек.
   *
   * Это низкоуровневый compatibility API. Изменение количества точек
   * напрямую через EntityCollection обходит гарантии PGM.
   *
   * Возможные варианты:
   * - getPointCollection
   * - getPointsCollection
   *
   * TODO: кандидат на удаление после миграции потребителей. Пока НЕ удалять.
   */
  public getPointCollection(): EntityCollection<Point> {
    return this.pointCollection;
  }

  /**
   * Полностью очистить точки и рёбра.
   *
   * В отличие от replaceGraph() метод не принимает новое состояние.
   *
   * Возможные варианты:
   * - clear
   * - reset
   * - clearGraph
   *
   * Предпочтительный вариант: clear.
   */
  public clear(): void {
    const hadState = this.pointCollection.items.length > 0 || this.graph.getEdgesArrayDirect().length > 0;

    this.pointCollection.clear();
    this.graph.clear();

    if (hadState) {
      this.notifyGraphChanged();
    }
  }

  /**
   * Выполнить несколько изменений PGM как одну логическую операцию.
   *
   * Callback получает сам PGM, поэтому внутри batch доступны все обычные
   * методы PGM. Отдельных публичных *Silent() методов не требуется.
   *
   * Вложенные batch поддерживаются: событие отправляется только внешним
   * batch после завершения всей группы изменений.
   *
   * Возможные варианты имени:
   * - batch
   * - batchUpdate
   * - transaction
   * - transactional
   * - group
   * - atomic
   * - runBatch
   * - runTransaction
   * - apply
   *
   * Предпочтительный вариант: batch.
   *
   * Название transaction не идеально, потому что здесь нет rollback/commit.
   */
  public batch(action: (pgm: PointGraphManager) => void): void {
    this.deep++;

    try {
      action(this);
    } finally {
      this.deep--;

      if (this.deep === 0 && this.changedInBatch) {
        this.changedInBatch = false;
        this.mediator.pointsGraphUpdated();
      }
    }
  }

  /**
   * Создать полный граф текущих точек.
   *
   * Для каждой пары различных точек создаётся максимум одно ребро.
   * Уже существующие рёбра NeighborGraph не дублируются.
   *
   * Это eager-операция: IEdgeFactory вызывается для всех пар. Поэтому её
   * не следует использовать там, где создание Edge дорого и требуется
   * поэтапная материализация (например, пошаговое вычисление расстояний).
   * Для такого сценария предназначен createCompleteGraphRefs().
   *
   * Возможные варианты имени:
   * - createCompleteGraph
   * - createCompleteGraphEdges
   * - connectAllPoints
   * - connectEveryPoint
   * - linkAllPoints
   * - createAllPairs
   * - generateCompleteGraph
   *
   * Предпочтительный вариант: createCompleteGraph.
   */
  public createCompleteGraph(): Edge[] {
    const refs = this.createCompleteGraphRefs();
    return this.addEdges(refs);
  }

  /**
   * Создать EdgeRef для полного графа текущих точек.
   *
   * Метод НЕ создаёт Edge и НЕ вызывает IEdgeFactory. Это дешёвый способ
   * получить все пары для ленивой/пошаговой материализации рёбер.
   *
   * Возможные варианты имени:
   * - createCompleteGraphRefs
   * - generateCompleteGraphRefs
   * - getCompleteGraphRefs
   * - getAllPointPairs
   * - createAllPairs
   *
   * Для сценариев с дорогим EdgeFactory предпочтительно разделять:
   * 1. генерацию пар;
   * 2. создание конкретных Edge.
   */
  public createCompleteGraphRefs(): EdgeRefs {
    const points = this.pointCollection.items;
    const refs: EdgeRefs = [];

    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        refs.push({
          sourceId: points[i].id,
          targetId: points[j].id,
        });
      }
    }

    return refs;
  }

  /**
   * Уведомить View об изменении графа либо отложить уведомление до конца batch.
   *
   * deep == 0: изменение выполняется как самостоятельная операция.
   * deep > 0: событие откладывается, чтобы несколько изменений дали одно
   * pointsGraphUpdated().
   */
  private notifyGraphChanged(): void {
    if (this.deep === 0) {
      this.mediator.pointsGraphUpdated();
      return;
    }

    this.changedInBatch = true;
  }

  /**
   * Удалить все рёбра, инцидентные указанным точкам.
   *
   * Внутренний метод: он не является частью публичной API-идеологии PGM.
   * Удаление точек должно проходить через removePoints()/splicePoints().
   */
  private removeEdgesForPoints(ids: string[]): void {
    for (const id of ids) {
      const edges = this.graph.getEdgesForPoint(id);

      for (const edge of edges) {
        this.graph.removeEdge(edge);
      }
    }
  }
}
