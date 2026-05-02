import * as d3 from "d3";
import { ZoomTransform } from "d3";
import { accurateSum, delay, LogAsync, LogSync } from "../utils/data-utils";
import { Throttler } from "../utils/throttler";
import { AppMediator } from "./AppMediator";
import { Point } from "./Point";
import { PointModel } from "./PointModel";
import { Pair } from "./Pair";
import { ChatSession } from "./ChatSession";
import { Embedding } from "./Embedding";
import { ModelData } from "./ModelData";

// =============================== CanvasEngine ===============================

export class CanvasEngine {
  public svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  public container!: d3.Selection<SVGGElement, unknown, null, undefined>;
  public points: Point[] = [];
  public transform: ZoomTransform;

  public draggedPoint: Point | null = null;
  public isDragging = false;
  public animationFrameId: number | null = null;

  // Флаги состояния анимации
  public needsRepulsion = true;
  public needsEmbedding = false;
  public repulsionStrength = 0.5;
  public minDistancePx = 200;
  public minDistanceSq = this.minDistancePx * this.minDistancePx;

  public forceStrength = 0.05;
  public maxDistancePx = 5000;
  public iterationsPerFrame = 100;
  public smoothingFactor = 0.6;
  public autoZoomEnabled = false;

  // Вместо старых полей (embedding в Point, pairs, coverage, modelMaxCosine и т.д.)
  public embeddingsStore = new Map<string, Embedding[]>();
  public coverageCache = new Map<string, number>();
  public topModelNames: string[] = [];
  public models: ModelData[] = [];
  public pairs: Pair[] = [];
  public pairsPerFrame = 500;

  public coverage: Map<string, number> = new Map();
  public modelMaxCosine: Map<string, number> = new Map();
  epsilon: number = 1e-6;
  public temperatureThreshold = 0.2;
  public repulsionTemperature: number = 0;
  public throttler: Throttler;
  modelsMap: Map<string, ModelData> = new Map();
  allModelsGen: Generator<{ progress: number; done: boolean }, void, unknown> | null = null;

  constructor(
    public element: HTMLElement,
    public mediator: AppMediator,
  ) {
    this.throttler = new Throttler(10, 10);
    this.transform = d3.zoomIdentity;
    this.initSvg();
    this.initGlobalDrag();
    this.initZoom();
    this.addInitialPoints().catch(console.error);
    this.startAnimationLoop();
  }

  // ========== 1. Инициализация ==========

  public initSvg(): void {
    this.svg = d3.select(this.element).append("svg").attr("width", "100%").attr("height", "100%").attr("viewBox", "0 0 800 600");
    this.container = this.svg.append("g");
  }

  public initZoom(): void {
    const zoom = d3.zoom<SVGSVGElement, unknown>().on("zoom", (event) => {
      if (this.isDragging) return;
      this.transform = event.transform;
      this.updatePointsStyle();
    });
    this.svg.call(zoom);
  }

  public initGlobalDrag(): void {
    const drag = d3
      .drag<SVGSVGElement, unknown>()
      .on("start", this.onDragStartGlobal.bind(this))
      .on("drag", this.onDragGlobal.bind(this))
      .on("end", this.onDragEndGlobal.bind(this));
    this.svg.call(drag);
  }

  // ========== 2. Drag & Drop ==========

  public findPointUnderCursor(event: d3.D3DragEvent<SVGSVGElement, unknown, any>): Point | null {
    let target = event.sourceEvent.target as HTMLElement;
    while (target && target !== (this.svg.node() as any as HTMLElement) && target.tagName !== "circle") {
      target = target.parentNode as HTMLElement;
    }
    if (!target || target.tagName !== "circle") return null;
    const group = target.parentNode as SVGGElement;
    return d3.select(group).datum() as Point | null;
  }

  public onDragStartGlobal(event: d3.D3DragEvent<SVGSVGElement, unknown, any>): void {
    if (this.draggedPoint) return;
    const point = this.findPointUnderCursor(event);
    if (!point) return;
    this.draggedPoint = point;
    this.isDragging = true;
    event.sourceEvent.stopPropagation();
    event.sourceEvent.preventDefault();
  }

