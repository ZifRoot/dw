import * as d3 from "d3";
import { ZoomTransform } from "d3";
import { accurateSum } from "../utils/data-utils";
import { Throttler } from "../utils/throttler";
import { AppMediator } from "./AppMediator";

// =============================== Внутренние классы ===============================

/// <summary>Точка на холсте (документ/чат).</summary>
export class Point {
  public _groupElement?: SVGGElement;

  public id: string;
  public x: number;
  public y: number;
  public text: string;
  public labelOffset?: { dx: number; dy: number };
  public embedding?: Embedding[];

  constructor(id: string, text: string, x: number, y: number, labelOffset?: { dx: number; dy: number }) {
    this.id = id;
    this.text = text;
    this.x = x;
    this.y = y;
    this.labelOffset = labelOffset;
  }
  public get groupElement(): SVGGElement {
    return this._groupElement!;
  }
  public set groupElement(value: SVGGElement) {
    this._groupElement = value;
  }
}

/// <summary>Обёртка точки + вектор для конкретной модели.</summary>
class PointModel {
  constructor(
    public pointId: string,
    public modelName: string,
    public vector: number[],
    public pointRef: Point,
  ) {}
}

/// <summary>Пара точек с информацией о модели и расстояниях.</summary>
class Pair {
  constructor(
    public p1: PointModel,
    public p2: PointModel,
    public modelName: string,
    public cosineDist: number,
    public targetDistancePx: number,
  ) {}
}

// =============================== DTO (интерфейсы с сервера) ===============================

/// <summary>Сессия чата (ответ от API /documents).</summary>
export interface ChatSession {
  id: string;
  title: string;
  title_type: string;
  pinned: boolean;
  updated_at: number;
}

/// <summary>Эмбеддинг точки от конкретной модели.</summary>
export interface Embedding {
  sessionId: string;
  model_name: string;
  createdAt: Date;
  dimension: number;
  processing_time_ms: number;
  embedding: number[] | null;
}

// =============================== CanvasEngine ===============================

export class CanvasEngine {
  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private container!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private points: Point[] = [];
  public transform: ZoomTransform;

  private draggedPoint: Point | null = null;
  private isDragging = false;
  private animationFrameId: number | null = null;

  // Флаги состояния анимации
  private needsRepulsion = true;
  private needsEmbedding = false;
  private repulsionStrength = 0.5;
  private minDistancePx = 10;
  private minDistanceSq = this.minDistancePx * this.minDistancePx;

  private pairs: Pair[] = [];
  private forceStrength = 0.05;
  private maxDistancePx = 500;
  private iterationsPerFrame = 5;
  private smoothingFactor = 0.3;
  private autoZoomEnabled = false;

  private coverage: Map<string, number> = new Map();
  private modelMaxCosine: Map<string, number> = new Map();
  epsilon: number = 1e-6;
  temperatureThreshold = 0.1;
  repulsionTemperature: number = 0;
  throttler: Throttler;

