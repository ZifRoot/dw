import { AppMediator } from "@core/AppMediator";
import { BaseAlgorithm } from "@core/Engines/BaseAlgorithm";
import { PointGraphManager } from "@core/collections/PointGraphManager";
import { ZDampingConfig } from "../ZDapperAlgorithm";
import { WebGpuPhysicsMemory } from "./WebGpuPhysicsMemory";

const sourceUrl = new URL("./z-damping.wgsl", import.meta.url);

export class WebGpuZDapperAlgorithm extends BaseAlgorithm {
  private executionPending = false;

  private constructor(
    mediator: AppMediator,
    pointGraphManager: PointGraphManager,
    public readonly config: ZDampingConfig,
    private readonly memory: WebGpuPhysicsMemory,
    public readonly sourceUrl: URL,
  ) {
    super(mediator, pointGraphManager);
  }

  public static async create(
    mediator: AppMediator,
    pointGraphManager: PointGraphManager,
    config: ZDampingConfig,
  ): Promise<WebGpuZDapperAlgorithm> {
    if (!WebGpuPhysicsMemory.isSupported()) {
      throw new Error("WebGPU is not supported by this browser.");
    }

    const response = await fetch(sourceUrl);
    if (!response.ok) {
      throw new Error(`Unable to load WebGPU shader source: HTTP ${response.status}.`);
    }

    const sourceCode = await response.text();
    const memory = await WebGpuPhysicsMemory.create(
      pointGraphManager,
      sourceCode,
      sourceUrl,
    );

    return new WebGpuZDapperAlgorithm(
      mediator,
      pointGraphManager,
      config,
      memory,
      sourceUrl,
    );
  }

  protected applyStep(_deltaTime: number): number {
    if (this.executionPending) {
      return this.config.stopTemperature;
    }

    this.executionPending = true;

    void this.memory
      .applyZDamping(this.config.dampingFactor, this.config.threshold)
      .then((temperature) => {
        this.temperature = temperature;
      })
      .catch((error: unknown) => {
        console.error("WebGPU Z-damping execution failed.", error);
        this.stop();
      })
      .finally(() => {
        this.executionPending = false;
      });

    return this.config.stopTemperature;
  }

  public getStopTemperature(): number {
    return this.config.stopTemperature;
  }
}