  public onDragGlobal(event: d3.D3DragEvent<SVGSVGElement, unknown, any>): void {
    if (!this.draggedPoint || !this.transform) return;
    const svgNode = this.svg.node();
    if (!svgNode) return;
    const [mx, my] = d3.pointer(event.sourceEvent, svgNode);
    const [invX, invY] = this.transform.invert([mx, my]);
    this.updateDraggedPoint(invX, invY);
    event.sourceEvent.stopPropagation();
    event.sourceEvent.preventDefault();
  }

  public updateDraggedPoint(x: number, y: number): void {
    if (!this.draggedPoint) return;
    this.draggedPoint.x = x;
    this.draggedPoint.y = y;
    const group = this.draggedPoint.groupElement;
    if (group) {
      d3.select(group).attr("transform", `translate(${x},${y})`);
    }
  }

  public onDragEndGlobal(event: d3.D3DragEvent<SVGSVGElement, unknown, any>): void {
    if (this.draggedPoint) {
      this.draggedPoint = null;
      this.isDragging = false;
      event.sourceEvent.stopPropagation();
      this.needsRepulsion = true;
      this.needsEmbedding = false;
    }
  }
  // ========== Применяем логирование к долгим операциям ==========
  @LogAsync
  public async loadEmbeddings(): Promise<void> {
    this.embeddingsStore.clear();
    await Promise.all(this.points.map((p) => this.fetchEmbeddingForPoint(p)));
    this.needsRepulsion = true;
    this.needsEmbedding = false;
    this.updateModelStats();
  }

  // ========== 3. Загрузка данных ==========
  @LogAsync
  public async addInitialPoints(): Promise<void> {
    this.points.push(...(await this.fetchDocuments()));
    this.needsRepulsion = true;
    this.renderPoints();
    await this.loadEmbeddings();
  }

  @LogAsync
  public async fetchDocuments(): Promise<Point[]> {
    const response = await fetch(`/api/documents`);
    if (!response.ok) return [];
    const data = (await response.json()) as ChatSession[];
    return data.map((session) => this.createPointFromSession(session));
  }

  public createPointFromSession(session: ChatSession): Point {
    return new Point(session.id, session.title, 300, 300, this.getOffsetBySide("right"));
  }

  private async fetchEmbeddingForPoint(point: Point): Promise<void> {
    const resp = await fetch(`/api/embeddings/${point.id}`);
    const data = (await resp.json()) as Embedding[];
    this.embeddingsStore.set(point.id, data);
  }

  @LogSync
  public updateModelStats(): void {
    this.coverage = this.getComputeCoverage();
    this.topModelNames = this.selectTopModels(1);
    this.initModels(this.topModelNames);

    for (const point of this.points) {
      const embList = this.embeddingsStore.get(point.id);
      if (!embList) continue;
      for (const emb of embList) {
        const model = this.modelsMap.get(emb.model_name);
        if (model && emb.embedding) {
          model.addPointRef(point, emb.embedding);
        }
      }
    }

    this.allModelsGen = this.processAllModels(this.models, this.maxDistancePx, 8);

    this.gn().catch(console.error);
  }

  private async gn() {
    if (!this.allModelsGen) return;
    while (this.allModelsGen) {
      let n = this.allModelsGen.next();
      if (n.done) break;
      this.mediator.progress = n.value.progress;
      await delay(1);
    }
  }

  private initModels(modelNames: string[]): void {
    this.models = modelNames.map((name) => {
      let model = new ModelData(name);
      this.modelsMap.set(name, model);
      return model;
    });
  }

  // ========== 4. Чистые функции для работы с моделями и векторами ==========

  @LogSync
  private computeCoverage(): Map<string, number> {
    const coverage = new Map<string, number>();
    for (const [, embList] of this.embeddingsStore) {
      for (const emb of embList) {
        const cnt = coverage.get(emb.model_name) ?? 0;
        coverage.set(emb.model_name, cnt + 1);
      }
    }
    return coverage;
  }

