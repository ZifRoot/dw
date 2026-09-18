// core/PatternColorPalette.ts
export class PatternColorPalette {
  private colors: string[];

  constructor(colors: string[] = [
    "#FF6B6B", // красный
    "#4ECDC4", // бирюзовый
    "#FFE66D", // жёлтый
    "#A29BFE", // фиолетовый
    "#FD79A8", // розовый
    "#00B894", // зелёный
    "#FDCB6E", // оранжевый
    "#6C5CE7", // синий
    "#E17055", // терракотовый
    "#00CEC9", // циан
  ]) {
    this.colors = colors;
  }

  /** Получить цвет по множеству активных индексов */
  public getColor(activeSet: Set<number>): string {
    if (activeSet.size === 0) return "#888888";
    const sorted = Array.from(activeSet).sort();
    let hash = 0;
    for (const v of sorted) {
      hash = (hash * 31 + v) & 0xFFFFFFFF;
    }
    const index = Math.abs(hash) % this.colors.length;
    return this.colors[index];
  }

  /** Смешивание двух цветов (упрощённо) */
  public mix(color1: string, color2: string): string {
    // Просто берём средний цвет из палитры, но для простоты возвращаем первый
    return color1; // можно улучшить
  }
}