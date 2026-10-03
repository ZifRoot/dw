import { AppMediator } from "@core/AppMediator";
import { BaseAlgorithm } from "@core/Engines/BaseAlgorithm";
import { WebGpuBackend, WebGpuBuffer, WebGpuComputePipeline } from "@core/Backends/WebGpuBackend";
import { RepulsionEngineConfig } from "../RepulsionAlgorithm";
import { WebGpuPointsTransformer } from "./WebGpuPointsTransformer";

const WORKGROUP_SIZE = 256;
const MAX_WORKGROUP_COUNT = 256;
const PARAMETER_BYTES = 32;

export class WebGpuRepulsionAlgorithm extends BaseAlgorithm {
  private pipeline: WebGpuComputePipeline | null = null;
  private reductionPipeline: WebGpuComputePipeline | null = null;
  private readonly temperatureBuffer: WebGpuBuffer;
  private readonly maximaBuffer: WebGpuBuffer;
  private readonly parametersBuffer: WebGpuBuffer;
  private readonly temperatureReadback: WebGpuBuffer;
  private instanceId: number | null = null;

  public constructor(
    mediator: AppMediator,
    public readonly config: RepulsionEngineConfig,
    private readonly backend: WebGpuBackend,
    private readonly transformer: WebGpuPointsTransformer,
  ) {
    super(mediator);
    const usage = backend.getBufferUsage();
    this.temperatureBuffer = backend.createBuffer(4, usage.STORAGE | usage.COPY_SRC);
    this.maximaBuffer = backend.createBuffer(MAX_WORKGROUP_COUNT * 4, usage.STORAGE | usage.COPY_DST);
    this.parametersBuffer = backend.createBuffer(PARAMETER_BYTES, usage.UNIFORM | usage.COPY_DST);
    this.temperatureReadback = backend.createBuffer(4, usage.MAP_READ | usage.COPY_DST);
  }

  public async initialize(): Promise<void> {
    const sourceUrl = new URL("./repulsion.wgsl", import.meta.url);
    this.instanceId = await this.backend.createInstance(sourceUrl);
    this.pipeline = this.backend.createComputePipeline(this.instanceId, "repulsion");
    this.reductionPipeline = this.backend.createComputePipeline(this.instanceId, "reduceTemperature");
  }

  public async executeAsyncStep(_deltaTime: number): Promise<number> {
    if (!this.pipeline || !this.reductionPipeline) {
      throw new Error("WebGPU Repulsion algorithm is not initialized.");
    }

    const count = this.transformer.getCount();
    if (count === 0) return 0;

    const workgroupCount = Math.ceil(count / WORKGROUP_SIZE);
    if (workgroupCount > MAX_WORKGROUP_COUNT) {
      throw new Error("WebGPU Repulsion prototype supports at most 65536 points.");
    }

    this.writeParameters(count, workgroupCount);
    const bindGroup = this.backend.createBindGroup(this.pipeline, [
      this.transformer.getPointBuffer(),
      this.transformer.getScratchBuffer(),
      this.parametersBuffer,
      this.maximaBuffer,
      this.temperatureBuffer,
    ]);

    this.backend.submit([
      { pipeline: this.pipeline, bindGroup, workgroupCount },
      { pipeline: this.reductionPipeline, bindGroup, workgroupCount: 1 },
    ], [
      {
        source: this.transformer.getScratchBuffer(),
        sourceOffset: 0,
        destination: this.transformer.getPointBuffer(),
        destinationOffset: 0,
        size: this.transformer.getByteLength(),
      },
      {
        source: this.temperatureBuffer,
        sourceOffset: 0,
        destination: this.temperatureReadback,
        destinationOffset: 0,
        size: 4,
      },
    ]);

    const data = await this.backend.readBuffer(this.temperatureReadback);
    return new Float32Array(data)[0];
  }

  protected applyStep(): number {
    throw new Error("WebGPU Repulsion requires async AnimationEngine support.");
  }

  public getStopTemperature(): number { return this.config.stopTemperature; }

  public destroy(): void {
    this.temperatureBuffer.destroy();
    this.maximaBuffer.destroy();
    this.parametersBuffer.destroy();
    this.temperatureReadback.destroy();
    if (this.instanceId !== null) this.backend.destroyInstance(this.instanceId);
    this.instanceId = null;
    this.pipeline = null;
    this.reductionPipeline = null;
  }

  private writeParameters(count: number, workgroupCount: number): void {
    const data = new ArrayBuffer(PARAMETER_BYTES);
    const floats = new Float32Array(data);
    const uints = new Uint32Array(data);
    floats[0] = this.config.repulsionStrength;
    floats[1] = this.config.minDistance;
    floats[2] = this.config.targetDistance;
    floats[3] = this.config.epsilon;
    floats[4] = this.config.stopTemperature;
    uints[5] = count;
    uints[6] = workgroupCount;
    this.backend.writeBuffer(this.parametersBuffer, new Uint8Array(data));
  }
}
