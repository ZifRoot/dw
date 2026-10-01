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

  public constructor(
    private readonly pointGraphManager: PointGraphManager,
    private readonly backend: WasmBackend,
  ) {}

  public load(): WasmPointData {
    const points = this.pointGraphManager.getPointsArray();
    const values = new Float32Array(points.length * POINT_STRIDE);

    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      const offset = index * POINT_STRIDE;

      values[offset] = point.x;
      values[offset + 1] = point.y;
      values[offset + 2] = point.z;
      values[offset + 3] = point.fixed ? 1 : 0;
    }

    this.ensureCapacity(values.length);
    this.backend.writeFloat32(this.pointer!, values);

    return {
      pointer: this.pointer!,
      length: points.length,
    };
  }

  public save(): void {
    const points = this.pointGraphManager.getPointsArray();

    if (points.length === 0) {
      return;
    }

    const values = this.backend.readFloat32(
      this.pointer!,
      points.length * POINT_STRIDE,
    );

    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      const offset = index * POINT_STRIDE;

      point.x = values[offset];
      point.y = values[offset + 1];
      point.z = values[offset + 2];
    }
  }

  public getPointStride(): number {
    return POINT_STRIDE;
  }

  private ensureCapacity(valueCount: number): void {
    if (this.pointer !== null && this.capacity >= valueCount) {
      return;
    }

    this.pointer = this.backend.allocate(
      valueCount * Float32Array.BYTES_PER_ELEMENT,
    );
    this.capacity = valueCount;
  }
}
