import * as d3 from "d3";
import { ZoomTransform } from "d3";

export interface PointData {
  _groupElement?: SVGGElement;
  id: string;
  x: number;
  y: number;
  text: string; // текст, загруженный с сервера
  labelOffset?: { dx: number; dy: number }; // смещение текста относительно точки
  embedding?: Embedding[];
}

export interface PointWithVector {
  point: PointData; // ссылка на оригинальную точку
  vector: number[]; // вектор эмбеддинга
  modelName: string; // имя модели, к которой относится вектор
}

export interface CachedPair {
  p1: PointWithVector;
  p2: PointWithVector;
  cosineDist: number; // предвычисленное косинусное расстояние
  desiredDist: number; // желаемое расстояние в пикселях (зависит от maxDistancePx и maxCosineDist)
}

export interface ChatSession {
  id: string;
  title: string;
  title_type: string;
  pinned: boolean;
  updated_at: number; // timestamp в секундах, может быть дробным
}

export interface Embedding {
  sessionId: string;
  model_name: string;
  createdAt: Date;
  dimension: number;
  processing_time_ms: number;
  embedding: number[] | null;
}

export class CanvasEngine {
  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private container!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private points: PointData[] = [];
  transform: ZoomTransform;
  dragBehavior: d3.DragBehavior<SVGCircleElement, PointData, PointData | d3.SubjectPosition>;
  
  private activePoints: PointWithVector[] = [];
  private pairs: CachedPair[] = [];
  private animationFrameId: number | null = null;

  constructor(private element: HTMLElement) {
    this.transform = d3.zoomIdentity;
    this.dragBehavior = d3.drag<SVGCircleElement, PointData>().on("start", this.onDragStart.bind(this)).on("drag", this.onDrag.bind(this));
    this.initSvg();
    this.initZoom();
    this.addInitialPoints().catch((e) => console.error(e));
  }

  // ==================== Инициализация SVG и зумирования ====================
  private initSvg() {
    this.svg = d3.select(this.element).append("svg").attr("width", "100%").attr("height", "100%").attr("viewBox", "0 0 800 600");

    this.container = this.svg.append("g");
  }

  private initZoom() {
    const zoom = d3.zoom<SVGSVGElement, unknown>().on("zoom", (event) => {
      this.transform = event.transform;
      this.updatePointsStyle();
    });
    this.svg.call(zoom);
  }

  private onDragStart(event: d3.D3DragEvent<SVGCircleElement, PointData, any>, d: PointData) {
    // Сохраняем ссылку на родительскую группу в самом объекте данных
    const circle = event.sourceEvent.target as SVGCircleElement;
    const group = circle.parentNode as SVGGElement;
    d._groupElement = group;
  }

  private onDrag(event: d3.D3DragEvent<SVGCircleElement, PointData, any>, d: PointData) {
    event.sourceEvent.stopPropagation();
    if (!this.transform) return;

    const [mx, my] = d3.pointer(event.sourceEvent, this.svg.node()!);
    const [invX, invY] = this.transform.invert([mx, my]);

    d.x = invX;
    d.y = invY;

    // Перемещаем сохранённую группу (даже если курсор ушёл с кружка)
    if (d._groupElement) {
      d3.select(d._groupElement).attr("transform", `translate(${d.x},${d.y})`);
    } else {
      // fallback: ищем группу по id
      const group = this.container
        .select(`g.point-group`)
        .filter((g) => (g as any).id === d.id)
        .node();
      if (group) d3.select(group).attr("transform", `translate(${d.x},${d.y})`);
    }

    // Обновляем массив
    const point = this.points.find((p) => p.id === d.id);
    if (point) {
      point.x = d.x;
      point.y = d.y;
    }
  }

  // ==================== Выбор модели с максимальным покрытием ====================
  private selectBestModel(): string | null {
    const coverage = new Map<string, number>(); // model_name -> количество точек с embedding !== null

    for (const point of this.points) {
      if (!point.embedding) continue;
      for (const emb of point.embedding) {
        if (emb.embedding && emb.embedding.length > 0) {
          coverage.set(emb.model_name, (coverage.get(emb.model_name) || 0) + 1);
        }
      }
    }

    let bestModel: string | null = null;
    let maxCount = 0;
    for (const [model, count] of coverage.entries()) {
      if (count > maxCount) {
        maxCount = count;
        bestModel = model;
      }
    }
    console.log(`Выбрана модель "${bestModel}" с покрытием ${maxCount} из ${this.points.length} точек`);
    return bestModel;
  }

