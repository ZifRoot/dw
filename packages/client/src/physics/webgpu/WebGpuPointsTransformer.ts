import { PointGraphManager } from "@core/collections/PointGraphManager";
import {
  WebGpuBackend,
  WebGpuBuffer,
} from "@core/Backends/WebGpuBackend";

const POINT_STRIDE = 4;
const POINT_BYTES = POINT_STRIDE * Float32Array.BYTES_PER_ELEMENT;

export class WebGpuPointsTransformer {
  private pointsBuffer: WebGpuBuffer | null = null;
  private readbackBuffer: WebGpuBuffer | null = null;
  private pointReadbackBuffer: WebGpuBuffer | null = null;
  private capacity = 0;
  private count = 0;

  public constructor(
    private readonly pointGraphManager: PointGraphManager,
    private readonly backend: WebGpuBackend,
  ) {}

  public load(): void {
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

    this.ensureCapacity(points.length);
    this.backend.writeBuffer(this.pointsBuffer!, new Uint8Array(values));
    this.count = points.length;
  }

  public loadPoint(index: number): void {
    const points = this.pointGraphManager.getPointsArray();
    const point = points[index];

    if (!point) {
      throw new Error(`Point index "${index}" does not exist.`);
    }

    this.ensureCapacity(points.length);

    const values = new ArrayBuffer(POINT_BYTES);
    const floats = new Float32Array(values);
    const statuses = new Int32Array(values);

    floats[0] = point.x;
    floats[1] = point.y;
    floats[2] = point.z;
    statuses[3] = point.fixed ? 1 : 0;

    this.backend.writeBufferAt(
      this.pointsBuffer!,
      index * POINT_BYTES,
      new Uint8Array(values),
    );
    this.count = points.length;
  }

  public async save(): Promise<void> {
    const values = new Float32Array(
      await this.backend.readBuffer(this.readbackBuffer!),
    );
    const points = this.pointGraphManager.getPointsArray();

    for (let index = 0; index < points.length; index++) {
      const offset = index * POINT_STRIDE;
      const point = points[index];

      point.x = values[offset];
      point.y = values[offset + 1];
      point.z = values[offset + 2];
    }
  }

  public async savePoint(index: number): Promise<void> {
    const points = this.pointGraphManager.getPointsArray();

    if (!points[index]) {
      throw new Error(`Point index "${index}" does not exist.`);
    }

    this.ensureCapacity(points.length);

    this.backend.submit([], [
      {
        source: this.pointsBuffer!,
        sourceOffset: index * POINT_BYTES,
        destination: this.pointReadbackBuffer!,
        destinationOffset: 0,
        size: POINT_BYTES,
      },
    ]);

    const values = new Float32Array(
      await this.backend.readBuffer(this.pointReadbackBuffer!),
    );
    const point = points[index];

    point.x = values[0];
    point.y = values[1];
    point.z = values[2];
  }

  public getPointBuffer(): WebGpuBuffer {
    if (!this.pointsBuffer) {
      throw new Error("WebGPU points buffer is not initialized.");
    }

    return this.pointsBuffer;
  }

  public getReadbackBuffer(): WebGpuBuffer {
    if (!this.readbackBuffer) {
      throw new Error("WebGPU points readback buffer is not initialized.");
    }

    return this.readbackBuffer;
  }

  public getCount(): number {
    return this.count;
  }

  public getByteLength(): number {
    return this.count * POINT_BYTES;
  }

  public getPointBytes(): number {
    return POINT_BYTES;
  }

  public destroy(): void {
    this.pointsBuffer?.destroy();
    this.readbackBuffer?.destroy();
    this.pointReadbackBuffer?.destroy();
    this.pointsBuffer = null;
    this.readbackBuffer = null;
    this.pointReadbackBuffer = null;
    this.capacity = 0;
    this.count = 0;
  }

  private ensureCapacity(length: number): void {
    if (
      this.pointsBuffer &&
      this.readbackBuffer &&
      this.pointReadbackBuffer &&
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

    this.pointReadbackBuffer ??= this.backend.createBuffer(
      POINT_BYTES,
      this.backend.getBufferUsage().MAP_READ |
        this.backend.getBufferUsage().COPY_DST,
    );

    this.capacity = capacity;
  }
}
