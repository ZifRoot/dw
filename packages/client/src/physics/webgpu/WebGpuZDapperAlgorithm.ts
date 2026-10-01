import { AppMediator } from "@core/AppMediator";
import { PointGraphManager } from "@core/collections/PointGraphManager";
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
  private executionPending = false;

  public constructor(
    mediator: AppMediator,
    pointGraphManager: PointGraphManager,
    public readonly config: ZDampingConfig,
    private readonly backend: WebGpuBackend,
    transformer: WebGpuPointsTransformer,
  ) {
    super(mediator, pointGraphManager);

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

  public async initialize(sourceUrl: URL): Promise<void> {
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

  protected applyStep(_deltaTime: number): number {
    if (this.executionPending) {
      return this.config.stopTemperature;
    }

    const instanceId = this.getInstanceId();
    const updatePipeline = this.getUpdatePipeline();
    const reductionPipeline = this.getReductionPipeline();
    const data = this.transformer.load();

    if (data.count === 0) {
      return 0;
    }

    const workgroupCount = Math.ceil(data.count / WORKGROUP_SIZE);

    if (workgroupCount > MAX_WORKGROUP_COUNT) {
      throw new Error(
        `WebGPU Z-damping supports at most ${MAX_WORKGROUP_COUNT * WORKGROUP_SIZE} points in the two-pass reduction prototype.`,
      );
    }

    const parameters = new ArrayBuffer(PARAMETER_BUFFER_SIZE);
    const floatParameters = new Float32Array(parameters);
    const uintParameters = new Uint32Array(parameters);

    floatParameters[0] = this.config.dampingFactor;
    floatParameters[1] = this.config.threshold;
    uintParameters[2] = data.count;
    uintParameters[3] = workgroupCount;

    this.backend.writeBuffer(
      this.parametersBuffer,
      new Uint8Array(parameters),
    );

    const bindGroup = this.backend.createBindGroup(
      updatePipeline,
      [
        data.buffer,
        this.workgroupMaximaBuffer,
        this.temperatureBuffer,
        this.parametersBuffer,
      ],
    );

    const copyCommands = [
      {
        source: data.buffer,
        sourceOffset: 0,
        destination: data.readback,
        destinationOffset: 0,
        size: data.byteLength,
      },
      {
        source: this.temperatureBuffer,
        sourceOffset: 0,
        destination: this.temperatureReadbackBuffer,
        destinationOffset: 0,
        size: TEMPERATURE_BYTES,
      },
    ];

    this.executionPending = true;

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
      copyCommands,
    );

    void Promise.all([
      this.transformer.save(data.readback),
      this.backend.readBuffer(this.temperatureReadbackBuffer),
    ])
      .then(([, temperatureData]) => {
        this.temperature = new Float32Array(temperatureData)[0];
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

  public destroy(): void {
    this.temperatureBuffer.destroy();
    this.workgroupMaximaBuffer.destroy();
    this.parametersBuffer.destroy();
    this.temperatureReadbackBuffer.destroy();
    this.transformer.destroy();

    if (this.instanceId !== null) {
      this.backend.destroyInstance(this.instanceId);
      this.instanceId = null;
    }
  }

  private getInstanceId(): number {
    if (this.instanceId === null) {
      throw new Error("WebGPU Z-damping algorithm is not initialized.");
    }

    return this.instanceId;
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