  constructor(
    private element: HTMLElement,
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

  private initSvg(): void {
    this.svg = d3.select(this.element).append("svg").attr("width", "100%").attr("height", "100%").attr("viewBox", "0 0 800 600");
    this.container = this.svg.append("g");
  }

  private initZoom(): void {
    const zoom = d3.zoom<SVGSVGElement, unknown>().on("zoom", (event) => {
      if (this.isDragging) return;
      this.transform = event.transform;
      this.updatePointsStyle();
    });
    this.svg.call(zoom);
  }

  private initGlobalDrag(): void {
    const drag = d3
      .drag<SVGSVGElement, unknown>()
      .on("start", this.onDragStartGlobal.bind(this))
      .on("drag", this.onDragGlobal.bind(this))
      .on("end", this.onDragEndGlobal.bind(this));
    this.svg.call(drag);
  }

  // ========== 2. Drag & Drop ==========

  private findPointUnderCursor(event: any): Point | null {
    let target = event.sourceEvent.target as HTMLElement;
    while (target && target !== (this.svg.node() as any as HTMLElement) && target.tagName !== "circle") {
      target = target.parentNode as HTMLElement;
    }
    if (!target || target.tagName !== "circle") return null;
    const group = target.parentNode as SVGGElement;
    return d3.select(group).datum() as Point | null;
  }

  private onDragStartGlobal(event: d3.D3DragEvent<SVGSVGElement, unknown, any>): void {
    if (this.draggedPoint) return;
    const point = this.findPointUnderCursor(event);
    if (!point) return;
    this.draggedPoint = point;
    this.isDragging = true;
    event.sourceEvent.stopPropagation();
    event.sourceEvent.preventDefault();
  }

  private onDragGlobal(event: d3.D3DragEvent<SVGSVGElement, unknown, any>): void {
    if (!this.draggedPoint || !this.transform) return;
    const svgNode = this.svg.node();
    if (!svgNode) return;
    const [mx, my] = d3.pointer(event.sourceEvent, svgNode);
    const [invX, invY] = this.transform.invert([mx, my]);
    this.updateDraggedPoint(invX, invY);
    event.sourceEvent.stopPropagation();
    event.sourceEvent.preventDefault();
  }

  private updateDraggedPoint(x: number, y: number): void {
    if (!this.draggedPoint) return;
    this.draggedPoint.x = x;
    this.draggedPoint.y = y;
    const group = this.draggedPoint.groupElement;
    if (group) {
      d3.select(group).attr("transform", `translate(${x},${y})`);
    }
  }

  private onDragEndGlobal(event: d3.D3DragEvent<SVGSVGElement, unknown, any>): void {
    if (this.draggedPoint) {
      this.draggedPoint = null;
      this.isDragging = false;
      event.sourceEvent.stopPropagation();
      this.needsRepulsion = true;
      this.needsEmbedding = false;
    }
  }

  // ========== 3. Загрузка данных ==========

  private async addInitialPoints(): Promise<void> {
    this.points.push(...(await this.fetchDocuments()));
    this.needsRepulsion = true;
    this.renderPoints();
    //  await this.loadEmbeddings();
  }

  private async fetchDocuments(): Promise<Point[]> {
    const response = await fetch(`/api/documents`);
    if (!response.ok) return [];
    const data = (await response.json()) as ChatSession[];
    return data.map((session) => this.createPointFromSession(session));
  }

  private createPointFromSession(session: ChatSession): Point {
    return new Point(session.id, session.title, 300, 300, this.getOffsetBySide("right"));
  }

  private async loadEmbeddings(): Promise<void> {
    await Promise.all(this.points.map((p) => this.fetchEmbeddingForPoint(p)));
    this.updateModelStats();
    this.needsRepulsion = true;
    this.needsEmbedding = false;
  }

  private async fetchEmbeddingForPoint7throttle(point: Point): Promise<void> {
    return this.throttler.throttle(() => this.fetchEmbeddingForPoint(point));
  }

  private async fetchEmbeddingForPoint(point: Point): Promise<void> {
    const resp = await fetch(`/api/embeddings/${point.id}`);
    const data = (await resp.json()) as Embedding[];
    point.embedding = data;
  }

  private updateModelStats(): void {
    const allModels = this.generateAllPointModels();
    this.coverage = this.computeCoverage(allModels);
    this.modelMaxCosine = this.computeMaxCosineForModels(allModels);
  }

  // ========== 4. Чистые функции для работы с моделями и векторами ==========

  private generateAllPointModels(): PointModel[] {
    return this.points.flatMap((point) =>
      (point.embedding ?? [])
        .filter((emb) => emb.embedding && emb.embedding.length > 0)
        .map((emb) => new PointModel(point.id, emb.model_name, emb.embedding!, point)),
    );
  }

  private computeCoverage(models: PointModel[]): Map<string, number> {
    const perModel = models.reduce((acc, pm) => {
      const set = acc.get(pm.modelName) ?? new Set<string>();
      set.add(pm.pointId);
      acc.set(pm.modelName, set);
      return acc;
    }, new Map<string, Set<string>>());
    return new Map(Array.from(perModel.entries()).map(([m, s]) => [m, s.size]));
  }

  private computeMaxCosineForModels(allModels: PointModel[]): Map<string, number> {
    const modelsByName = this.groupModelsByName(allModels);
    const result = new Map<string, number>();
    for (const [name, models] of modelsByName.entries()) {
      const maxCos = this.computeMaxCosineForModel(models);
      result.set(name, maxCos);
    }
    return result;
  }

  private computeMaxCosineForModel(models: PointModel[]): number {
    if (models.length < 2) return 1;
    return this.findMaxCosineInModels(models);
  }

  private groupModelsByName(models: PointModel[]): Map<string, PointModel[]> {
    return models.reduce((map, pm) => {
      const arr = map.get(pm.modelName) ?? [];
      arr.push(pm);
      map.set(pm.modelName, arr);
      return map;
    }, new Map<string, PointModel[]>());
  }

  private findMaxCosineInModels(models: PointModel[]): number {
    let maxCos = 0;
    for (let i = 0; i < models.length; i++) {
      for (let j = i + 1; j < models.length; j++) {
        const cos = this.cosineDistance(models[i].vector, models[j].vector);
        if (cos > maxCos) maxCos = cos;
      }
    }
    return maxCos || 1;
  }

  private filterByModel(models: PointModel[], model: string): PointModel[] {
    return models.filter((pm) => pm.modelName === model);
  }

  private cosineDistance(vecA: number[], vecB: number[]): number {
    const dot = accurateSum(vecA.map((v, i) => v * vecB[i]));
    const magA = accurateSum(vecA.map((v) => v * v));
    const magB = accurateSum(vecB.map((v) => v * v));
    const mag = Math.sqrt(magA) * Math.sqrt(magB);
    return mag === 0 ? 1 : 1 - dot / mag;
  }

  private buildPairsForModel(models: PointModel[], modelName: string, maxPx: number, weight: number): Pair[] {
    const maxCosine = this.modelMaxCosine.get(modelName) ?? 1;
    const pairsWithCos = this.generatePairsWithCosine(models);
    return pairsWithCos.map((p) => new Pair(p.p1, p.p2, modelName, p.cosDist, (p.cosDist / maxCosine) * maxPx * weight));
  }

  private generatePairsWithCosine(models: PointModel[]): { p1: PointModel; p2: PointModel; cosDist: number }[] {
    const n = models.length;
    const pairs = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        pairs.push({
          p1: models[i],
          p2: models[j],
          cosDist: this.cosineDistance(models[i].vector, models[j].vector),
        });
      }
    }
    return pairs;
  }

  private selectTopModels(topN: number): { modelName: string; weight: number }[] {
    const entries = Array.from(this.coverage.entries());
    entries.sort((a, b) => b[1] - a[1]);
    return entries.slice(0, topN).map(([name]) => ({ modelName: name, weight: 1 }));
  }

  private preparePairs(topN: number): Pair[] | null {
    const allModels = this.generateAllPointModels();
    if (allModels.length === 0) return null;
    const topModels = this.selectTopModels(topN);
    let allPairs: Pair[] = [];
    for (const { modelName, weight } of topModels) {
      const filtered = this.filterByModel(allModels, modelName);
      if (filtered.length < 2) continue;
      const pairs = this.buildPairsForModel(filtered, modelName, this.maxDistancePx, weight);
      allPairs.push(...pairs);
    }
    return allPairs.length > 0 ? allPairs : null;
  }

  private computeDisplacement(
    p1: Point,
    p2: Point,
    targetDist: number,
    strength: number,
  ): { newP1: { x: number; y: number }; newP2: { x: number; y: number } } {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const curDist = Math.hypot(dx, dy);
    if (curDist < 1e-5) return { newP1: { x: p1.x, y: p1.y }, newP2: { x: p2.x, y: p2.y } };
    const diff = curDist - targetDist;
    const force = diff * strength;
    const moveX = (dx / curDist) * force;
    const moveY = (dy / curDist) * force;
    return {
      newP1: { x: p1.x - moveX, y: p1.y - moveY },
      newP2: { x: p2.x + moveX, y: p2.y + moveY },
    };
  }

  private applyDisplacement(pair: Pair): void {
    const { newP1, newP2 } = this.computeDisplacement(pair.p1.pointRef, pair.p2.pointRef, pair.targetDistancePx, this.forceStrength);
    this.smoothMove(pair.p1.pointRef, newP1);
    this.smoothMove(pair.p2.pointRef, newP2);
  }

  private smoothMove(point: Point, target: { x: number; y: number }): void {
    point.x = point.x * (1 - this.smoothingFactor) + target.x * this.smoothingFactor;
    point.y = point.y * (1 - this.smoothingFactor) + target.y * this.smoothingFactor;
  }

  // ========== 5. Анимационный цикл и авто-масштабирование ==========

  private startAnimationLoop(): void {
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
      this.processRepulsionStep();
      return;
    }
    if (this.needsEmbedding && this.pairs.length > 0) {
      this.processEmbeddingStep();
    }
  }

  private updateRepulsionTemperature(maxShift: number): void {
    this.repulsionTemperature = maxShift / this.minDistancePx;
    this.mediator.temperature = this.repulsionTemperature * 100;
  }

  private processRepulsionStep(): void {
    const maxShift = this.applyOneRepulsionStep();
    this.renderPoints();
    if (this.autoZoomEnabled) this.fitZoomToPoints();
    this.updateRepulsionTemperature(maxShift);
    if (this.repulsionTemperature < this.temperatureThreshold) {
      this.finishRepulsion();
    }
  }

  private finishRepulsion(): void {
    this.needsRepulsion = false;
    this.needsEmbedding = true;
    this.prepareEmbeddingPairs();
  }

  private processEmbeddingStep(): void {
    for (let i = 0; i < this.iterationsPerFrame; i++) {
      const idx = Math.floor(Math.random() * this.pairs.length);
      this.applyDisplacement(this.pairs[idx]);
    }
    this.renderPoints();
  }

  private applyOneRepulsionStep(): number {
    let maxShift = 0;
    for (let i = 0; i < this.points.length; i++) {
      for (let j = i + 1; j < this.points.length; j++) {
        const shift = this.applyRepulsionToPair(this.points[i], this.points[j]);
        if (shift > maxShift) maxShift = shift;
      }
    }
    return maxShift;
  }

  private applyRepulsionToPair(p1: Point, p2: Point): number {
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

  private fitZoomToPoints(): void {
    if (!this.autoZoomEnabled || this.points.length === 0) return;
    const bounds = this.computeBoundingBox();
    if (bounds.width === 0 || bounds.height === 0) return;
    const newTransform = this.computeZoomTransform(bounds);
    this.applyZoomTransform(newTransform);
  }

  private computeBoundingBox(): { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number } {
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

  private computeZoomTransform(bounds: { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number }): d3.ZoomTransform {
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

  private applyZoomTransform(newTransform: d3.ZoomTransform): void {
    this.svg
      .transition()
      .duration(300)
      .call(d3.zoom().transform as any, newTransform);
    this.transform = newTransform;
    this.updatePointsStyle();
  }

  private prepareEmbeddingPairs(): void {
    const modelPairs = this.preparePairs(3);
    this.pairs = modelPairs ?? [];
  }

  // ========== 6. Рендеринг точек и групп ==========

  private renderPoints(): void {
    const groups = this.container.selectAll<SVGGElement, Point>("g.point-group").data(this.points, (d) => d.id);
    groups.exit().remove();
    const enter = this.createGroups(groups);
    this.updateGroups(enter, groups);
    this.saveGroupReferences(groups, enter);
    this.updatePointsStyle();
  }

  private saveGroupReferences(
    groups: d3.Selection<SVGGElement, Point, SVGGElement, unknown>,
    enter: d3.Selection<SVGGElement, Point, SVGGElement, unknown>,
  ): void {
    const merged = enter.merge(groups);
    merged.each(function (d) {
      d.groupElement = this;
    });
  }

  private createGroups(groups: d3.Selection<SVGGElement, Point, SVGGElement, unknown>): d3.Selection<SVGGElement, Point, SVGGElement, unknown> {
    const enter = groups
      .enter()
      .append("g")
      .attr("class", "point-group")
      .attr("transform", (d) => `translate(${d.x},${d.y})`);
    this.appendCircle(enter);
    this.appendText(enter);
    return enter;
  }

  private appendCircle(enter: d3.Selection<SVGGElement, Point, SVGGElement, unknown>): void {
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

  private appendText(enter: d3.Selection<SVGGElement, Point, SVGGElement, unknown>): void {
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

  private updateGroups(
    enter: d3.Selection<SVGGElement, Point, SVGGElement, unknown>,
    groups: d3.Selection<SVGGElement, Point, SVGGElement, unknown>,
  ): void {
    const merged = enter.merge(groups);
    merged.attr("transform", (d) => `translate(${d.x},${d.y})`);
    merged.select("text.point-label").text((d) => d.text);
  }

  private updatePointsStyle(): void {
    if (!this.transform) return;
    this.container.attr("transform", this.transform.toString());
    const scaleInv = 1 / this.transform.k;
    this.updateCircleStyle(scaleInv);
    this.updateTextStyle(scaleInv);
  }

  private updateCircleStyle(scaleInv: number): void {
    this.container
      .selectAll<SVGCircleElement, any>("circle.point")
      .attr("r", 6 * scaleInv)
      .attr("stroke-width", 2 * scaleInv);
  }

  private updateTextStyle(scaleInv: number): void {
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

  private getOffsetBySide(side: string): { dx: number; dy: number } {
    const map = { right: { dx: 8, dy: 4 }, left: { dx: -8, dy: 4 }, top: { dx: 0, dy: -12 }, bottom: { dx: 0, dy: 16 } };
    return map[side as keyof typeof map] ?? map.right;
  }
}
