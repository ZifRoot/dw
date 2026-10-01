import { Backend } from "./Backend";

const BUFFER_USAGE = {
  MAP_READ: 0x0001,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
} as const;

const MAP_MODE_READ = 0x0001;

interface WebGpuApi {
  requestAdapter(): Promise<WebGpuAdapter | null>;
}

interface WebGpuAdapter {
  requestDevice(): Promise<WebGpuDevice>;
}

interface WebGpuDevice {
  createBuffer(descriptor: { size: number; usage: number }): WebGpuBuffer;
  createShaderModule(descriptor: { code: string }): unknown;
  createComputePipeline(descriptor: {
    layout: "auto";
    compute: { module: unknown; entryPoint: string };
  }): WebGpuComputePipeline;
  createBindGroup(descriptor: {
    layout: unknown;
    entries: Array<{ binding: number; resource: { buffer: WebGpuBuffer } }>;
  }): WebGpuBindGroup;
  createCommandEncoder(): WebGpuCommandEncoder;
  queue: WebGpuQueue;
}

export interface WebGpuBuffer {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

export interface WebGpuComputePipeline {
  getBindGroupLayout(index: number): unknown;
}

export interface WebGpuBindGroup {}

interface WebGpuQueue {
  writeBuffer(
    buffer: WebGpuBuffer,
    bufferOffset: number,
    data: ArrayBufferView,
  ): void;
  submit(commandBuffers: unknown[]): void;
}

interface WebGpuCommandEncoder {
  beginComputePass(): WebGpuComputePass;
  copyBufferToBuffer(
    source: WebGpuBuffer,
    sourceOffset: number,
    destination: WebGpuBuffer,
    destinationOffset: number,
    size: number,
  ): void;
  finish(): unknown;
}

interface WebGpuComputePass {
  setPipeline(pipeline: WebGpuComputePipeline): void;
  setBindGroup(index: number, bindGroup: WebGpuBindGroup): void;
  dispatchWorkgroups(count: number): void;
  end(): void;
}

export interface WebGpuComputeCommand {
  pipeline: WebGpuComputePipeline;
  bindGroup: WebGpuBindGroup;
  workgroupCount: number;
}

export interface WebGpuCopyCommand {
  source: WebGpuBuffer;
  sourceOffset: number;
  destination: WebGpuBuffer;
  destinationOffset: number;
  size: number;
}

export class WebGpuBackend extends Backend {
  private constructor(
    private readonly device: WebGpuDevice,
    private readonly shaderModule: unknown,
  ) {
    super();
  }

  public static isSupported(): boolean {
    return "gpu" in navigator;
  }

  public static async create(sourceUrl: URL): Promise<WebGpuBackend> {
    const gpu = (navigator as Navigator & { gpu?: WebGpuApi }).gpu;

    if (!gpu) {
      throw new Error("WebGPU is not supported by this browser.");
    }

    const adapter = await gpu.requestAdapter();

    if (!adapter) {
      throw new Error("WebGPU adapter is not available.");
    }

    const device = (await adapter.requestDevice()) as unknown as WebGpuDevice;
    const response = await fetch(sourceUrl);

    if (!response.ok) {
      throw new Error(
        `Unable to load WebGPU shader source: HTTP ${response.status}.`,
      );
    }

    const sourceCode = await response.text();
    const shaderModule = device.createShaderModule({ code: sourceCode });

    return new WebGpuBackend(device, shaderModule);
  }

  public createBuffer(size: number, usage: number): WebGpuBuffer {
    return this.device.createBuffer({ size, usage });
  }

  public writeBuffer(
    buffer: WebGpuBuffer,
    data: ArrayBufferView,
  ): void {
    this.device.queue.writeBuffer(buffer, 0, data);
  }

  public createComputePipeline(
    entryPoint: string,
  ): WebGpuComputePipeline {
    return this.device.createComputePipeline({
      layout: "auto",
      compute: {
        module: this.shaderModule,
        entryPoint,
      },
    });
  }

  public createBindGroup(
    pipeline: WebGpuComputePipeline,
    buffers: WebGpuBuffer[],
  ): WebGpuBindGroup {
    return this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: buffers.map((buffer, binding) => ({
        binding,
        resource: { buffer },
      })),
    });
  }

  public submit(
    computeCommands: WebGpuComputeCommand[],
    copyCommands: WebGpuCopyCommand[],
  ): void {
    const encoder = this.device.createCommandEncoder();

    for (const command of computeCommands) {
      const pass = encoder.beginComputePass();
      pass.setPipeline(command.pipeline);
      pass.setBindGroup(0, command.bindGroup);
      pass.dispatchWorkgroups(command.workgroupCount);
      pass.end();
    }

    for (const command of copyCommands) {
      encoder.copyBufferToBuffer(
        command.source,
        command.sourceOffset,
        command.destination,
        command.destinationOffset,
        command.size,
      );
    }

    this.device.queue.submit([encoder.finish()]);
  }

  public async readBuffer(buffer: WebGpuBuffer): Promise<ArrayBuffer> {
    await buffer.mapAsync(MAP_MODE_READ);
    const mapped = buffer.getMappedRange();
    const result = mapped.slice(0);
    buffer.unmap();
    return result;
  }

  public getBufferUsage(): typeof BUFFER_USAGE {
    return BUFFER_USAGE;
  }

  public destroy(): void {
    // WebGPU device resources are owned by the browser and are released
    // when their buffers are explicitly destroyed by their owners.
  }
}
