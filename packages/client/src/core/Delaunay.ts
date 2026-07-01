// types.ts
export interface Point {
  x: number;
  y: number;
}

export interface EdgeIndex {
  sourceIndex: number;
  targetIndex: number;
}

export class Delaunay {
  /**
   * Главный метод: принимает массив точек, возвращает уникальные рёбра.
   */
  public static triangulate(points: Point[]): EdgeIndex[] {
    if (points.length < 3) return [];

    // 1. Подготовка копии и супер-треугольника
    const pts = points.map((p) => ({ x: p.x, y: p.y }));
    const superTri = this.addSuperTriangle(pts);
    const N = points.length; // количество исходных точек

    // Треугольники храним как массив [i0,i1,i2]
    let triangles: [number, number, number][] = [superTri];

    // 2. Вставка всех исходных точек
    for (let i = 0; i < N; i++) {
      const point = pts[i];
      const badTriangles = this.findBadTriangles(pts, triangles, point);
      const boundary = this.collectBoundaryEdges(badTriangles);
      triangles = this.removeBadAndAddNew(triangles, badTriangles, boundary, i);
    }

    // 3. Удалить треугольники с супер-вершинами
    const superIndices = [N, N + 1, N + 2];
    triangles = triangles.filter((t) => !t.some((idx) => superIndices.includes(idx)));

    // 4. Преобразовать треугольники в уникальные рёбра (без строк)
    return this.trianglesToEdges(triangles, N);
  }

  // -------------------------------------------------------------------
  // Приватные статические методы (каждый ≤ 10 строк)
  // -------------------------------------------------------------------

  private static addSuperTriangle(pts: Point[]): [number, number, number] {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const dx = maxX - minX,
      dy = maxY - minY;
    const delta = Math.max(dx, dy) * 10;
    const superVerts = [
      { x: minX - delta, y: minY - delta },
      { x: maxX + delta, y: minY - delta },
      { x: minX + dx / 2, y: maxY + delta },
    ];
    pts.push(...superVerts);
    const N = pts.length - 3;
    return [N, N + 1, N + 2];
  }

  private static circumcircleData(pts: Point[], i0: number, i1: number, i2: number) {
    const a = pts[i0],
      b = pts[i1],
      c = pts[i2];
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-12) return null;
    const ux = ((a.x * a.x + a.y * a.y) * (b.y - c.y) + (b.x * b.x + b.y * b.y) * (c.y - a.y) + (c.x * c.x + c.y * c.y) * (a.y - b.y)) / d;
    const uy = ((a.x * a.x + a.y * a.y) * (c.x - b.x) + (b.x * b.x + b.y * b.y) * (a.x - c.x) + (c.x * c.x + c.y * c.y) * (b.x - a.x)) / d;
    const r2 = (a.x - ux) ** 2 + (a.y - uy) ** 2;
    return { cx: ux, cy: uy, r2 };
  }

  private static pointInsideCircumcircle(pts: Point[], tri: [number, number, number], p: Point): boolean {
    const circ = this.circumcircleData(pts, tri[0], tri[1], tri[2]);
    if (!circ) return false;
    const dx = p.x - circ.cx,
      dy = p.y - circ.cy;
    return dx * dx + dy * dy <= circ.r2 + 1e-9;
  }

  private static findBadTriangles(pts: Point[], triangles: [number, number, number][], point: Point) {
    return triangles.filter((t) => this.pointInsideCircumcircle(pts, t, point));
  }

  private static collectBoundaryEdges(badTriangles: [number, number, number][]): [number, number][] {
    const boundary: [number, number][] = [];
    for (const t of badTriangles) {
      const edges: [number, number][] = [
        [t[0], t[1]],
        [t[1], t[2]],
        [t[2], t[0]],
      ];
      for (const e of edges) {
        const reversed = [e[1], e[0]] as [number, number];
        const isShared = badTriangles.some(
          (other) => other !== t && ((other[0] === e[0] && other[1] === e[1]) || (other[0] === reversed[0] && other[1] === reversed[1])),
        );
        if (!isShared) boundary.push(e);
      }
    }
    return boundary;
  }

  private static removeBadAndAddNew(
    triangles: [number, number, number][],
    bad: [number, number, number][],
    boundary: [number, number][],
    newPointIdx: number,
  ): [number, number, number][] {
    const filtered = triangles.filter((t) => !bad.includes(t));
    for (const e of boundary) {
      filtered.push([e[0], e[1], newPointIdx]);
    }
    return filtered;
  }

  private static trianglesToEdges(triangles: [number, number, number][], totalPointsCount: number): EdgeIndex[] {
    // Используем числовой хэш: hash = i * totalPointsCount + j (i < j)
    const edgeSet = new Set<number>();
    for (const [a, b, c] of triangles) {
      const edges = [
        [a, b],
        [b, c],
        [c, a],
      ];
      for (let [u, v] of edges) {
        if (u > v) [u, v] = [v, u];
        const hash = u * totalPointsCount + v;
        edgeSet.add(hash);
      }
    }
    const result: EdgeIndex[] = [];
    for (const hash of edgeSet) {
      const v = hash % totalPointsCount;
      const u = (hash - v) / totalPointsCount;
      result.push({ sourceIndex: u, targetIndex: v });
    }
    return result;
  }
}