  // ==================== Косинусное расстояние между двумя векторами ====================
  private cosineDistance(vecA: number[], vecB: number[]): number {
    let dot = 0,
      magA = 0,
      magB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dot += vecA[i] * vecB[i];
      magA += vecA[i] * vecA[i];
      magB += vecB[i] * vecB[i];
    }
    if (magA === 0 || magB === 0) return 1.0; // максимальное расстояние
    const cos = dot / (Math.sqrt(magA) * Math.sqrt(magB));
    // Косинусное расстояние = 1 - cos, диапазон [0, 2]
    return 1 - cos;
  }

  // ==================== Force Layout ====================
  public async applyForceLayout(
    iterations: number = 100,
    maxDistancePx: number = 500,
    forceStrength: number = 0.05,
    animationDelayMs: number = 16, // ~60 fps, если нужно анимировать
  ) {
    const model = this.selectBestModel();
    if (!model) {
      console.warn("Нет модели с эмбеддингами, force layout отменён");
      return;
    }

    // Собираем векторы только для точек, у которых есть эмбеддинг выбранной модели
    const pointsWithVec: { point: PointData; vec: number[] }[] = [];
    for (const point of this.points) {
      const embObj = point.embedding?.find((e) => e.model_name === model && e.embedding && e.embedding.length > 0);
      if (embObj && embObj.embedding) {
        pointsWithVec.push({ point, vec: embObj.embedding });
      } else {
        // Точка без эмбеддинга – не будет участвовать в силах (останется на месте)
        console.log(`Точка ${point.id} не имеет эмбеддинга модели ${model}, будет зафиксирована`);
      }
    }

    if (pointsWithVec.length < 2) {
      console.warn("Недостаточно точек с эмбеддингами для force layout");
      return;
    }

    // Предварительный расчёт максимального косинусного расстояния среди всех пар
    let maxCosineDist = 0;
    const n = pointsWithVec.length;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dist = this.cosineDistance(pointsWithVec[i].vec, pointsWithVec[j].vec);
        if (dist > maxCosineDist) maxCosineDist = dist;
      }
    }
    if (maxCosineDist === 0) maxCosineDist = 1; // fallback

    // Функция для получения желаемого расстояния между двумя точками
    const desiredDistance = (cosineDist: number): number => {
      return (cosineDist / maxCosineDist) * maxDistancePx;
    };

    // Итеративный процесс
    for (let iter = 0; iter < iterations; iter++) {
      // Обновляем силы для всех пар
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const p1 = pointsWithVec[i].point;
          const p2 = pointsWithVec[j].point;
          const vec1 = pointsWithVec[i].vec;
          const vec2 = pointsWithVec[j].vec;

          const cosineDist = this.cosineDistance(vec1, vec2);
          const targetDist = desiredDistance(cosineDist);

          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const currentDist = Math.hypot(dx, dy);
          if (currentDist < 1e-5) continue;

          const diff = currentDist - targetDist;
          const force = diff * forceStrength;

          const moveX = (dx / currentDist) * force;
          const moveY = (dy / currentDist) * force;

          // Перемещаем обе точки
          p1.x -= moveX;
          p1.y -= moveY;
          p2.x += moveX;
          p2.y += moveY;
        }
      }

      // Небольшая коррекция границ: удерживаем точки в пределах viewBox
      for (const item of pointsWithVec) {
        const p = item.point;
        p.x = Math.min(Math.max(p.x, 20), 780);
        p.y = Math.min(Math.max(p.y, 20), 580);
      }

      // Обновляем рендер с анимацией (если задержка > 0)
      if (animationDelayMs > 0 && (iter % 3 === 0 || iter === iterations - 1)) {
        this.renderPoints(); // перерисовка позиций
        await new Promise((resolve) => setTimeout(resolve, animationDelayMs));
      }
    }

    // Финальный рендер
    this.renderPoints();
    console.log("Force layout завершён");
  }

  private applyDragToGroups() {
    this.container.selectAll<SVGCircleElement, PointData>("g.point-group circle.point").call(this.dragBehavior);
  }
  private async addInitialPoints() {
    this.points.push(...(await this.fetchTextForPoint()));
    this.renderPoints();
    this.GetEmbeddings().catch((e) => console.error(e));
  }

  // ==================== Работа с текстом через fetch ====================
  private async fetchTextForPoint(): Promise<PointData[]> {
    try {
      // Предполагается, что сервер возвращает { text: "какой-то текст" }
      // Используется прокси Vite на /api (см. vite.config.ts)
      const response = await fetch(`http://localhost:5173/api/documents`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as ChatSession[];
      let points = data.map(
        (a) =>
          ({
            text: a.title,
            id: a.id,
            x: Math.random() * 800,
            y: Math.random() * 600,
            // labelOffset: { dx: 1, dy: 1 }, // справа
          }) as PointData,
      );

      return points;
    } catch (error) {}
    return [];
  }
  // ==================== Создание точек ====================

  async GetEmbeddings() {
    await Promise.all(this.points.map((p) => this.Pointx(p)));
  }

  private async Pointx_1(p: PointData) {
    let id = p.id;
    const resp = await fetch(`http://localhost:5173/api/embeddings/${id}`);
    const data = (await resp.json()) as Embedding[];
    p.embedding = data;
  }

  private Pointx(p: PointData) {
    return this.Pointx_1(p);
  }

  // ==================== Рендеринг точек с группами ====================
  private renderPoints() {
    const groups = this.container.selectAll<SVGGElement, PointData>("g.point-group").data(this.points, (d: PointData) => d.id);

    // Удаляем лишние группы
    groups.exit().remove();

    // Создаём новые группы
    const groupsEnter = groups
      .enter()
      .append("g")
      .attr("class", "point-group")
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    // Добавляем круг в каждую новую группу
    groupsEnter
      .append("circle")
      .attr("class", "point")
      .attr("cx", 0)
      .attr("cy", 0)
      .attr("r", 15)
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .attr("fill", "#3b82f6");

    // Добавляем текст в каждую новую группу
    groupsEnter
      .append("text")
      .attr("class", "point-label")
      // Настройка положения текста относительно точки (dx, dy)
      // .attr("dx", (d) => d.labelOffset?.dx ?? 8)
      // .attr("dy", (d) => d.labelOffset?.dy ?? 4)
      .attr("x", (d) => d.labelOffset?.dx ?? 8)
      .attr("y", (d) => d.labelOffset?.dy ?? 4)
      .attr("dy", "0.35em") // вертикальное выравнивание
      .style("font-size", "12px")
      .style("fill", "#ffffff")
      .style("stroke", "none")
      .text((d) => d.text || "");

    // Объединяем новые и существующие группы (обновляем transform и текст)
    const allGroups = groupsEnter.merge(groups);

    // Обновляем transform у всех групп (если координаты изменились)
    allGroups.attr("transform", (d) => `translate(${d.x},${d.y})`);

    // Обновляем текст (в случае, если он поменялся без пересоздания группы)
    allGroups.select("text.point-label").text((d) => d.text || "");

    // Применяем поведение drag ко всем группам
    this.applyDragToGroups();

    // Применяем стили (размер круга, шрифта) с учётом текущего зума
    this.updatePointsStyle();
  }

  // Обновление стилей при зумировании (уменьшаем круг и текст)
  private updatePointsStyle() {
    if (!this.transform) return;
    this.container.attr("transform", this.transform.toString());

    const scale = this.transform.k;
    const s = 1 / scale;
    this.container
      .selectAll<SVGCircleElement, any>("circle.point")
      .attr("r", 6 * s)
      .attr("stroke-width", 2 * s);

    this.container
      .selectAll<SVGTextElement, any>("text.point-label")
      .style("font-size", `${12 * s}px`)
      .attr("x", (d) => (d.labelOffset?.dx ?? 12) * s)
      .attr("y", (d) => (d.labelOffset?.dy ?? 4) * s);
  }

  public addPoint(customText?: string, side: "right" | "left" | "top" | "bottom" = "right") {
    let dx = 8,
      dy = 4;
    switch (side) {
      case "left":
        dx = -8;
        dy = 4;
        break;
      case "top":
        dx = 0;
        dy = -12;
        break;
      case "bottom":
        dx = 0;
        dy = 16;
        break;
      default:
        dx = 8;
        dy = 4;
    }

    const newPoint: PointData = {
      id: `p-${Date.now()}`,
      x: Math.random() * 800,
      y: Math.random() * 600,
      text: customText || "",
      labelOffset: { dx, dy },
    };
    this.points.push(newPoint);
    this.renderPoints();

    // // Если текст не был передан через customText, загружаем с сервера
    // if (!customText) {
    //   this.fetchTextForPoint(newPoint.id);
    // }
  }

  public clearPoints() {
    this.points = [];
    this.renderPoints();
  }

  // Опционально: публичный метод для принудительной перезагрузки текста для всех точек
  public reloadAllTexts() {
    // this.points.forEach((point) => this.fetchTextForPoint(point.id));
  }
}
