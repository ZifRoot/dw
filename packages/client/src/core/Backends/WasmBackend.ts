import { Backend } from "./Backend";

const WASM_PAGE_SIZE = 65536;
const FLOAT_ALIGNMENT = Float32Array.BYTES_PER_ELEMENT;

interface WasmModuleExports {
  memory: WebAssembly.Memory;
}

interface WasmInstanceState {
  instance: WebAssembly.Instance;
  memory: WebAssembly.Memory;
  nextPointer: number;
}

export class WasmBackend extends Backend {
  private nextInstanceId = 1;
  private readonly instances = new Map<number, WasmInstanceState>();

  private constructor() {
    super();
  }

  public static async create(): Promise<WasmBackend> {
    if (typeof WebAssembly === "undefined") {
      throw new Error("WebAssembly is not supported by this browser.");
    }

    return new WasmBackend();
  }

  public async createInstance(moduleUrl: URL): Promise<number> {
    const response = await fetch(moduleUrl);

    if (!response.ok) {
      throw new Error(
        `Unable to load WebAssembly module: HTTP ${response.status}.`,
      );
    }

    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    const exports = instance.exports as unknown as Partial<WasmModuleExports>;

    if (!exports.memory) {
      throw new Error("WebAssembly module does not export memory.");
    }

    const instanceId = this.nextInstanceId++;
    this.instances.set(instanceId, {
      instance,
      memory: exports.memory,
      nextPointer: 0,
    });

    return instanceId;
  }

  public allocate(instanceId: number, byteLength: number): number {
    const state = this.getInstance(instanceId);
    const alignedLength = this.align(byteLength);
    const pointer = this.getNextPointer(state);
    const requiredBytes = pointer + alignedLength;

    this.ensureCapacity(state.memory, requiredBytes);
    this.setNextPointer(state, requiredBytes);

    return pointer;
  }

  public writeFloat32(
    instanceId: number,
    pointer: number,
    values: Float32Array,
  ): void {
    const memory = this.getInstance(instanceId).memory;
    const target = new Float32Array(
      memory.buffer,
      pointer,
      values.length,
    );

    target.set(values);
  }

  public readFloat32(
    instanceId: number,
    pointer: number,
    length: number,
  ): Float32Array {
    const memory = this.getInstance(instanceId).memory;
    const source = new Float32Array(memory.buffer, pointer, length);

    return new Float32Array(source);
  }

  public invoke(
    instanceId: number,
    exportName: string,
    args: number[],
  ): number {
    const instance = this.getInstance(instanceId).instance;
    const exportedFunction = instance.exports[exportName];

    if (typeof exportedFunction !== "function") {
      throw new Error(
        `WebAssembly module does not export function "${exportName}".`,
      );
    }

    const result = exportedFunction(...args);
    return typeof result === "number" ? result : 0;
  }

  public destroyInstance(instanceId: number): void {
    this.instances.delete(instanceId);
  }

  public destroy(): void {
    this.instances.clear();
  }

  private getInstance(instanceId: number): WasmInstanceState {
    const state = this.instances.get(instanceId);

    if (!state) {
      throw new Error(`WebAssembly instance "${instanceId}" does not exist.`);
    }

    return state;
  }

  private getNextPointer(state: WasmInstanceState): number {
    return state.nextPointer;
  }

  private setNextPointer(state: WasmInstanceState, value: number): void {
    state.nextPointer = value;
  }

  private align(byteLength: number): number {
    return Math.ceil(byteLength / FLOAT_ALIGNMENT) * FLOAT_ALIGNMENT;
  }

  private ensureCapacity(
    memory: WebAssembly.Memory,
    requiredBytes: number,
  ): void {
    const availableBytes = memory.buffer.byteLength;

    if (requiredBytes <= availableBytes) {
      return;
    }

    const requiredPages = Math.ceil(
      (requiredBytes - availableBytes) / WASM_PAGE_SIZE,
    );

    memory.grow(requiredPages);
  }
}
