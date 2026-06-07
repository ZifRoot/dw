// PointsSceneTester.ts
import { PointsScene, Point } from "./Scene/PointsScene";
import { EdgesScene, Edge } from "./Scene/EdgesScene";

interface TestConfig {
  /** Минимальное количество точек в пуле */
  minPoints?: number;
  /** Максимальное количество точек в пуле */
  maxPoints?: number;
  /** Процент точек, которые будут обновлены на каждой итерации (0-100) */
  updatePercent?: number;
  /** Количество новых точек, добавляемых на каждой итерации (случайное в диапазоне) */
  addCountRange?: [number, number];
  /** Количество удаляемых точек на итерации (случайное в диапазоне) */
  removeCountRange?: [number, number];
  /** Интервал между итерациями в мс */
  intervalMs?: number;
  /** Включить логирование в консоль */
  verbose?: boolean;
  /** Построение полного графа (все пары) */
  fullGraph?: boolean;
}

export class PointsSceneTester {
  private pointsScene: PointsScene;
  private edgesScene: EdgesScene;
  private config: Required<TestConfig>;
  private intervalId: number | null = null;
  private nextId = 1000;

  constructor(pointsScene: PointsScene, edgesScene: EdgesScene, config: TestConfig = {}) {
    this.pointsScene = pointsScene;
    this.edgesScene = edgesScene;
    this.config = {
      minPoints: config.minPoints ?? 20,
      maxPoints: config.maxPoints ?? 30,
      updatePercent: config.updatePercent ?? 50,
      addCountRange: config.addCountRange ?? [2, 5],
      removeCountRange: config.removeCountRange ?? [2, 4],
      intervalMs: config.intervalMs ?? 1000,
      verbose: config.verbose ?? true,
      fullGraph: config.fullGraph ?? true,
    };
  }

  public start(): void {
    if (this.intervalId !== null) return;
    this.log("Тест запущен");
    this.initPoints();
    this.updateEdges(); // построить начальный граф
    this.intervalId = window.setInterval(() => this.iteration(), this.config.intervalMs);
  }

  public stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.log("Тест остановлен");
    }
  }

  public clear(): void {
    this.stop();
    this.pointsScene.clear();
    this.edgesScene.clear();
    this.log("Сцена очищена");
  }

  private initPoints(): void {
    const count = this.randomInt(this.config.minPoints, this.config.maxPoints);
    const points: Point[] = [];
    for (let i = 0; i < count; i++) {
      points.push(this.generateRandomPoint());
    }
    this.pointsScene.setPoints(points);
    this.log(`Инициализация: ${count} точек`);
  }

  private iteration(): void {
    const start = performance.now();
    let points = this.pointsScene.getPoints(); // получаем актуальные точки

    // 1. Определяем, сколько точек должно быть в пуле
    const targetSize = this.randomInt(this.config.minPoints, this.config.maxPoints);
    const currentSize = points.length;

    // 2. Обновляем случайные существующие точки (updatePercent от текущего количества)
    const updateCount = Math.floor(currentSize * (this.config.updatePercent / 100));
    const indicesToUpdate = this.randomIndices(currentSize, updateCount);
    const updatedPoints: Point[] = [];
    for (const idx of indicesToUpdate) {
      const newPoint = this.mutatePoint(points[idx]);
      // Мутируем точку прямо в массиве через setPoints (upsert)
      updatedPoints.push(newPoint);
    }
    if (updatedPoints.length) {
      this.pointsScene.setPoints(updatedPoints); // обновление существующих
    }

    // 3. Добавляем новые точки (если нужно увеличить пул)
    let addCount = 0;
    if (currentSize < targetSize) {
      addCount = Math.min(targetSize - currentSize, this.randomInt(this.config.addCountRange[0], this.config.addCountRange[1]));
      const newPoints: Point[] = [];
      for (let i = 0; i < addCount; i++) {
        newPoints.push(this.generateRandomPoint());
      }
      this.pointsScene.setPoints(newPoints); // добавление новых
    }

    // 4. Удаляем лишние точки (если пул превышает целевой размер)
    let removeCount = 0;
    points = this.pointsScene.getPoints(); // обновляем после мутаций
    const currentSizeAfterOps = points.length;
    if (currentSizeAfterOps > targetSize) {
      removeCount = currentSizeAfterOps - targetSize;
      const idsToRemove: string[] = [];
      const allIds = points.map((p) => p.id);
      const shuffled = [...allIds];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      for (let i = 0; i < removeCount; i++) idsToRemove.push(shuffled[i]);
      this.pointsScene.removePoints(idsToRemove);
    }

    // 5. Перестраиваем граф связей (полный граф) на основе нового набора точек
    this.updateEdges();

    const duration = performance.now() - start;
    const finalPoints = this.pointsScene.getPoints();
    this.log(
      `Итерация: размер=${finalPoints.length}, добавлено=${addCount}, удалено=${removeCount}, обновлено=${updateCount}, время=${duration.toFixed(2)}ms`,
    );
  }

  /** Построить полный граф (все пары) из текущих точек */
  private updateEdges(): void {
    const points = this.pointsScene.getPoints();
    if (!this.config.fullGraph) {
      // Если не полный граф, можно построить пустой или случайный
      this.edgesScene.setEdges([]);
      return;
    }
    const edges: Edge[] = [];
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        edges.push({
          id: `${points[i].id}-${points[j].id}`,
          sourceId: points[i].id,
          targetId: points[j].id,
        });
      }
    }
    this.edgesScene.setEdges(edges);
    if (this.config.verbose) {
      console.log(`[Edges] Построено ${edges.length} рёбер`);
    }
  }

  // ========== Вспомогательные методы ==========

  private generateRandomPoint(): Point {
    const id = `p${this.nextId++}`;
    return {
      id,
      x: Math.random() * 800,
      y: Math.random() * 600,
      text: id.slice(1, 3),

    };
  }

  private mutatePoint(point: Point): Point {
    // Создаём новый объект с изменениями (но сохраняем id)
    return {
      ...point,
      x: Math.max(0, Math.min(1000, point.x + (Math.random() - 0.5) * 100)),
      y: Math.max(0, Math.min(800, point.y + (Math.random() - 0.5) * 100)),
      text: point.text + (Math.random() > 0.8 ? "!" : ""),
    };
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private randomIndices(max: number, count: number): number[] {
    const indices = Array.from({ length: max }, (_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices.slice(0, count);
  }

  private log(msg: string): void {
    if (this.config.verbose) {
      console.log(`[PointsSceneTester] ${msg}`);
    }
  }
}
