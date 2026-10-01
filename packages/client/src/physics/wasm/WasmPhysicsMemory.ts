import { PointGraphManager } from "@core/collections/PointGraphManager";

const POINT_STRIDE = 4;
const BYTES_PER_FLOAT = Float32Array.BYTES_PER_ELEMENT;
const WASM_PAGE_SIZE = 65536;

interface WasmExports {
  memory: WebAssembly.Memory;
  z_damping: (
    pointer: number,
    length: number,
    dampingFactor: number,
    threshold: number,
  ) => number;
}

export class WasmPhysicsMemory {
  private readonly memory: WebAssembly.Memory;
  private readonly zDamping: WasmExports["z_damping"];
  private pointsBuffer = new Float32Array();

  public constructor(
    private readonly pointGraphManager: PointGraphManager,
    instance: WebAssembly.Instance,
    public readonly sourceUrl: URL,
  ) {
    const exports = instance.exports as unknown as Partial<WasmExports>;

    if (!exports.memory || !exports.z_damping) {
      throw new Error("WASM Z-damping module has invalid exports.");
    }

    this.memory = exports.memory;
    this.zDamping = exports.z_damping;
  }

  public applyZDamping(
    dampingFactor: number,
    threshold: number,
  ): number {
    const points = this.pointGraphManager.getPointsArray();

    if (points.length === 0) {
      return 0;
    }

    this.ensureCapacity(points.length);

    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      const offset = index * POINT_STRIDE;

      this.pointsBuffer[offset] = point.x;
      this.pointsBuffer[offset + 1] = point.y;
      this.pointsBuffer[offset + 2] = point.z;
      this.pointsBuffer[offset + 3] = point.fixed ? 1 : 0;
    }

    const temperature = this.zDamping(
      0,
      points.length,
      dampingFactor,
      threshold,
    );

    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      const offset = index * POINT_STRIDE;

      point.x = this.pointsBuffer[offset];
      point.y = this.pointsBuffer[offset + 1];
      point.z = this.pointsBuffer[offset + 2];
    }

    return temperature;
  }

  public destroy(): void {
    this.pointsBuffer = new Float32Array();
  }

  private ensureCapacity(length: number): void {
    const requiredBytes = length * POINT_STRIDE * BYTES_PER_FLOAT;
    const availableBytes = this.memory.buffer.byteLength;

    if (requiredBytes > availableBytes) {
      const requiredPages = Math.ceil(
        (requiredBytes - availableBytes) / WASM_PAGE_SIZE,
      );

      this.memory.grow(requiredPages);
    }

    this.pointsBuffer = new Float32Array(
      this.memory.buffer,
      0,
      length * POINT_STRIDE,
    );
  }
}