  @LogSync
  public groupModelsByName(models: PointModel[]): Map<string, PointModel[]> {
    return models.reduce((map, pm) => {
      const arr = map.get(pm.modelName) ?? [];
      arr.push(pm);
      map.set(pm.modelName, arr);
      return map;
    }, new Map<string, PointModel[]>());
  }

  @LogSync
  public filterByModel(models: PointModel[], model: string): PointModel[] {
    return models.filter((pm) => pm.modelName === model);
  }

  @LogSync
  public selectTopModels(topN: number): string[] {
    const entries = Array.from(this.coverage.entries());
    entries.sort((a, b) => b[1] - a[1]);
    return entries.slice(0, topN).map(([name]) => name);
  }

  getComputeCoverage() {
    if (this.coverage && this.coverage.size > 0) return this.coverage;
    let coverage = this.computeCoverage();
    this.coverage = coverage;
    return coverage;
  }

  public computeDisplacement(
    p1: Point,
    p2: Point,
    targetDist: number,
    strength: number,
  ): { newP1: { x: number; y: number }; newP2: { x: number; y: number } } {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const curDist = Math.hypot(dx, dy);
    if (curDist < 1e-5) return { newP1: { x: p1.x, y: p1.y }, newP2: { x: p2.x, y: p2.y } };
    const diff = Math.min(curDist - Math.pow(targetDist, 1.5), 0);
    const force = diff * strength;
    const moveX = (dx / curDist) * force;
    const moveY = (dy / curDist) * force;
    return {
      newP1: { x: p1.x - moveX, y: p1.y - moveY },
      newP2: { x: p2.x + moveX, y: p2.y + moveY },
    };
  }

  public applyDisplacement(pair: Pair): void {
    const { newP1, newP2 } = this.computeDisplacement(pair.p1.point, pair.p2.point, pair.targetDistancePx, this.forceStrength);
    this.smoothMove(pair.p1.point, newP1);
    this.smoothMove(pair.p2.point, newP2);
  }

  public smoothMove(point: Point, target: { x: number; y: number }): void {
    point.x = point.x * (1 - this.smoothingFactor) + target.x * this.smoothingFactor;
    point.y = point.y * (1 - this.smoothingFactor) + target.y * this.smoothingFactor;
  }

  // ========== 5. Анимационный цикл и авто-масштабирование ==========

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

  private *processAllModels(models: ModelData[], maxPx: number, maxTimeMs: number): Generator<{ progress: number; done: boolean }, void, unknown> {
    let totalPairs = 0;
    for (const m of models) {
      // Предварительный подсчёт общего количества пар (без косинусов)
      const n = m.pointModels.length;
      totalPairs += (n * (n - 1)) / 2;
    }
    let processedPairs_l = 0;
    for (const model of models) {
      const gen = model.processInSteps(maxPx, maxTimeMs);
      const modelTotalPairs = (model.pointModels.length * (model.pointModels.length - 1)) / 2;
      let result;
      do {
        result = gen.next();
        if (!result.done) {
          const modelProgress = result.value.progress;
          const modelProcessed = modelProgress * modelTotalPairs;
          let processedPairs = processedPairs_l + modelProcessed;
          const overall = processedPairs / totalPairs;
          yield { progress: overall, done: false };
        }
      } while (!result.done);
      processedPairs_l += modelTotalPairs;
    }

    this.pairs = models.flatMap((m) => m.pairs);
    yield { progress: 1, done: true };
  }

  public updateAnimation(): void {
    if (this.needsRepulsion) {
      this.processRepulsionStep();
      return;
    }

    if (this.stepAllModels()) return;

    if (this.needsEmbedding && this.pairs.length > 0) {
      this.processEmbeddingStep();
    }
  }

