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
  [AppMediator.EDGES_TABLE]: undefined;
  [AppMediator.POINTS_UPDATED]: undefined;
  [AppMediator.POINTS_UPDATING]: undefined;
  [AppMediator.POINTS_GRAPH_UPDATED]: undefined;
  [AppMediator.MODEL_MANAGER_STEP]: undefined;
  // команды
  [AppMediator.CLEAR_POINTS]: undefined;
  [AppMediator.ADD_POINT]: undefined;
  [AppMediator.START_REPULSION]: undefined;
}

export class AppMediator extends BaseMediator {
  // ========== Ключи для состояния ==========
  static PROGRESS = "progress";
  static TARGET_SIZE = "target-size";
  static TEMPERATURE = "temperature";
  static SIZE_TEXT = "size-text";
  static AUTO_ZOOM = "auto-zoom";
  static SELECTED_POINT = "selected-point";
  static SELECTED_EDGE = "selected-edge";
  static POINT_UPDATE = "point-update";
  static POINT_UPDATED = "point-updated";
  static EDGE_UPDATE = "edge-update";
  static EDGES_TABLE = "edges-table";

  // ========== Команды и сигналы ==========
  static CLEAR_POINTS = "clear-points";
  static ADD_POINT = "add-point";
  static START_REPULSION = "start-repulsion";
  static START_GRAPH = "start-graph";
  static RELOAD_TABLES = "reload-tables";
  static POINTS_UPDATING = "points-updating";
  static SAVE_POSITIONS = "save-positions";
  static POSITIONS_SAVED = "positions-saved";
  static POINTS_UPDATED = "points-updated";
  static POINTS_GRAPH_UPDATED = "points-graph-updated";
  static MODEL_MANAGER_STEP = "model-manager-step";

  // ========== Геттеры/сеттеры ==========
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

  public get sizeText(): number {
    return this.get(AppMediator.SIZE_TEXT) ?? 0;
  }
  public set sizeText(value: number) {
    this.set(AppMediator.SIZE_TEXT, value);
  }

  // ========== UI updates ==========
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

  public startGraph(): void {
    this.emit(AppMediator.START_GRAPH);
  }

  public reloadTables(): void {
    this.emit(AppMediator.RELOAD_TABLES);
  }

  /** Команда: сохранить позиции точек и связи (вызывается из UI). */
  public savePositions(): void {
    this.emit(AppMediator.SAVE_POSITIONS);
  }

  /** Событие: сохранение позиций точек и связей завершено. */
  public positionsSaved(): void {
    this.emit(AppMediator.POSITIONS_SAVED);
  }

  /** Сигнал: одна точка была изменена. Данные остаются в PointGraphManager. */
  public pointUpdated(): void {
    this.emit(AppMediator.POINT_UPDATED);
  }

  /** Частый сигнал: физика обновила позиции. Данные остаются в PointGraphManager. */
  public pointsUpdating(): void {
    this.emit(AppMediator.POINTS_UPDATING);
  }

  /** Редкий сигнал: физика закончила обновление. Данные остаются в PointGraphManager. */
  public pointsUpdated(): void {
    this.emit(AppMediator.POINTS_UPDATED);
  }

  /** Сигнал: PointGraphManager получил новые точки/рёбра. */
  public pointsGraphUpdated(): void {
    this.emit(AppMediator.POINTS_GRAPH_UPDATED);
  }

  public modelManagerStep(): void {
    this.emit(AppMediator.MODEL_MANAGER_STEP);
  }

  // ========== Методы подписки ==========
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
  public onSizeText(callback: (value: number) => void): () => void {
    return this.on(AppMediator.SIZE_TEXT, callback);
  }
  public onEdgeUpdate(callback: (detail: { edgeId: string; changes: Partial<Omit<UIEdge, "id">> }) => void): () => void {
    return this.on(AppMediator.EDGE_UPDATE, callback);
  }
  public onEdgesTable(callback: () => void): () => void {
    return this.on(AppMediator.EDGES_TABLE, callback);
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
  public onStartGraph(callback: () => void): () => void {
    return this.on(AppMediator.START_GRAPH, () => callback());
  }
  public onReloadTables(callback: () => void): () => void {
    return this.on(AppMediator.RELOAD_TABLES, () => callback());
  }
  public onSavePositions(callback: () => void): () => void {
    return this.on(AppMediator.SAVE_POSITIONS, () => callback());
  }
  public onPositionsSaved(callback: () => void): () => void {
    return this.on(AppMediator.POSITIONS_SAVED, () => callback());
  }
  public onPointsUpdating(callback: () => void): () => void {
    return this.on(AppMediator.POINTS_UPDATING, callback);
  }
  public onPointsUpdated(callback: () => void): () => void {
    return this.on(AppMediator.POINTS_UPDATED, callback);
  }
  public onPointUpdated(callback: () => void): () => void {
    return this.on(AppMediator.POINT_UPDATED, callback);
  }
  public onPointsGraphUpdated(callback: () => void): () => void {
    return this.on(AppMediator.POINTS_GRAPH_UPDATED, callback);
  }
  public onModelManagerStep(callback: () => void): () => void {
    return this.on(AppMediator.MODEL_MANAGER_STEP, callback);
  }
}
