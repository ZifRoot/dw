// core/AppMediator.ts
import { BaseMediator } from "./BaseMediator";
import { UIPoint, UIEdge } from "./ui-models";

export interface AppEventMap {
  [AppMediator.PROGRESS]: number;
  [AppMediator.TARGET_SIZE]: number;
  [AppMediator.TEMPERATURE]: number;
  [AppMediator.AUTO_ZOOM]: boolean;
  [AppMediator.SELECTED_POINT]: UIPoint | null;
  [AppMediator.SELECTED_EDGE]: UIEdge | null;
  [AppMediator.POINT_UPDATE]: { pointId: string; changes: Partial<Omit<UIPoint, "id">> };
  [AppMediator.EDGE_UPDATE]: { edgeId: string; changes: Partial<Omit<UIEdge, "id">> };
  // команды
  [AppMediator.CLEAR_POINTS]: undefined;
  [AppMediator.ADD_POINT]: undefined;
  [AppMediator.START_REPULSION]: undefined;
}

export class AppMediator extends BaseMediator {
  // закрытые константы – не экспортируем
  static PROGRESS = "progress";
  static TARGET_SIZE = "target-size";
  static TEMPERATURE = "temperature";
  static AUTO_ZOOM = "auto-zoom";
  static SELECTED_POINT = "selected-point";
  static SELECTED_EDGE = "selected-edge";
  static POINT_UPDATE = "point-update";
  static EDGE_UPDATE = "edge-update";
  static CLEAR_POINTS = "clear-points";
  static ADD_POINT = "add-point";
  static START_REPULSION = "start-repulsion";

  // ========== Геттеры/сеттеры для UI-моделей ==========
  public get progress(): number {
    return this.get(AppMediator.PROGRESS) ?? 0;
  }
  public set progress(value: number) {
    this.set(AppMediator.PROGRESS, value);
  }

  public get targetSize(): number {
    return this.get(AppMediator.TARGET_SIZE) ?? 0;
  }
  public set targetSize(value: number) {
    this.set(AppMediator.TARGET_SIZE, value);
  }

  public get temperature(): number {
    return this.get(AppMediator.TEMPERATURE) ?? 0;
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

  public get selectedPoint(): UIPoint | null {
    return this.get(AppMediator.SELECTED_POINT) ?? null;
  }
  public set selectedPoint(value: UIPoint | null) {
    this.set(AppMediator.SELECTED_POINT, value);
  }

  public get selectedEdge(): UIEdge | null {
    return this.get(AppMediator.SELECTED_EDGE) ?? null;
  }
  public set selectedEdge(value: UIEdge | null) {
    this.set(AppMediator.SELECTED_EDGE, value);
  }

  // ========== Универсальные методы обновления ==========
  public updatePoint(pointId: string, changes: Partial<Omit<UIPoint, "id">>): void {
    this.emit(AppMediator.POINT_UPDATE, { pointId, changes });
  }

  public updateEdge(edgeId: string, changes: Partial<Omit<UIEdge, "id">>): void {
    this.emit(AppMediator.EDGE_UPDATE, { edgeId, changes });
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

  // ========== Типизированные методы подписки (скрывают ключи) ==========
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
  public onSelectedPoint(callback: (point: UIPoint | null) => void): () => void {
    return this.on(AppMediator.SELECTED_POINT, callback);
  }
  public onSelectedEdge(callback: (edge: UIEdge | null) => void): () => void {
    return this.on(AppMediator.SELECTED_EDGE, callback);
  }
  public onPointUpdate(callback: (detail: { pointId: string; changes: Partial<Omit<UIPoint, "id">> }) => void): () => void {
    return this.on(AppMediator.POINT_UPDATE, callback);
  }
  public onEdgeUpdate(callback: (detail: { edgeId: string; changes: Partial<Omit<UIEdge, "id">> }) => void): () => void {
    return this.on(AppMediator.EDGE_UPDATE, callback);
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
