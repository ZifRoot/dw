import { AppMediator } from "@core/AppMediator";
import { BaseAlgorithm } from "@core/Engines/BaseAlgorithm";
import { WebGpuBackend, WebGpuBuffer, WebGpuComputePipeline } from "@core/Backends/WebGpuBackend";
import { GraphEngineConfig } from "../GraphAlgorithm";
import { WebGpuPointsTransformer } from "./WebGpuPointsTransformer";
import { WebGpuEdgesTransformer } from "./WebGpuEdgesTransformer";

const WORKGROUP_SIZE = 256;
const MAX_WORKGROUP_COUNT = 256;
const PARAMETER_BYTES = 16;

export class WebGpuGraphAlgorithm extends BaseAlgorithm {
  private pipeline: WebGpuComputePipeline | null = null;
  private reductionPipeline: WebGpuComputePipeline | null = null;
  private readonly temperatureBuffer: WebGpuBuffer;
  private readonly maximaBuffer: WebGpuBuffer;
  private readonly parametersBuffer: WebGpuBuffer;
  private readonly temperatureReadback: WebGpuBuffer;
  private instanceId: number | null = null;

  public constructor(
    mediator: AppMediator,
    public readonly config: GraphEngineConfig,
    private readonly backend: WebGpuBackend,
    private readonly pointsTransformer: WebGpuPointsTransformer,
    private readonly edgesTransformer: WebGpuEdgesTransformer,
  ) {
    super(mediator);
    const usage = backend.getBufferUsage();
    this.temperatureBuffer = backend.createBuffer(4, usage.STORAGE | usage.COPY_SRC);
    this.maximaBuffer = backend.createBuffer(MAX_WORKGROUP_COUNT * 4, usage.STORAGE | usage.COPY_DST);
    this.parametersBuffer = backend.createBuffer(PARAMETER_BYTES, usage.UNIFORM | usage.COPY_DST);
    this.temperatureReadback = backend.createBuffer(4, usage.MAP_READ | usage.COPY_DST);
  }

  public async initialize(): Promise<void> {
    const sourceUrl = new URL("./graph.wgsl", import.meta.url);
    this.instanceId = await this.backend.createInstance(sourceUrl);
    this.pipeline = this.backend.createComputePipeline(this.instanceId, "graph");
    this.reductionPipeline = this.backend.createComputePipeline(this.instanceId, "reduceTemperature");
  }

  public async executeAsyncStep(_deltaTime: number): Promise<number> {
    if (!this.pipeline || !this.reductionPipeline) {
      throw new Error("WebGPU Graph algorithm is not initialized.");
    }

    const pointCount = this.pointsTransformer.getCount();
    this.edgesTransformer.load();
    const edgeCount = this.edgesTransformer.getCount();
    if (pointCount === 0 || edgeCount === 0) return 0;

    const workgroupCount = Math.ceil(pointCount / WORKGROUP_SIZE);
    if (workgroupCount > MAX_WORKGROUP_COUNT) {
      throw new Error("WebGPU Graph prototype supports at most 65536 points.");
    }

    const data = new ArrayBuffer(PARAMETER_BYTES);
    const floats = new Float32Array(data);
    const uints = new Uint32Array(data);
    floats[0] = this.config.strength;
    uints[1] = pointCount;
    uints[2] = edgeCount;
    uints[3] = workgroupCount;
    this.backend.writeBuffer(this.parametersBuffer, new Uint8Array(data));

    const bindGroup = this.backend.createBindGroup(this.pipeline, [
      this.pointsTransformer.getPointBuffer(),
      this.edgesTransformer.getBuffer(),
      this.pointsTransformer.getScratchBuffer(),
      this.parametersBuffer,
      this.maximaBuffer,
      this.temperatureBuffer,
    ]);

    this.backend.submit([
      { pipeline: this.pipeline, bindGroup, workgroupCount },
      { pipeline: this.reductionPipeline, bindGroup, workgroupCount: 1 },
    ], [
      {
        source: this.pointsTransformer.getScratchBuffer(),
        sourceOffset: 0,
        destination: this.pointsTransformer.getPointBuffer(),
        destinationOffset: 0,
        size: this.pointsTransformer.getByteLength(),
      },
      {
        source: this.temperatureBuffer,
        sourceOffset: 0,
        destination: this.temperatureReadback,
        destinationOffset: 0,
        size: 4,
      },
    ]);

    const dataOut = await this.backend.readBuffer(this.temperatureReadback);
    return new Float32Array(dataOut)[0];
  }

  protected applyStep(): number {
    throw new Error("WebGPU Graph requires async AnimationEngine support.");
  }

  public getStopTemperature(): number { return this.config.stopTemperature; }

  public destroy(): void {
    this.temperatureBuffer.destroy();
    this.maximaBuffer.destroy();
    this.parametersBuffer.destroy();
    this.temperatureReadback.destroy();
    this.edgesTransformer.destroy();
    if (this.instanceId !== null) this.backend.destroyInstance(this.instanceId);
    this.instanceId = null;
    this.pipeline = null;
    this.reductionPipeline = null;
  }
}
