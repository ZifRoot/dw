import * as d3 from "d3";
import { ZoomTransform } from "d3";

export interface PointData {
  _groupElement?: SVGGElement;
  id: string;
  x: number;
  y: number;
  text: string; // текст, загруженный с сервера
  labelOffset?: { dx: number; dy: number }; // смещение текста относительно точки
}

export interface ChatSession {
  id: string;
  title: string;
  title_type: string;
  pinned: boolean;
  updated_at: number; // timestamp в секундах, может быть дробным
}

export class CanvasEngine {
  private svg!: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  private container!: d3.Selection<SVGGElement, unknown, null, undefined>;
  private points: PointData[] = [];
  transform: ZoomTransform;

  // Поведение перетаскивания для групп
  // ==================== Drag & Drop ====================
  private dragBehavior = d3.drag<SVGCircleElement, PointData>().on("start", this.onDragStart.bind(this)).on("drag", this.onDrag.bind(this));

  constructor(private element: HTMLElement) {
    this.initSvg();
    this.initZoom();
    // Инициализируем трансформацию единичной матрицей
    this.transform = d3.zoomIdentity;
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

  private applyDragToGroups() {
    this.container.selectAll<SVGCircleElement, PointData>("g.point-group circle.point").call(this.dragBehavior);
  }

  // ==================== Работа с текстом через fetch ====================
  private async fetchTextForPoint(): Promise<PointData[]> {
    try {
      // Предполагается, что сервер возвращает { text: "какой-то текст" }
      // Используется прокси Vite на /api (см. vite.config.ts)
      const response = await fetch(`http://localhost:5173/api/documents`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as ChatSession[];
      let dd = data.map(
        (a) =>
          ({
            text: a.title,
            id: a.id,

            x: Math.random() * 800,
            y: Math.random() * 600,

            // labelOffset: { dx: 1, dy: 1 }, // справа
          }) as PointData,
      );

      return dd;
    } catch (error) {}
    return [];
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

  // ==================== Создание точек ====================
  private async addInitialPoints() {
    this.points.push(...(await this.fetchTextForPoint()));
    this.renderPoints();

    // После рендера загружаем текст для всех начальных точек
    // this.points.forEach((point) => {
    //   this.fetchTextForPoint(point.id);
    // });
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
