export interface PointMath {
  x: number;
  y: number;
  z: number;
}

export class Point implements PointMath {
  constructor(
    public x: number = 0,
    public y: number = 0,
    public z: number = 0,
  ) {}

  // ============================================================
  //  ЭКЗЕМПЛЯРНЫЕ МЕТОДЫ (мутация)
  // ============================================================

  set(p: PointMath) {
    return Point.Add(this, p);
  }
  add(v: PointMath): this {
    return Point.Add(this, v);
  }

  sub(v: PointMath): this {
    return Point.Sub(this, v);
  }

  scale(k: number): this {
    return Point.Scale(this, k);
  }

  negate(): this {
    return Point.Negate(this);
  }

  normalize(): this {
    return Point.Normalize(this);
  }

  // ============================================================
  //  ВЫЧИСЛИТЕЛЬНЫЕ МЕТОДЫ (без мутации)
  // ============================================================

  lenSq(): number {
    return Point.LenSq(this);
  }

  len(): number {
    return Point.Len(this);
  }

  distTo(other: PointMath): number {
    return Point.Dist(this, other);
  }

  clone(): Point {
    return new Point(this.x, this.y, this.z);
  }

  // ============================================================
  //  ЭКЗЕМПЛЯРНЫЕ МЕТОДЫ (новый объект)
  // ============================================================

  addNew(v: PointMath): Point {
    return this.clone().add(v);
  }

  subNew(v: PointMath): Point {
    return this.clone().sub(v);
  }

  scaleNew(k: number): Point {
    return this.clone().scale(k);
  }

  negateNew(): Point {
    return this.clone().negate();
  }

  normalizeNew(): Point {
    return this.clone().normalize();
  }

  // ============================================================
  //  СТАТИЧЕСКИЕ МЕТОДЫ (МУТАЦИЯ) – с дженериком, возвращают T
  // ============================================================
  static Set<T extends PointMath>(a: T, b: PointMath): T {
    a.x = b.x;
    a.y = b.y;
    a.z = b.z;
    return a;
  }

  static Add<T extends PointMath>(a: T, b: PointMath): T {
    a.x += b.x;
    a.y += b.y;
    a.z += b.z;
    return a;
  }

  static Sub<T extends PointMath>(a: T, b: PointMath): T {
    a.x -= b.x;
    a.y -= b.y;
    a.z -= b.z;
    return a;
  }

  static Scale<T extends PointMath>(a: T, k: number): T {
    a.x *= k;
    a.y *= k;
    a.z *= k;
    return a;
  }

  static Negate<T extends PointMath>(a: T): T {
    a.x = -a.x;
    a.y = -a.y;
    a.z = -a.z;
    return a;
  }

  static Normalize<T extends PointMath>(a: T): T {
    const lenSq = Point.LenSq(a);
    if (lenSq < Point.nearzero) return a;
    const len1 = 1 / Math.sqrt(lenSq);
    return Point.Scale(a, len1);
  }

  // ============================================================
  //  СТАТИЧЕСКИЕ МЕТОДЫ (НОВЫЙ ОБЪЕКТ) – возвращают Point
  // ============================================================

  static AddNew(a: PointMath, b: PointMath): Point {
    const result = new Point(a.x, a.y, a.z);
    return Point.Add(result, b);
  }

  static SubNew(a: PointMath, b: PointMath): Point {
    const result = new Point(a.x, a.y, a.z);
    return Point.Sub(result, b);
  }

  static ScaleNew(a: PointMath, k: number): Point {
    const result = new Point(a.x, a.y, a.z);
    return Point.Scale(result, k);
  }

  static NegNew(a: PointMath): Point {
    const result = new Point(a.x, a.y, a.z);
    return Point.Negate(result);
  }

  static NormalizeNew(a: PointMath): Point {
    const result = new Point(a.x, a.y, a.z);
    return Point.Normalize(result);
  }

  // ============================================================
  //  СТАТИЧЕСКИЕ ВЫЧИСЛИТЕЛЬНЫЕ МЕТОДЫ
  // ============================================================

  static LenSq(a: PointMath): number {
    return a.x * a.x + a.y * a.y + a.z * a.z;
  }

  static Len(a: PointMath): number {
    return Math.sqrt(Point.LenSq(a));
  }

  static Dist(a: PointMath, b: PointMath): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // ============================================================
  //  СТАТИЧЕСКИЕ ФАБРИКИ
  // ============================================================

  static readonly nearzero = 1e-6;

  static Zero(): Point {
    return new Point(0, 0, 0);
  }

  static One(): Point {
    return new Point(1, 1, 1);
  }

  static From(obj: PointMath): Point {
    return new Point(obj.x, obj.y, obj.z);
  }

  static Random(): Point {
    return new Point(Math.random(), Math.random(), Math.random());
  }

  static RandomCentered(): Point {
    return Point.Random().scale(2).sub(Point.One());
  }

  static RandomSphere(): Point {
    while (true) {
      const v = Point.RandomCentered().normalize();
      const len = v.lenSq();
      if (len > Point.nearzero) return v;
    }
  }
}
