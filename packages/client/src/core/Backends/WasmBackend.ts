import { Backend } from "./Backend";

const WASM_PAGE_SIZE = 65536;
const FLOAT_ALIGNMENT = Float32Array.BYTES_PER_ELEMENT;
const INITIAL_DATA_POINTER = WASM_PAGE_SIZE;

interface WasmModuleExports { memory?: WebAssembly.Memory; }
interface WasmAllocator { nextPointer: number; }
interface WasmInstanceState { instance: WebAssembly.Instance; memory: WebAssembly.Memory; allocator: WasmAllocator; }

export class WasmBackend extends Backend {
  private nextInstanceId = 1;
  private readonly instances = new Map<number, WasmInstanceState>();
  private constructor() { super(); }

  public static async create(): Promise<WasmBackend> {
    if (typeof WebAssembly === "undefined") throw new Error("WebAssembly is not supported by this browser.");
    return new WasmBackend();
  }

  public createMemory(initialPages = 2, maximumPages = 1024): WebAssembly.Memory {
    return new WebAssembly.Memory({ initial: initialPages, maximum: maximumPages });
  }

  public async createInstance(moduleUrl: URL, memory?: WebAssembly.Memory): Promise<number> {
    const response = await fetch(moduleUrl);
    if (!response.ok) throw new Error(`Unable to load WebAssembly module: HTTP ${response.status}.`);
    const bytes = await response.arrayBuffer();
    const imports = memory ? { env: { memory } } : {};
    const { instance } = await WebAssembly.instantiate(bytes, imports);
    const exports = instance.exports as unknown as WasmModuleExports;
    const instanceMemory = memory ?? exports.memory;
    if (!instanceMemory) throw new Error("WebAssembly module does not provide memory.");

    const allocator = this.findAllocator(instanceMemory) ?? { nextPointer: INITIAL_DATA_POINTER };
    const instanceId = this.nextInstanceId++;
    this.instances.set(instanceId, { instance, memory: instanceMemory, allocator });
    return instanceId;
  }

  public allocate(instanceId: number, byteLength: number): number {
    const state = this.getInstance(instanceId);
    const alignedLength = this.align(byteLength);
    const pointer = state.allocator.nextPointer;
    this.ensureCapacity(state.memory, pointer + alignedLength);
    state.allocator.nextPointer = pointer + alignedLength;
    return pointer;
  }

  public writeFloat32(instanceId: number, pointer: number, values: Float32Array): void {
    new Float32Array(this.getInstance(instanceId).memory.buffer, pointer, values.length).set(values);
  }

  public writeBytes(instanceId: number, pointer: number, values: Uint8Array): void {
    new Uint8Array(this.getInstance(instanceId).memory.buffer, pointer, values.byteLength).set(values);
  }

  public readFloat32(instanceId: number, pointer: number, length: number): Float32Array {
    return new Float32Array(new Float32Array(this.getInstance(instanceId).memory.buffer, pointer, length));
  }

  public invoke(instanceId: number, exportName: string, args: number[]): number {
    const exportedFunction = this.getInstance(instanceId).instance.exports[exportName];
    if (typeof exportedFunction !== "function") throw new Error(`WebAssembly module does not export function "${exportName}".`);
    const result = exportedFunction(...args);
    return typeof result === "number" ? result : 0;
  }

  public destroyInstance(instanceId: number): void { this.instances.delete(instanceId); }
  public destroy(): void { this.instances.clear(); }

  private getInstance(instanceId: number): WasmInstanceState {
    const state = this.instances.get(instanceId);
    if (!state) throw new Error(`WebAssembly instance "${instanceId}" does not exist.`);
    return state;
  }

  private findAllocator(memory: WebAssembly.Memory): WasmAllocator | null {
    for (const state of this.instances.values()) if (state.memory === memory) return state.allocator;
    return null;
  }

  private align(byteLength: number): number {
    return Math.ceil(byteLength / FLOAT_ALIGNMENT) * FLOAT_ALIGNMENT;
  }

  private ensureCapacity(memory: WebAssembly.Memory, requiredBytes: number): void {
    const availableBytes = memory.buffer.byteLength;
    if (requiredBytes <= availableBytes) return;
    memory.grow(Math.ceil((requiredBytes - availableBytes) / WASM_PAGE_SIZE));
  }
}
