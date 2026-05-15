// =============================== Внутренние классы ===============================
/// <summary>Точка на холсте (документ/чат).</summary>

export class Point {
  public _groupElement?: SVGGElement;

  public id: string;
  public x: number;
  public y: number;
  public text: string;
  public labelOffset?: { dx: number; dy: number };

  constructor(id: string, text: string, x: number, y: number, labelOffset?: { dx: number; dy: number } | string) {
    this.id = id;
    this.text = text;
    this.x = x;
    this.y = y;
    if (typeof labelOffset === "string") {
      this.labelOffset = Point.getOffsetBySide(labelOffset);
    } else {
      this.labelOffset = labelOffset;
    }
  }
  public get groupElement(): SVGGElement {
    return this._groupElement!;
  }
  public set groupElement(value: SVGGElement) {
    this._groupElement = value;
  }

  public static getOffsetBySide(side: string): { dx: number; dy: number } {
    const map = { right: { dx: 8, dy: 4 }, left: { dx: -8, dy: 4 }, top: { dx: 0, dy: -12 }, bottom: { dx: 0, dy: 16 } };
    return map[side as keyof typeof map] ?? map.right;
  }
}
