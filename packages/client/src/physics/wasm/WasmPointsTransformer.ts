import { PointGraphManager } from "@core/collections/PointGraphManager";
import { WasmBackend } from "@core/Backends/WasmBackend";

const POINT_STRIDE = 4;

export interface WasmPointData {
  pointer: number;
  length: number;
}

export class WasmPointsTransformer {
  private pointer: number | null = null;
  private capacity = 0;
  private instanceId: number | null = null;

  public constructor(
    private readonly pointGraphManager: PointGraphManager,
    private readonly backend: WasmBackend,
  ) {}

  public attachInstance(instanceId: number): void {
    this.instanceId = instanceId;
    this.pointer = null;
    this.capacity = 0;
  }

  public load(): WasmPointData {
    const instanceId = this.getInstanceId();
    const points = this.pointGraphManager.getPointsArray();
    const values = new Float32Array(points.length * POINT_STRIDE);

    for (let index = 0; index < points.length; index++) {
      this.writePointToValues(values, index);
    }

    this.ensureCapacity(instanceId, values.length);
    this.backend.writeFloat32(instanceId, this.pointer!, values);

    return {
      pointer: this.pointer!,
      length: points.length,
    };
  }

  public loadPoint(index: number): void {
    const instanceId = this.getInstanceId();
    const points = this.pointGraphManager.getPointsArray();
    const point = points[index];

    if (!point) {
      throw new Error(`Point index "${index}" does not exist.`);
    }

    this.ensureCapacity(instanceId, points.length * POINT_STRIDE);

    const values = new Float32Array(POINT_STRIDE);
    values[0] = point.x;
    values[1] = point.y;
    values[2] = point.z;
    values[3] = point.fixed ? 1 : 0;

    this.backend.writeFloat32(
      instanceId,
      this.pointer! + index * POINT_STRIDE * Float32Array.BYTES_PER_ELEMENT,
      values,
    );
  }

  public save(): void {
    const instanceId = this.getInstanceId();
    const points = this.pointGraphManager.getPointsArray();

    if (points.length === 0) {
      return;
    }

    const values = this.backend.readFloat32(
      instanceId,
      this.pointer!,
      points.length * POINT_STRIDE,
    );

    for (let index = 0; index < points.length; index++) {
      this.writeValuesToPoint(values, index);
    }
  }

  public savePoint(index: number): void {
    const instanceId = this.getInstanceId();
    const points = this.pointGraphManager.getPointsArray();
    const point = points[index];

    if (!point) {
      throw new Error(`Point index "${index}" does not exist.`);
    }

    const values = this.backend.readFloat32(
      instanceId,
      this.pointer! + index * POINT_STRIDE * Float32Array.BYTES_PER_ELEMENT,
      POINT_STRIDE,
    );

    point.x = values[0];
    point.y = values[1];
    point.z = values[2];
  }

  public getPointStride(): number {
    return POINT_STRIDE;
  }

  public destroy(): void {
    this.pointer = null;
    this.capacity = 0;
    this.instanceId = null;
  }

  private writePointToValues(values: Float32Array, index: number): void {
    const point = this.pointGraphManager.getPointsArray()[index];
    const offset = index * POINT_STRIDE;

    values[offset] = point.x;
    values[offset + 1] = point.y;
    values[offset + 2] = point.z;
    values[offset + 3] = point.fixed ? 1 : 0;
  }

  private writeValuesToPoint(values: Float32Array, index: number): void {
    const point = this.pointGraphManager.getPointsArray()[index];
    const offset = index * POINT_STRIDE;

    point.x = values[offset];
    point.y = values[offset + 1];
    point.z = values[offset + 2];
  }

  private ensureCapacity(instanceId: number, valueCount: number): void {
    if (this.pointer !== null && this.capacity >= valueCount) {
      return;
    }

    this.pointer = this.backend.allocate(
      instanceId,
      valueCount * Float32Array.BYTES_PER_ELEMENT,
    );
    this.capacity = valueCount;
  }

  private getInstanceId(): number {
    if (this.instanceId === null) {
      throw new Error("WASM transformer is not attached to an algorithm instance.");
    }

    return this.instanceId;
  }
}
