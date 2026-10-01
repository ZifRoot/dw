import { PointGraphManager } from "@core/collections/PointGraphManager";
import {
  WebGpuBackend,
  WebGpuBuffer,
} from "@core/Backends/WebGpuBackend";

const POINT_STRIDE = 4;
const POINT_BYTES = POINT_STRIDE * Float32Array.BYTES_PER_ELEMENT;

export interface WebGpuPointData {
  buffer: WebGpuBuffer;
  readback: WebGpuBuffer;
  count: number;
  byteLength: number;
}

export class WebGpuPointsTransformer {
  private pointsBuffer: WebGpuBuffer | null = null;
  private readbackBuffer: WebGpuBuffer | null = null;
  private capacity = 0;

  public constructor(
    private readonly pointGraphManager: PointGraphManager,
    private readonly backend: WebGpuBackend,
  ) {}

  public load(): WebGpuPointData {
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

    this.ensureCapacity(points.length);
    this.backend.writeBuffer(this.pointsBuffer!, values);

    return {
      buffer: this.pointsBuffer!,
      readback: this.readbackBuffer!,
      count: points.length,
      byteLength: values.byteLength,
    };
  }

  public async save(readback: WebGpuBuffer, byteLength: number): Promise<void> {
    const values = new Float32Array(
      await this.backend.readBuffer(readback),
    );

    const points = this.pointGraphManager.getPointsArray();

    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      const offset = index * POINT_STRIDE;

      point.x = values[offset];
      point.y = values[offset + 1];
      point.z = values[offset + 2];
    }

    void byteLength;
  }

  public getPointBytes(): number {
    return POINT_BYTES;
  }

  public destroy(): void {
    this.pointsBuffer?.destroy();
    this.readbackBuffer?.destroy();
    this.pointsBuffer = null;
    this.readbackBuffer = null;
    this.capacity = 0;
  }

  private ensureCapacity(length: number): void {
    if (
      this.pointsBuffer &&
      this.readbackBuffer &&
      this.capacity >= length
    ) {
      return;
    }

    this.pointsBuffer?.destroy();
    this.readbackBuffer?.destroy();

    const capacity = Math.max(length, 1);
    const pointBytes = capacity * POINT_BYTES;

    this.pointsBuffer = this.backend.createBuffer(
      pointBytes,
      this.backend.getBufferUsage().STORAGE |
        this.backend.getBufferUsage().COPY_SRC |
        this.backend.getBufferUsage().COPY_DST,
    );

    this.readbackBuffer = this.backend.createBuffer(
      pointBytes,
      this.backend.getBufferUsage().MAP_READ |
        this.backend.getBufferUsage().COPY_DST,
    );

    this.capacity = capacity;
  }
}
