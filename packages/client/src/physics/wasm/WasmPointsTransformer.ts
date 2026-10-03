import { PointGraphManager } from "@core/collections/PointGraphManager";
import { WasmBackend } from "@core/Backends/WasmBackend";

const POINT_STRIDE = 4;
const POINT_BYTES = POINT_STRIDE * Float32Array.BYTES_PER_ELEMENT;

export interface WasmPointData { pointer: number; length: number; }

export class WasmPointsTransformer {
  private pointer: number | null = null;
  private capacity = 0;
  private instanceId: number | null = null;

  public constructor(private readonly pointGraphManager: PointGraphManager, private readonly backend: WasmBackend) {}

  public attachInstance(instanceId: number): void { this.instanceId = instanceId; }

  public load(): WasmPointData {
    const data = this.ensurePointStorage();
    const points = this.pointGraphManager.getPointsArray();
    const values = new ArrayBuffer(points.length * POINT_BYTES);
    const floats = new Float32Array(values);
    const statuses = new Int32Array(values);

    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      const offset = index * POINT_STRIDE;
      floats[offset] = point.x;
      floats[offset + 1] = point.y;
      floats[offset + 2] = point.z;
      statuses[offset + 3] = point.fixed ? 1 : 0;
    }

    this.backend.writeBytes(data.instanceId, data.pointer, new Uint8Array(values));
    return { pointer: data.pointer, length: points.length };
  }

  public getData(): WasmPointData {
    const data = this.ensurePointStorage();
    return { pointer: data.pointer, length: this.pointGraphManager.getPointsArray().length };
  }

  public save(): void {
    const data = this.ensurePointStorage();
    const points = this.pointGraphManager.getPointsArray();
    if (points.length === 0) return;

    const values = this.backend.readFloat32(data.instanceId, data.pointer, points.length * POINT_STRIDE);
    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      const offset = index * POINT_STRIDE;
      point.x = values[offset];
      point.y = values[offset + 1];
      point.z = values[offset + 2];
    }
  }

  public loadPoint(index: number): void {
    const points = this.pointGraphManager.getPointsArray();
    const point = points[index];
    if (!point) throw new Error(`Point index "${index}" does not exist.`);

    const data = this.ensurePointStorage();
    const values = new ArrayBuffer(POINT_BYTES);
    const floats = new Float32Array(values);
    const statuses = new Int32Array(values);
    floats[0] = point.x; floats[1] = point.y; floats[2] = point.z; statuses[3] = point.fixed ? 1 : 0;
    this.backend.writeBytes(data.instanceId, data.pointer + index * POINT_BYTES, new Uint8Array(values));
  }

  public savePoint(index: number): void {
    const points = this.pointGraphManager.getPointsArray();
    const point = points[index];
    if (!point) throw new Error(`Point index "${index}" does not exist.`);

    const data = this.ensurePointStorage();
    const values = this.backend.readFloat32(data.instanceId, data.pointer + index * POINT_BYTES, POINT_STRIDE);
    point.x = values[0]; point.y = values[1]; point.z = values[2];
  }

  public destroy(): void { this.pointer = null; this.capacity = 0; this.instanceId = null; }

  private ensurePointStorage(): { instanceId: number; pointer: number } {
    const instanceId = this.getInstanceId();
    const requiredBytes = this.pointGraphManager.getPointsArray().length * POINT_BYTES;
    if (this.pointer !== null && this.capacity >= requiredBytes) return { instanceId, pointer: this.pointer };

    this.pointer = this.backend.allocate(instanceId, Math.max(requiredBytes, POINT_BYTES));
    this.capacity = Math.max(requiredBytes, POINT_BYTES);
    return { instanceId, pointer: this.pointer };
  }

  private getInstanceId(): number {
    if (this.instanceId === null) throw new Error("WASM transformer is not attached to an algorithm instance.");
    return this.instanceId;
  }
}
