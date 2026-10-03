import { AppMediator } from "@core/AppMediator";
import { BaseAlgorithm } from "@core/Engines/BaseAlgorithm";
import {
  WebGpuBackend,
  WebGpuBuffer,
  WebGpuComputePipeline,
} from "@core/Backends/WebGpuBackend";
import { ZDampingConfig } from "../ZDapperAlgorithm";
import { WebGpuPointsTransformer } from "./WebGpuPointsTransformer";

const WORKGROUP_SIZE = 256;
const MAX_WORKGROUP_COUNT = 256;
const BYTES_PER_FLOAT = Float32Array.BYTES_PER_ELEMENT;
const TEMPERATURE_BYTES = BYTES_PER_FLOAT;
const PARAMETER_BUFFER_SIZE =
  BYTES_PER_FLOAT * 2 + Uint32Array.BYTES_PER_ELEMENT * 2;

export class WebGpuZDapperAlgorithm extends BaseAlgorithm {
  private updatePipeline: WebGpuComputePipeline | null = null;
  private reductionPipeline: WebGpuComputePipeline | null = null;
  private readonly transformer: WebGpuPointsTransformer;
  private readonly temperatureBuffer: WebGpuBuffer;
  private readonly workgroupMaximaBuffer: WebGpuBuffer;
  private readonly parametersBuffer: WebGpuBuffer;
  private readonly temperatureReadbackBuffer: WebGpuBuffer;
  private instanceId: number | null = null;

  public constructor(
    mediator: AppMediator,
    public readonly config: ZDampingConfig,
    private readonly backend: WebGpuBackend,
    transformer: WebGpuPointsTransformer,
  ) {
    super(mediator);

    this.transformer = transformer;
    this.temperatureBuffer = backend.createBuffer(
      TEMPERATURE_BYTES,
      backend.getBufferUsage().STORAGE | backend.getBufferUsage().COPY_SRC,
    );
    this.workgroupMaximaBuffer = backend.createBuffer(
      MAX_WORKGROUP_COUNT * BYTES_PER_FLOAT,
      backend.getBufferUsage().STORAGE | backend.getBufferUsage().COPY_DST,
    );
    this.parametersBuffer = backend.createBuffer(
      PARAMETER_BUFFER_SIZE,
      backend.getBufferUsage().UNIFORM | backend.getBufferUsage().COPY_DST,
    );
    this.temperatureReadbackBuffer = backend.createBuffer(
      TEMPERATURE_BYTES,
      backend.getBufferUsage().MAP_READ |
        backend.getBufferUsage().COPY_DST,
    );
  }

  public async initialize(): Promise<void> {
    const sourceUrl = new URL("./z-damping.wgsl", import.meta.url);
    const instanceId = await this.backend.createInstance(sourceUrl);
    this.instanceId = instanceId;
    this.updatePipeline = this.backend.createComputePipeline(
      instanceId,
      "updatePoints",
    );
    this.reductionPipeline = this.backend.createComputePipeline(
      instanceId,
      "reduceTemperature",
    );
  }

  /**
   * Асинхронный шаг, который будет использован после добавления async
   * callback contract в AnimationEngine.
   */
  public async executeAsyncStep(_deltaTime: number): Promise<number> {
    return this.executeGpuStep();
  }

  /**
   * Текущий синхронный BaseAlgorithm не может ожидать WebGPU readback.
   * Реальный GPU шаг намеренно вынесен в executeAsyncStep().
   */
  protected applyStep(_deltaTime: number): number {
    throw new Error(
      "WebGPU Z-damping requires async AnimationEngine support.",
    );
  }

  private async executeGpuStep(): Promise<number> {
    const updatePipeline = this.getUpdatePipeline();
    const reductionPipeline = this.getReductionPipeline();

    const count = this.transformer.getCount();
    if (count === 0) {
      return 0;
    }

    const workgroupCount = Math.ceil(count / WORKGROUP_SIZE);

    if (workgroupCount > MAX_WORKGROUP_COUNT) {
      throw new Error(
        `WebGPU Z-damping supports at most ${MAX_WORKGROUP_COUNT * WORKGROUP_SIZE} points in the two-pass reduction prototype.`,
      );
    }

    this.writeParameters(count, workgroupCount);

    const pointsBuffer = this.transformer.getPointBuffer();
    const readbackBuffer = this.transformer.getReadbackBuffer();
    const bindGroup = this.backend.createBindGroup(updatePipeline, [
      pointsBuffer,
      this.workgroupMaximaBuffer,
      this.temperatureBuffer,
      this.parametersBuffer,
    ]);

    this.backend.submit(
      [
        {
          pipeline: updatePipeline,
          bindGroup,
          workgroupCount,
        },
        {
          pipeline: reductionPipeline,
          bindGroup,
          workgroupCount: 1,
        },
      ],
      [
        {
          source: pointsBuffer,
          sourceOffset: 0,
          destination: readbackBuffer,
          destinationOffset: 0,
          size: this.transformer.getByteLength(),
        },
        {
          source: this.temperatureBuffer,
          sourceOffset: 0,
          destination: this.temperatureReadbackBuffer,
          destinationOffset: 0,
          size: TEMPERATURE_BYTES,
        },
      ],
    );

    try {
      const temperatureData = await this.backend.readBuffer(this.temperatureReadbackBuffer);
      return new Float32Array(temperatureData)[0];
    } catch (error: unknown) {
      console.error("WebGPU Z-damping execution failed.", error);
      this.stop();
      return 0;
    }
  }

  public getStopTemperature(): number {
    return this.config.stopTemperature;
  }

  public destroy(): void {
    this.temperatureBuffer.destroy();
    this.workgroupMaximaBuffer.destroy();
    this.parametersBuffer.destroy();
    this.temperatureReadbackBuffer.destroy();
    if (this.instanceId !== null) {
      this.backend.destroyInstance(this.instanceId);
      this.instanceId = null;
    }
  }

  private writeParameters(count: number, workgroupCount: number): void {
    const parameters = new ArrayBuffer(PARAMETER_BUFFER_SIZE);
    const floatParameters = new Float32Array(parameters);
    const uintParameters = new Uint32Array(parameters);

    floatParameters[0] = this.config.dampingFactor;
    floatParameters[1] = this.config.threshold;
    uintParameters[2] = count;
    uintParameters[3] = workgroupCount;

    this.backend.writeBuffer(this.parametersBuffer, new Uint8Array(parameters));
  }

  private getUpdatePipeline(): WebGpuComputePipeline {
    if (!this.updatePipeline) {
      throw new Error("WebGPU Z-damping update pipeline is not initialized.");
    }

    return this.updatePipeline;
  }

  private getReductionPipeline(): WebGpuComputePipeline {
    if (!this.reductionPipeline) {
      throw new Error("WebGPU Z-damping reduction pipeline is not initialized.");
    }

    return this.reductionPipeline;
  }
}
