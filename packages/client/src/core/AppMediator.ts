// core/AppMediator.ts
import { BaseMediator } from "./BaseMediator";

// Типы данных для каждого ключа
interface AppEventMap {
  [AppMediator.PROGRESS]: number;
  [AppMediator.TARGET_SIZE]: number;
  [AppMediator.TEMPERATURE]: number;
  [AppMediator.AUTO_ZOOM]: boolean;
  // команды (без данных)
  [AppMediator.CLEAR_POINTS]: undefined;
  [AppMediator.ADD_POINT]: undefined;
  [AppMediator.START_REPULSION]: undefined;
}

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

  // ========== Геттеры/сеттеры ==========
  public get progress(): number {
    return this.get(AppMediator.PROGRESS);
  }
  public set progress(value: number) {
    this.set(AppMediator.PROGRESS, value);
  }

  public get targetSize(): number {
    return this.get(AppMediator.TARGET_SIZE);
  }
  public set targetSize(value: number) {
    this.set(AppMediator.TARGET_SIZE, value);
  }

  public get temperature(): number {
    return this.get(AppMediator.TEMPERATURE);
  }
  public set temperature(value: number) {
    this.set(AppMediator.TEMPERATURE, value);
  }

  public get autoZoom(): boolean {
    return this.get(AppMediator.AUTO_ZOOM);
  }
  public set autoZoom(value: boolean) {
    this.set(AppMediator.AUTO_ZOOM, value);
  }

  // ========== Команды ==========
  public clearPoints(): void {
    this.emit(AppMediator.CLEAR_POINTS);
  }

  public addPoint(): void {
    this.emit(AppMediator.ADD_POINT);
  }

  public startRepulsion(): void {
    this.emit(AppMediator.START_REPULSION);
  }

  // ========== Типизированные методы подписки ==========
  public onProgress(callback: (value: number) => void): () => void {
    return this.on(AppMediator.PROGRESS, callback);
  }
  public onTargetSize(callback: (value: number) => void): () => void {
    return this.on(AppMediator.TARGET_SIZE, callback);
  }
  public onTemperature(callback: (value: number) => void): () => void {
    return this.on(AppMediator.TEMPERATURE, callback);
  }
  public onAutoZoom(callback: (value: boolean) => void): () => void {
    return this.on(AppMediator.AUTO_ZOOM, callback);
  }
  public onClearPoints(callback: () => void): () => void {
    return this.on(AppMediator.CLEAR_POINTS, () => callback());
  }
  public onAddPoint(callback: () => void): () => void {
    return this.on(AppMediator.ADD_POINT, () => callback());
  }
  public onStartRepulsion(callback: () => void): () => void {
    return this.on(AppMediator.START_REPULSION, () => callback());
  }
}
