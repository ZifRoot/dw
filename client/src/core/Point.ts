// =============================== Внутренние классы ===============================
/// <summary>Точка на холсте (документ/чат).</summary>

export class Point {
  public _groupElement?: SVGGElement;

  public id: string;
  public x: number;
  public y: number;
  public text: string;
  public labelOffset?: { dx: number; dy: number; };

  constructor(id: string, text: string, x: number, y: number, labelOffset?: { dx: number; dy: number; }) {
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
