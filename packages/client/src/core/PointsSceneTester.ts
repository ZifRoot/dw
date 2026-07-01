// PointsSceneTester.ts
import { PointsScene } from "./Scene/PointsScene";
import { EdgesScene } from "./Scene/EdgesScene";
import { Edge, EdgeModel } from "./models/Edge";
import { AppMediator } from "./AppMediator";
import { Safe } from "@utils/logger";
import { DocumentsGet200ResponseInner } from "src/clients/dew/fetch";
import { DataManager } from "./data/DataManager";
import { PointTable } from "./data/tables/PointTable";
import { PointModel } from "./models/PointModel";

interface TestConfig {
  /** Процент точек, которые будут обновлены на каждой итерации (0-100) */
  updateFrationRange?: [number, number];
  /** Количество новых точек, добавляемых на каждой итерации (случайное в диапазоне) */
  targetSize?: number;

  removeFrationRange?: [number, number];
  /** Интервал между итерациями в мс */
  intervalMs?: number;
  /** Включить логирование в консоль */
  verbose?: boolean;
  /** Построение полного графа (все пары) */
  fullGraph?: boolean;
}

export class PointsSceneTester {
  private config: Required<TestConfig>;
  private intervalId: number | null = null;
  private nextId = 1000;
  dataManager: DataManager;

  constructor(
    private mediator: AppMediator,
    private pointsScene: PointsScene,
    private edgesScene: EdgesScene,
    config: TestConfig = {},
  ) {
    this.pointsScene = pointsScene;
    this.edgesScene = edgesScene;
    this.config = {
      updateFrationRange: config.updateFrationRange ?? [20 / 100, 70 / 100],
      removeFrationRange: config.removeFrationRange ?? [5 / 100, 20 / 100],
      targetSize: config.targetSize ?? 5,
      intervalMs: config.intervalMs ?? 1000,
      verbose: config.verbose ?? true,
      fullGraph: config.fullGraph ?? true,
    };

    this.dataManager = new DataManager(mediator);
  }

  public start(): void {
    if (this.intervalId !== null) return;
    this.log("Тест запущен");
    // this._start().catch(console.error);

    this.iteration();
  }

  private async _start() {
    let documents = await this.dataManager.reloadTables();
    //this.pointsScene.setPoints(documents.map((d) => this.generatePointf(d)));
  }
  generatePointf(doc: PointTable): PointModel {
    return new PointModel(doc.id, doc.title, false, {
      x: doc.x ?? Math.random() * 800,
      y: doc.y ?? Math.random() * 600,
      z: Math.random(),
    });
  }

  public stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.log("Тест остановлен");
    }
  }

  private iteration(): void {
    this._iteration();
    this.intervalId = window.setTimeout(() => {
      requestAnimationFrame(() => this.iteration());
    }, this.config.intervalMs);
  }

  @Safe
  private _iteration() {
    const start = performance.now();

    let points = this.pointsScene.getPoints(); // получаем актуальные точки
    let validation = this.pointsScene.entities.validate();
    if (!validation.ok) {
      console.error("❌ Ошибки после удаления:", validation.errors);
    }

    let backupCollection = this.pointsScene.entities.clone();
    let [minP, maxP] = this.config.removeFrationRange;

    // 1. Удаляем лишние точки (если пул превышает целевой размер)
    let removeCount = this.randomInt(0, Math.max(0, points.length - this.mediator.targetSize));

    const removedIds = points
      .map((p) => p.id)
      .shuffle()
      .slice(0, removeCount);

    this.pointsScene.removePoints(removedIds);

    validation = this.pointsScene.entities.validate();
    if (!validation.ok) {
      console.error("❌ Ошибки после удаления:", validation.errors);
    }

    points = this.pointsScene.getPoints(); // обновляем после мутаций
    backupCollection = this.pointsScene.entities.clone();

    [minP, maxP] = this.config.updateFrationRange;
    let updateCount = this.randomInt(points.length * minP, points.length * maxP);

    const updatedPoints = [...points]
      .shuffle()
      .slice(0, updateCount)
      .map((p) => this.mutatePoint(p));

    // 3. Добавляем новые точки (если нужно увеличить пул)
    let addCount = this.randomInt(0, Math.max(0, this.mediator.targetSize - points.length));
    const newPoints = Array.from({ length: addCount }).map((_) => this.generateRandomPoint());

    let uppoints = [...updatedPoints, ...newPoints].shuffle();

    this.pointsScene.setPoints(uppoints); // добавление новых

    validation = this.pointsScene.entities.validate();
    if (!validation.ok) {
      console.error("❌ Ошибки после удаления:", validation.errors);
    }
    // 5. Перестраиваем граф связей (полный граф) на основе нового набора точек
    if (uppoints.length > 0 || removeCount > 0) this.updateEdges();

    const duration = performance.now() - start;
    const finalPoints = this.pointsScene.getPoints();
    
    if (this.mediator.autoZoom) this.pointsScene.fitView();
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
    const edges: EdgeModel[] = [];
    for (let i = 0; i < points.length; i++) {
      for (let j = 0; j < 4; j++) {
        let jj = (i + 1 + j) % points.length;
        if (i === jj) continue;
        let pi = points[i];
        let pj = points[jj];
        edges.push({
          id: `${pi.id}-${pj.id}`,
          sourceId: pi.id,
          targetId: pj.id,
          source: pi,
          target: pj,
          distance: 150 + Math.random() * 200,
        });
      }
    }
    this.edgesScene.setEdges(edges);
    if (this.config.verbose) {
      console.log(`[Edges] Построено ${edges.length} рёбер`);
    }
    this.mediator.startRepulsion();
  }

  // ========== Вспомогательные методы ==========

  private generateRandomPoint(): PointModel {
    const id = `p${this.nextId++}`;
    return new PointModel(id, id.slice(1, 5), false, {
      x: Math.random() * 800,
      y: Math.random() * 600,
      z: Math.random(),
    });
  }
  private generatePoint(doc: DocumentsGet200ResponseInner): PointModel {
    return new PointModel(doc.id, doc.title, false, {
      x: Math.random() * 800,
      y: Math.random() * 600,
      z: Math.random(),
    });
  }

  private mutatePoint(point: PointModel): PointModel {
    // Создаём новый объект с изменениями (но сохраняем id)
    let p = point.clone();
    p.x = Math.max(0, Math.min(1000, point.x + (Math.random() - 0.5) * 100));
    p.y = Math.max(0, Math.min(800, point.y + (Math.random() - 0.5) * 100));
    p.text = point.text + (Math.random() > 0.8 ? "!" : "");
    return p;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min) + min);
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
