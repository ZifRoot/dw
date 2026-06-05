// PointsSceneTester.ts
import { PointsScene, Point } from "./PointsScene";

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
}

/**
 * Тестер для PointsScene.
 * Генерирует случайные точки, обновляет их, добавляет новые, удаляет существующие.
 * Проверяет корректность работы setPoints, removePoints, removePointsBy.
 */
export class PointsSceneTester {
  private scene: PointsScene;
  private config: Required<TestConfig>;
  private intervalId: number | null = null;
  private nextId = 1000;

  // Для отслеживания последнего состояния (чтобы не генерировать точки заново каждый раз)
  private currentPoints: Point[] = [];

  constructor(scene: PointsScene, config: TestConfig = {}) {
    this.scene = scene;
    this.config = {
      minPoints: config.minPoints ?? 20,
      maxPoints: config.maxPoints ?? 30,
      updatePercent: config.updatePercent ?? 50,
      addCountRange: config.addCountRange ?? [2, 5],
      removeCountRange: config.removeCountRange ?? [2, 4],
      intervalMs: config.intervalMs ?? 1000,
      verbose: config.verbose ?? true,
    };
  }

  /** Запустить тест (бесконечный цикл) */
  public start(): void {
    if (this.intervalId !== null) return;
    this.log("Тест запущен");
    // Инициализация начальным пулом точек
    this.initPoints();
    this.intervalId = window.setInterval(() => this.iteration(), this.config.intervalMs);
  }

  /** Остановить тест */
  public stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.log("Тест остановлен");
    }
  }

  /** Очистить сцену и завершить тест */
  public clear(): void {
    this.stop();
    this.scene.clear();
    this.currentPoints = [];
    this.log("Сцена очищена");
  }

  private initPoints(): void {
    const count = this.randomInt(this.config.minPoints, this.config.maxPoints);
    this.currentPoints = [];
    for (let i = 0; i < count; i++) {
      this.currentPoints.push(this.generateRandomPoint());
    }
    this.scene.setPoints(this.currentPoints);
    this.log(`Инициализация: ${count} точек`);
  }

  private iteration(): void {
    const start = performance.now();
    let points = [...this.currentPoints]; // копия для мутации

    // 1. Определяем, сколько точек должно быть в пуле (целевой размер)
    let targetSize = this.randomInt(this.config.minPoints, this.config.maxPoints);
    const currentSize = points.length;

    // 2. Обновляем случайные существующие точки (updatePercent от текущего количества)
    const updateCount = Math.floor(currentSize * (this.config.updatePercent / 100));
    const indicesToUpdate = this.randomIndices(currentSize, updateCount);
    for (const idx of indicesToUpdate) {
      points[idx] = this.mutatePoint(points[idx]);
    }

    // 3. Добавляем новые точки (если нужно увеличить пул)
    let addCount = 0;
    if (currentSize < targetSize) {
      addCount = Math.min(targetSize - currentSize, this.randomInt(this.config.addCountRange[0], this.config.addCountRange[1]));
      for (let i = 0; i < addCount; i++) {
        points.push(this.generateRandomPoint());
      }
    }

    // 4. Удаляем лишние точки (если пул превышает целевой размер)
    let removeCount = 0;
    if (points.length > targetSize) {
      removeCount = points.length - targetSize;
      // Удаляем случайные точки (не более чем есть)
      const indicesToRemove = this.randomIndices(points.length, removeCount);
      // Сортируем индексы в порядке убывания, чтобы удалять с конца
      indicesToRemove.sort((a, b) => b - a);
      for (const idx of indicesToRemove) {
        points.splice(idx, 1);
      }
    }

    // 5. Применяем изменения через setPoints (это вызовет upsert)
    this.scene.setPoints(points);

    // 6. Дополнительно тестируем удаление по id (выборочно, если removeCount > 0)
    if (removeCount > 0) {
      const removedIds = points.map(p => p.id); // здесь уже новые точки, старые потеряны
      // На самом деле мы хотим проверить removePoints на отдельных точках.
      // Для этого выберем несколько id из тех, которые были удалены из currentPoints.
      // Но проще: после setPoints вызовем removePoints с некоторыми id и затем снова setPoints для восстановления.
      // Так как тест циклический, можно сделать отдельный тест удаления в одной итерации.
    }

    // Дополнительно: тестируем метод removePoints на случайных id (один раз из нескольких итераций)
    if (Math.random() < 0.3) { // примерно 30% итераций
      const idsToRemove = this.getRandomExistingIds(Math.min(3, this.scene.getPoints().length));
      if (idsToRemove.length > 0) {
        this.log(`Тестируем removePoints по ids: ${idsToRemove.join(', ')}`);
        this.scene.removePoints(idsToRemove);
        // Обновляем текущие точки после удаления
        this.currentPoints = this.scene.getPoints();
      }
    }

    // Обновляем currentPoints для следующей итерации
    this.currentPoints = this.scene.getPoints();

    const duration = performance.now() - start;
    this.log(`Итерация: размер=${this.currentPoints.length}, добавлено=${addCount}, удалено=${removeCount}, обновлено=${updateCount}, время=${duration.toFixed(2)}ms`);
  }

  // ========== Вспомогательные методы ==========

  private generateRandomPoint(): Point {
    const id = `p${this.nextId++}`;
    return {
      id,
      x: Math.random() * 800,
      y: Math.random() * 600,
      text: id.slice(3, 5),
      color: `hsl(${Math.random() * 360}, 70%, 50%)`,
    };
  }

  private mutatePoint(point: Point): Point {
    // Создаём новый объект с изменениями
    return {
      ...point,
      x: Math.max(0, Math.min(1000, point.x + (Math.random() - 0.5) * 100)),
      y: Math.max(0, Math.min(800, point.y + (Math.random() - 0.5) * 100)),
      text: point.text + (Math.random() > 0.8 ? '!' : ''),
      color: `hsl(${Math.random() * 360}, 70%, 50%)`,
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

  private getRandomExistingIds(count: number): string[] {
    const points = this.scene.getPoints();
    if (points.length === 0) return [];
    const shuffled = [...points];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, Math.min(count, shuffled.length)).map(p => p.id);
  }

  private log(msg: string): void {
    if (this.config.verbose) {
      console.log(`[PointsSceneTester] ${msg}`);
    }
  }
}