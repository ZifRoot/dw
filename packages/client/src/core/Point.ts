// =============================== Внутренние классы ===============================
/// <summary>Точка на холсте (документ/чат).</summary>

import { toDate } from "@utils/date-utils";

export class Point {
  public _groupElement?: SVGGElement;

  public id: string;
  public x: number;
  public y: number;
  public text: string;
  public labelOffset?: { dx: number; dy: number };
  public updated_at: number;

  constructor(id: string, text: string, x: number, y: number, labelOffset: { dx: number; dy: number } | string, updated_at: number | Date | string) {
    this.id = id;
    this.text = text;
    this.x = x;
    this.y = y;
    if (typeof labelOffset === "string") {
      this.labelOffset = Point.getOffsetBySide(labelOffset);
    } else {
      this.labelOffset = labelOffset;
    }
    this.updated_at = toDate(updated_at)?.getTime() ?? Date.now();
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
