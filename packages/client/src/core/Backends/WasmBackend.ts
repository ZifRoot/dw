import { Backend } from "./Backend";

const WASM_PAGE_SIZE = 65536;
const FLOAT_ALIGNMENT = Float32Array.BYTES_PER_ELEMENT;

interface WasmModuleExports {
  memory: WebAssembly.Memory;
}

export class WasmBackend extends Backend {
  private nextPointer = 0;

  private constructor(
    private readonly instance: WebAssembly.Instance,
    private readonly memory: WebAssembly.Memory,
  ) {
    super();
  }

  public static async create(moduleUrl: URL): Promise<WasmBackend> {
    if (typeof WebAssembly === "undefined") {
      throw new Error("WebAssembly is not supported by this browser.");
    }

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

    return new WasmBackend(instance, exports.memory);
  }

  public allocate(byteLength: number): number {
    const alignedLength = this.align(byteLength);
    const pointer = this.nextPointer;
    const requiredBytes = pointer + alignedLength;

    this.ensureCapacity(requiredBytes);
    this.nextPointer = requiredBytes;

    return pointer;
  }

  public writeFloat32(
    pointer: number,
    values: Float32Array,
  ): void {
    const target = new Float32Array(
      this.memory.buffer,
      pointer,
      values.length,
    );

    target.set(values);
  }

  public readFloat32(
    pointer: number,
    length: number,
  ): Float32Array {
    const source = new Float32Array(
      this.memory.buffer,
      pointer,
      length,
    );

    return new Float32Array(source);
  }

  public invoke(exportName: string, args: number[]): number {
    const exportedFunction = this.instance.exports[exportName];

    if (typeof exportedFunction !== "function") {
      throw new Error(
        `WebAssembly module does not export function "${exportName}".`,
      );
    }

    const result = exportedFunction(...args);
    return typeof result === "number" ? result : 0;
  }

  public destroy(): void {
    this.nextPointer = 0;
  }

  private align(byteLength: number): number {
    return Math.ceil(byteLength / FLOAT_ALIGNMENT) * FLOAT_ALIGNMENT;
  }

  private ensureCapacity(requiredBytes: number): void {
    const availableBytes = this.memory.buffer.byteLength;

    if (requiredBytes <= availableBytes) {
      return;
    }

    const requiredPages = Math.ceil(
      (requiredBytes - availableBytes) / WASM_PAGE_SIZE,
    );

    this.memory.grow(requiredPages);
  }
}