  private stepAllModels(): boolean {
    if (!this.allModelsGen) return false;
    const result = this.allModelsGen.next();
    if (!result.done) {
      // Обновляем общий прогресс в UI
      this.mediator.progress = result.value.progress;
    } else {
      // Все модели обработаны
      this.allModelsGen = null;
      this.needsRepulsion = true;
      this.needsEmbedding = false;
    }
    return true;
  }

  public updateRepulsionTemperature(maxShift: number): void {
    this.repulsionTemperature = maxShift / this.minDistancePx;
    this.mediator.temperature = this.repulsionTemperature * 100;
  }

  public processRepulsionStep(): void {
    const maxShift = this.applyOneRepulsionStep();
    this.renderPoints();
    if (this.autoZoomEnabled) this.fitZoomToPoints();
    this.updateRepulsionTemperature(maxShift);
    if (this.repulsionTemperature < this.temperatureThreshold) {
      this.finishRepulsion();
    }
  }

  public finishRepulsion(): void {
    this.needsRepulsion = false;
    this.needsEmbedding = true;
    // this.prepareEmbeddingPairs();
  }

  public processEmbeddingStep(): void {
    for (let i = 0; i < this.iterationsPerFrame; i++) {
      const idx = Math.floor(Math.random() * this.pairs.length);
      this.applyDisplacement(this.pairs[idx]);
    }
    this.renderPoints();
  }

  public applyOneRepulsionStep(): number {
    let maxShift = 0;
    for (let i = 0; i < this.points.length; i++) {
      for (let j = i + 1; j < this.points.length; j++) {
        const shift = this.applyRepulsionToPair(this.points[i], this.points[j]);
        if (shift > maxShift) maxShift = shift;
      }
    }
    return maxShift;
  }

  public applyRepulsionToPair(p1: Point, p2: Point): number {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const distSq = dx * dx + dy * dy;
    if (distSq >= this.minDistanceSq) return 0;
    const dist = Math.sqrt(distSq);
    const overlap = this.minDistancePx - dist;
    const force = overlap * this.repulsionStrength;
    let _ = this.mxy(dist, dx, dy, force);
    p1.x += _.moveX;
    p1.y += _.moveY;
    p2.x -= _.moveX;
    p2.y -= _.moveY;
    return Math.hypot(_.moveX, _.moveY);
  }

  mxy(dist: number, dx: number, dy: number, force: number) {
    if (dist < this.epsilon) {
      const angle = Math.random() * 2 * Math.PI;
      const r = this.minDistancePx / 2;
      const moveX = Math.cos(angle) * r;
      const moveY = Math.sin(angle) * r;
      return { moveX, moveY };
    }
    const moveX = (dx / dist) * force;
    const moveY = (dy / dist) * force;
    return { moveX, moveY };
  }

  public fitZoomToPoints(): void {
    if (!this.autoZoomEnabled || this.points.length === 0) return;
    const bounds = this.computeBoundingBox();
    if (bounds.width === 0 || bounds.height === 0) return;
    const newTransform = this.computeZoomTransform(bounds);
    this.applyZoomTransform(newTransform);
  }

  public computeBoundingBox(): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of this.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  public computeZoomTransform(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): d3.ZoomTransform {
    const padding = 50;
    const viewW = 800,
      viewH = 600;
    const scaleX = (viewW - padding * 2) / bounds.width;
    const scaleY = (viewH - padding * 2) / bounds.height;
    const scale = Math.min(scaleX, scaleY);
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    return d3.zoomIdentity
      .translate(viewW / 2, viewH / 2)
      .scale(scale)
      .translate(-centerX, -centerY);
  }

  public applyZoomTransform(newTransform: d3.ZoomTransform): void {
    this.svg
      .transition()
      .duration(300)
      .call(d3.zoom().transform as any, newTransform);
    this.transform = newTransform;
    this.updatePointsStyle();
  }

  // ========== 6. Рендеринг точек и групп ==========

