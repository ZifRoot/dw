// core/AppMediator.ts
import { BaseMediator } from "./BaseMediator";

export class AppMediator extends BaseMediator {
  // ========== Ключи для состояния ==========
  static PROGRESS = "progress";
  static TARGET_SIZE = "target-size";
  static TEMPERATURE = "temperature";
  static AUTO_ZOOM = "auto-zoom";

  // ========== Ключи для команд (событий без состояния) ==========
  static CLEAR_POINTS = "clear-points";
  static ADD_POINT = "add-point";
  static START_REPULSION = "start-repulsion";

  // ========== Геттеры/сеттеры (единообразно через константы) ==========
  public get progress(): number {
    return this.get(AppMediator.PROGRESS) ?? 0;
  }
  public set progress(value: number) {
    this.set(AppMediator.PROGRESS, value);
  }

  public get targetSize(): number {
    const val = this.get(AppMediator.TARGET_SIZE);
    return val !== undefined ? val : 20;
  }
  public set targetSize(value: number) {
    const clamped = Math.max(1, Math.min(1000, value));
    this.set(AppMediator.TARGET_SIZE, clamped);
  }

  public get temperature(): number {
    return this.get(AppMediator.TEMPERATURE) ?? 100;
  }
  public set temperature(value: number) {
    this.set(AppMediator.TEMPERATURE, value);
  }

  public get autoZoom(): boolean {
    return this.get(AppMediator.AUTO_ZOOM) ?? true;
  }
  public set autoZoom(value: boolean) {
    this.set(AppMediator.AUTO_ZOOM, value);
  }

  // ========== Команды (используют константы) ==========
  public clearPoints(): void {
    this.emit(AppMediator.CLEAR_POINTS);
  }

  public addPoint(): void {
    this.emit(AppMediator.ADD_POINT);
  }

  public startRepulsion(): void {
    this.emit(AppMediator.START_REPULSION);
  }
}
