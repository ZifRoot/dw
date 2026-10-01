import { PointGraphManager } from "@core/collections/PointGraphManager";

const wasmModuleUrl = new URL("./z-damping.wasm", import.meta.url);

interface WasmExports {
  memory: WebAssembly.Memory;
  z_damping: (pointer: number, length: number, dampingFactor: number) => void;
}

export class WasmPhysicsMemory {
  private readonly memory: WebAssembly.Memory;
  private readonly zDamping: WasmExports["z_damping"];
  private zBuffer = new Float32Array();

  private constructor(
    private readonly pointGraphManager: PointGraphManager,
    instance: WebAssembly.Instance,
  ) {
    const exports = instance.exports as unknown as Partial<WasmExports>;

    if (!exports.memory || !exports.z_damping) {
      throw new Error("WASM Z-damping module has invalid exports.");
    }

    this.memory = exports.memory;
    this.zDamping = exports.z_damping;
  }

  public static isSupported(): boolean {
    return typeof WebAssembly !== "undefined";
  }

  public static async create(
    pointGraphManager: PointGraphManager,
  ): Promise<WasmPhysicsMemory> {
    if (!WasmPhysicsMemory.isSupported()) {
      throw new Error("WebAssembly is not supported by this browser.");
    }

    const response = await fetch(wasmModuleUrl);
    if (!response.ok) {
      throw new Error(`Unable to load WASM module: HTTP ${response.status}.`);
    }

    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});

    return new WasmPhysicsMemory(pointGraphManager, instance);
  }

  public applyZDamping(
    dampingFactor: number,
    threshold: number,
  ): number {
    const activePoints = this.pointGraphManager
      .getPointsArray()
      .filter((point) => !point.fixed && Math.abs(point.z) > threshold);

    if (activePoints.length === 0) return 0;

    this.ensureCapacity(activePoints.length);
    this.zBuffer.set(activePoints.map((point) => point.z));

    this.zDamping(0, activePoints.length, dampingFactor);

    for (let index = 0; index < activePoints.length; index++) {
      const point = activePoints[index];
      point.z = this.zBuffer[index];

      if (Math.abs(point.z) < 1e-6) {
        point.z = 0;
      }
    }

    return 3;
  }

  public destroy(): void {
    this.zBuffer = new Float32Array();
  }

  private ensureCapacity(length: number): void {
    const requiredBytes = length * Float32Array.BYTES_PER_ELEMENT;
    const availableBytes = this.memory.buffer.byteLength;

    if (requiredBytes > availableBytes) {
      const requiredPages = Math.ceil(
        (requiredBytes - availableBytes) / 65536,
      );

      this.memory.grow(requiredPages);
    }

    this.zBuffer = new Float32Array(this.memory.buffer, 0, length);
  }
}
