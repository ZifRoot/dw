import { PointGraphManager } from "@core/collections/PointGraphManager";
import { WebGpuBackend, WebGpuBuffer } from "@core/Backends/WebGpuBackend";

const EDGE_BYTES = 16;

export class WebGpuEdgesTransformer {
  private buffer: WebGpuBuffer | null = null;
  private capacity = 0;
  private count = 0;

  public constructor(
    private readonly pointGraphManager: PointGraphManager,
    private readonly backend: WebGpuBackend,
  ) {}

  public load(): void {
    const points = this.pointGraphManager.getPointsArray();
    const indexes = new Map(points.map((point, index) => [point, index]));
    const edges = this.pointGraphManager.getEdgesArray();
    const values = new ArrayBuffer(Math.max(edges.length * EDGE_BYTES, EDGE_BYTES));
    const ints = new Int32Array(values);
    const floats = new Float32Array(values);

    for (let index = 0; index < edges.length; index++) {
      const edge = edges[index];
      const offset = index * 4;
      ints[offset] = indexes.get(edge.source) ?? -1;
      ints[offset + 1] = indexes.get(edge.target) ?? -1;
      floats[offset + 2] = edge.distance;
      ints[offset + 3] = edge.physics ? 1 : 0;
    }

    this.ensureCapacity(edges.length);
    this.backend.writeBuffer(this.buffer!, new Uint8Array(values));
    this.count = edges.length;
  }

  public getBuffer(): WebGpuBuffer {
    if (!this.buffer) throw new Error("WebGPU edge buffer is not initialized.");
    return this.buffer;
  }

  public getCount(): number {
    return this.count;
  }

  public destroy(): void {
    this.buffer?.destroy();
    this.buffer = null;
    this.capacity = 0;
    this.count = 0;
  }

  private ensureCapacity(length: number): void {
    if (this.buffer && this.capacity >= length) return;

    this.buffer?.destroy();
    this.buffer = this.backend.createBuffer(
      Math.max(length, 1) * EDGE_BYTES,
      this.backend.getBufferUsage().STORAGE | this.backend.getBufferUsage().COPY_DST,
    );
    this.capacity = Math.max(length, 1);
  }
}
