import { AppMediator } from "@core/AppMediator";
import { PointGraphManager } from "@core/collections/PointGraphManager";
import { BaseAlgorithm } from "@core/Engines/BaseAlgorithm";
import { ZDampingConfig } from "../ZDapperAlgorithm";
import { WasmPhysicsMemory } from "./WasmPhysicsMemory";

const wasmModuleUrl = new URL("./z-damping.wasm", import.meta.url);
const sourceUrl = new URL("./z-damping.cpp", import.meta.url);

interface WasmAlgorithmExports {
  memory: WebAssembly.Memory;
  z_damping: (
    pointer: number,
    length: number,
    dampingFactor: number,
    threshold: number,
  ) => number;
}

export class WasmZDapperAlgorithm extends BaseAlgorithm {
  private constructor(
    mediator: AppMediator,
    pointGraphManager: PointGraphManager,
    public readonly config: ZDampingConfig,
    private readonly memory: WasmPhysicsMemory,
    public readonly sourceUrl: URL,
    private readonly instance: WebAssembly.Instance,
  ) {
    super(mediator, pointGraphManager);
  }

  public static async create(
    mediator: AppMediator,
    pointGraphManager: PointGraphManager,
    config: ZDampingConfig,
  ): Promise<WasmZDapperAlgorithm> {
    if (typeof WebAssembly === "undefined") {
      throw new Error("WebAssembly is not supported by this browser.");
    }

    const sourceResponse = await fetch(sourceUrl);
    if (!sourceResponse.ok) {
      throw new Error(`Unable to load WASM source: HTTP ${sourceResponse.status}.`);
    }

    const response = await fetch(wasmModuleUrl);
    if (!response.ok) {
      throw new Error(`Unable to load WASM module: HTTP ${response.status}.`);
    }

    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes, {});
    const exports = instance.exports as unknown as Partial<WasmAlgorithmExports>;

    if (!exports.memory || !exports.z_damping) {
      throw new Error("WASM Z-damping module has invalid exports.");
    }

    const memory = new WasmPhysicsMemory(
      pointGraphManager,
      instance,
      sourceUrl,
    );

    return new WasmZDapperAlgorithm(
      mediator,
      pointGraphManager,
      config,
      memory,
      sourceUrl,
      instance,
    );
  }

  protected applyStep(_deltaTime: number): number {
    return this.memory.applyZDamping(
      this.config.dampingFactor,
      this.config.threshold,
    );
  }

  public getStopTemperature(): number {
    return this.config.stopTemperature;
  }
}
