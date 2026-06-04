import * as d3 from "d3";
import { ZoomTransform } from "d3";
import { AppMediator } from "./AppMediator";
import { Point } from "./Point";
import { CanvasRenderer } from "./renderer/CanvasRenderer";
import { RepulsionEngine } from "./physics/RepulsionEngine";
import { EmbeddingEngine } from "./physics/EmbeddingEngine";
import { DataManager } from "./data/DataManager";
import { ModelManager } from "./ModelManager";
import { DragHandler } from "./interaction/DragHandler";

/**
 * Координатор – управляет анимационным циклом, флагами,
 * связывает все подсистемы. Не содержит деталей рендеринга или физики.
 */
export class CanvasEngine {
  public points: Point[] = [];
  public transform: ZoomTransform;
  public animationFrameId: number | null = null;
  public needsRepulsion = true;
  public needsEmbedding = false;
  public temperatureThreshold = 0.2;

  // Подсистемы
  private renderer: CanvasRenderer;
  private repulsion: RepulsionEngine;
  private embedding: EmbeddingEngine;
  private dataManager: DataManager;
  private modelManager: ModelManager;
  private dragHandler: DragHandler;

  // Настройки
  public autoZoomEnabled = false;
  public forceStrength = 0.05;
  public maxDistancePx = 50000;
  public iterationsPerFrame = 10;
  public smoothingFactor = 0.06;

  constructor(
    public element: HTMLElement,
    public mediator: AppMediator,
  ) {
    this.transform = d3.zoomIdentity;

    // Инициализация подсистем
    this.renderer = new CanvasRenderer(element);
    this.repulsion = new RepulsionEngine();
    this.embedding = new EmbeddingEngine();
    this.dataManager = new DataManager();
    this.modelManager = new ModelManager(mediator);

    this.dragHandler = new DragHandler(
      this.renderer.getSvg(),
      this.renderer.getTransform.bind(this.renderer),
      (point: Point | null) => {
        this.draggedPoint = point;
      },
      () => {
        this.isDragging = true;
      },
      (x: number, y: number) => {
        if (this.draggedPoint) this.updateDraggedPoint(x, y);
      },
      () => {
        this.draggedPoint = null;
        this.isDragging = false;
        this.needsRepulsion = true;
        this.needsEmbedding = false;
      },
    );

    this.init();
  }

  private async init(): Promise<void> {
    await this.loadData();
    this.renderer.renderPoints(this.points);
    this.startAnimationLoop();
  }

  private async loadData(): Promise<void> {
    this.points = await this.dataManager.fetchDocuments();
    await this.dataManager.loadPositionsAsync(this.points);
    await this.dataManager.loadEmbeddings(this.points);
    this.renderer.renderPoints(this.points);
    await this.modelManager.updateModelStats(this.points, this.dataManager.getEmbeddingsStore());
    this.modelManager.startDoublePush(); // запускаем двойной толкач генератора
  }

  // Вспомогательные поля для drag (хранятся здесь, т.к. относятся к состоянию перетаскивания)
  private draggedPoint: Point | null = null;
  private isDragging = false;

  private updateDraggedPoint(x: number, y: number): void {
    if (!this.draggedPoint) return;
    this.draggedPoint.x = x;
    this.draggedPoint.y = y;
    this.renderer.updatePointTransform(this.draggedPoint);
  }

  // Анимационный цикл
  public startAnimationLoop(): void {
    if (this.animationFrameId !== null) return;
    const step = () => {
      this.updateAnimation();
      this.animationFrameId = requestAnimationFrame(step);
    };
    this.animationFrameId = requestAnimationFrame(step);
  }

  public stopAnimationLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private updateAnimation(): void {
    if (this.needsRepulsion) {
      const maxShift = this.repulsion.applyRepulsionStep(this.points);
      this.renderer.updatePointsTransform(this.points);
      this.repulsion.updateTemperature(maxShift);
      this.mediator.temperature = this.repulsion.temperature * 100;
      if (this.repulsion.temperature < this.temperatureThreshold) {
        this.needsRepulsion = false;
        this.needsEmbedding = true;
        this.dataManager.savePositionsAsync(this.points).catch(console.error);
      }
      if (this.autoZoomEnabled) this.renderer.fitZoomToAllPoints(this.points);
      return;
    }

    if (this.needsEmbedding) {
      // Шаг эмбеддинга (притяжение)
      const pairs = this.modelManager.getPairs();
      if (pairs.length === 0) return;
      for (let i = 0; i < this.iterationsPerFrame; i++) {
        const idx = Math.floor(Math.random() * pairs.length);
        this.embedding.applyDisplacement(pairs[idx], this.forceStrength, this.smoothingFactor);
      }
      this.renderer.updatePointsTransform(this.points);
    }

    // Прогресс генерации пар (если ещё не закончена)
    const stillProcessing = this.modelManager.stepAllModels();
    if (!stillProcessing && !this.needsRepulsion && !this.needsEmbedding) {
      // Все модели обработаны, можно перейти к репульсии или эмбеддингу
      if (this.modelManager.hasPairs()) {
        this.needsEmbedding = true;
      }
    }
  }

  // Публичные методы
  public startForceLayout(strength = 0.05, maxPx = 500, perFrame = 5, smooth = 0.3): void {
    this.forceStrength = strength;
    this.maxDistancePx = maxPx;
    this.iterationsPerFrame = perFrame;
    this.smoothingFactor = smooth;
    this.needsRepulsion = true;
    this.needsEmbedding = false;
  }

  public setAutoZoom(enabled: boolean): void {
    this.autoZoomEnabled = enabled;
  }

  public clearPoints(): void {
    this.points = [];
    this.modelManager.clear();
    this.dataManager.clear();
    this.renderer.renderPoints(this.points);
    this.needsRepulsion = false;
    this.needsEmbedding = false;
  }
}