  public renderPoints(): void {
    const groups = this.container.selectAll<SVGGElement, Point>("g.point-group").data(this.points, (d) => d.id);
    groups.exit().remove();
    const enter = this.createGroups(groups);
    this.updateGroups(enter, groups);
    this.saveGroupReferences(groups, enter);
    this.updatePointsStyle();
  }

  public saveGroupReferences(
    groups: d3.Selection<SVGGElement, Point, SVGGElement, unknown>,
    enter: d3.Selection<SVGGElement, Point, SVGGElement, unknown>,
  ): void {
    const merged = enter.merge(groups);
    merged.each(function (d) {
      d.groupElement = this;
    });
  }

  public createGroups(groups: d3.Selection<SVGGElement, Point, SVGGElement, unknown>): d3.Selection<SVGGElement, Point, SVGGElement, unknown> {
    const enter = groups
      .enter()
      .append("g")
      .attr("class", "point-group")
      .attr("transform", (d) => `translate(${d.x},${d.y})`);
    this.appendCircle(enter);
    this.appendText(enter);
    return enter;
  }

  public appendCircle(enter: d3.Selection<SVGGElement, Point, SVGGElement, unknown>): void {
    enter
      .append("circle")
      .attr("class", "point")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", 15)
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .attr("fill", "#3b82f6");
  }

  public appendText(enter: d3.Selection<SVGGElement, Point, SVGGElement, unknown>): void {
    enter
      .append("text")
      .attr("class", "point-label")
      .attr("x", (d) => d.labelOffset?.dx ?? 8)
      .attr("y", (d) => d.labelOffset?.dy ?? 4)
      .attr("dy", "0.35em")
      .style("font-size", "12px")
      .style("fill", "#fff")
      .text((d) => d.text);
  }

  public updateGroups(
    enter: d3.Selection<SVGGElement, Point, SVGGElement, unknown>,
    groups: d3.Selection<SVGGElement, Point, SVGGElement, unknown>,
  ): void {
    const merged = enter.merge(groups);
    merged.attr("transform", (d) => `translate(${d.x},${d.y})`);
    merged.select("text.point-label").text((d) => d.text);
  }

  public updatePointsStyle(): void {
    if (!this.transform) return;
    this.container.attr("transform", this.transform.toString());
    const scaleInv = 1 / this.transform.k;
    this.updateCircleStyle(scaleInv);
    this.updateTextStyle(scaleInv);
  }

  public updateCircleStyle(scaleInv: number): void {
    this.container
      .selectAll<SVGCircleElement, any>("circle.point")
      .attr("r", 6 * scaleInv)
      .attr("stroke-width", 2 * scaleInv);
  }

  public updateTextStyle(scaleInv: number): void {
    this.container
      .selectAll<SVGTextElement, any>("text.point-label")
      .style("font-size", `${12 * scaleInv}px`)
      .attr("x", (d) => (d.labelOffset?.dx ?? 12) * scaleInv)
      .attr("y", (d) => (d.labelOffset?.dy ?? 4) * scaleInv);
  }

  // ========== 7. Публичные методы ==========

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

  public addPoint(customText?: string, side: "right" | "left" | "top" | "bottom" = "right"): void {
    const offset = this.getOffsetBySide(side);
    const newPoint = new Point(`p-${Date.now()}`, customText || "", Math.random() * 800, Math.random() * 600, offset);
    this.points.push(newPoint);
    this.renderPoints();
    this.updateModelStats();
    this.needsRepulsion = true;
    this.needsEmbedding = false;
  }

  public clearPoints(): void {
    this.points = [];
    this.coverage.clear();
    this.modelMaxCosine.clear();
    this.renderPoints();
    this.needsRepulsion = false;
    this.needsEmbedding = false;
    this.pairs = [];
  }

  public getOffsetBySide(side: string): { dx: number; dy: number } {
    const map = { right: { dx: 8, dy: 4 }, left: { dx: -8, dy: 4 }, top: { dx: 0, dy: -12 }, bottom: { dx: 0, dy: 16 } };
    return map[side as keyof typeof map] ?? map.right;
  }
}
