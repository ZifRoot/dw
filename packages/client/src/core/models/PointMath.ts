import { BasePointMath } from "./BasePointMath";

export class PointMath implements BasePointMath {
  constructor(
    public x: number = 0,
    public y: number = 0,
    public z: number = 0,
  ) {}

  // ============================================================
  //  ЭКЗЕМПЛЯРНЫЕ МЕТОДЫ (мутация)
  // ============================================================

  set(p: BasePointMath) {
    return PointMath.Set(this, p);
  }
  add(v: BasePointMath): this {
    return PointMath.Add(this, v);
  }

  sub(v: BasePointMath): this {
    return PointMath.Sub(this, v);
  }

  scale(k: number): this {
    return PointMath.Scale(this, k);
  }

  negate(): this {
    return PointMath.Negate(this);
  }

  normalize(): this {
    return PointMath.Normalize(this);
  }

  smoothMove(target: BasePointMath, factor: number): PointMath {
    return PointMath.Add(this, PointMath.SubNew(target, this).scale(factor));
  }

  // ============================================================
  //  ВЫЧИСЛИТЕЛЬНЫЕ МЕТОДЫ (без мутации)
  // ============================================================

  lenSq(): number {
    return PointMath.LenSq(this);
  }

  len(): number {
    return PointMath.Len(this);
  }

  distTo(other: BasePointMath): number {
    return PointMath.Dist(this, other);
  }

  clone(): PointMath {
    return new PointMath(this.x, this.y, this.z);
  }

  // ============================================================
  //  ЭКЗЕМПЛЯРНЫЕ МЕТОДЫ (новый объект)
  // ============================================================

  addNew(v: BasePointMath): PointMath {
    return this.clone().add(v);
  }

  subNew(v: BasePointMath): PointMath {
    return this.clone().sub(v);
  }

  scaleNew(k: number): PointMath {
    return this.clone().scale(k);
  }

  negateNew(): PointMath {
    return this.clone().negate();
  }

  normalizeNew(): PointMath {
    return this.clone().normalize();
  }

  // ============================================================
  //  СТАТИЧЕСКИЕ МЕТОДЫ (МУТАЦИЯ) – с дженериком, возвращают T
  // ============================================================
  static Set<T extends BasePointMath>(a: T, b: BasePointMath): T {
    a.x = b.x;
    a.y = b.y;
    a.z = b.z;
    return a;
  }

  static Add<T extends BasePointMath>(a: T, b: BasePointMath): T {
    a.x += b.x;
    a.y += b.y;
    a.z += b.z;
    return a;
  }

  static Sub<T extends BasePointMath>(a: T, b: BasePointMath): T {
    a.x -= b.x;
    a.y -= b.y;
    a.z -= b.z;
    return a;
  }

  static Scale<T extends BasePointMath>(a: T, k: number): T {
    a.x *= k;
    a.y *= k;
    a.z *= k;
    return a;
  }

  static Negate<T extends BasePointMath>(a: T): T {
    a.x = -a.x;
    a.y = -a.y;
    a.z = -a.z;
    return a;
  }

  static Normalize<T extends BasePointMath>(a: T): T {
    const lenSq = PointMath.LenSq(a);
    if (lenSq < PointMath.nearzero) return a;
    const len1 = 1 / Math.sqrt(lenSq);
    return PointMath.Scale(a, len1);
  }

  // ============================================================
  //  СТАТИЧЕСКИЕ МЕТОДЫ (НОВЫЙ ОБЪЕКТ) – возвращают Point
  // ============================================================

  static AddNew(a: BasePointMath, b: BasePointMath): PointMath {
    const result = new PointMath(a.x, a.y, a.z);
    return PointMath.Add(result, b);
  }

  static SubNew(a: BasePointMath, b: BasePointMath): PointMath {
    const result = new PointMath(a.x, a.y, a.z);
    return PointMath.Sub(result, b);
  }

  static ScaleNew(a: BasePointMath, k: number): PointMath {
    const result = new PointMath(a.x, a.y, a.z);
    return PointMath.Scale(result, k);
  }

  static NegNew(a: BasePointMath): PointMath {
    const result = new PointMath(a.x, a.y, a.z);
    return PointMath.Negate(result);
  }

  static NormalizeNew(a: BasePointMath): PointMath {
    const result = new PointMath(a.x, a.y, a.z);
    return PointMath.Normalize(result);
  }

  // ============================================================
  //  СТАТИЧЕСКИЕ ВЫЧИСЛИТЕЛЬНЫЕ МЕТОДЫ
  // ============================================================

  static LenSq(a: BasePointMath): number {
    return a.x * a.x + a.y * a.y + a.z * a.z;
  }

  static Len(a: BasePointMath): number {
    return Math.sqrt(PointMath.LenSq(a));
  }

  static Dist(a: BasePointMath, b: BasePointMath): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // ============================================================
  //  СТАТИЧЕСКИЕ ФАБРИКИ
  // ============================================================

  static readonly nearzero = 1e-6;

  static Zero(): PointMath {
    return new PointMath(0, 0, 0);
  }

  static One(): PointMath {
    return new PointMath(1, 1, 1);
  }

  static From(obj: BasePointMath): PointMath {
    return new PointMath(obj.x, obj.y, obj.z);
  }

  static Random(): PointMath {
    return new PointMath(Math.random(), Math.random(), Math.random());
  }

  static RandomCentered(): PointMath {
    return PointMath.Random().scale(2).sub(PointMath.One());
  }

  static RandomSphere(): PointMath {
    while (true) {
      const v = PointMath.RandomCentered().normalize();
      const len = v.lenSq();
      if (len > PointMath.nearzero) return v;
    }
  }
}
