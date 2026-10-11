import { PointGraphManager } from "@core/collections/PointGraphManager";
import { WasmBackend } from "@core/Backends/WasmBackend";

const EDGE_STRIDE = 4;
const EDGE_BYTES = EDGE_STRIDE * Float32Array.BYTES_PER_ELEMENT;

export interface WasmEdgeData {
  pointer: number;
  length: number;
}

export class WasmEdgesTransformer {
  private pointer: number | null = null;
  private capacity = 0;
  private instanceId: number | null = null;

  public constructor(
    private readonly pointGraphManager: PointGraphManager,
    private readonly backend: WasmBackend,
  ) {}

  public attachInstance(instanceId: number): void {
    this.instanceId = instanceId;
  }

  public load(): WasmEdgeData {
    const instanceId = this.getInstanceId();
    const points = this.pointGraphManager.getPointsArray();
    const pointIndexes = new Map(points.map((point, index) => [point, index]));
    const edges = this.pointGraphManager.getEdgesArray();
    const values = new ArrayBuffer(edges.length * EDGE_BYTES);
    const indexes = new Int32Array(values);
    const distances = new Float32Array(values);

    for (let index = 0; index < edges.length; index++) {
      const edge = edges[index];
      const offset = index * EDGE_STRIDE;
      indexes[offset] = pointIndexes.get(edge.source) ?? -1;
      indexes[offset + 1] = pointIndexes.get(edge.target) ?? -1;
      distances[offset + 2] = edge.distance;
      indexes[offset + 3] = edge.physics ? 1 : 0;
    }

    this.ensureCapacity(instanceId, values.byteLength);
    this.backend.writeBytes(instanceId, this.pointer!, new Uint8Array(values));

    return { pointer: this.pointer!, length: edges.length };
  }

  public destroy(): void {
    this.pointer = null;
    this.capacity = 0;
    this.instanceId = null;
  }

  private ensureCapacity(instanceId: number, byteLength: number): void {
    if (this.pointer !== null && this.capacity >= byteLength) return;

    this.pointer = this.backend.allocate(
      instanceId,
      Math.max(byteLength, EDGE_BYTES),
    );
    this.capacity = Math.max(byteLength, EDGE_BYTES);
  }

  private getInstanceId(): number {
    if (this.instanceId === null) {
      throw new Error("WASM edge transformer is not attached to an algorithm instance.");
    }

    return this.instanceId;
  }
}
