import { PointGraphManager } from "@core/collections/PointGraphManager";

const WORKGROUP_SIZE = 256;
const MAX_WORKGROUP_COUNT = 256;
const POINT_STRIDE = 4;
const BYTES_PER_FLOAT = Float32Array.BYTES_PER_ELEMENT;
const POINT_BYTES = POINT_STRIDE * BYTES_PER_FLOAT;
const TEMPERATURE_BYTES = BYTES_PER_FLOAT;
const PARAMETER_BUFFER_SIZE = BYTES_PER_FLOAT * 2 + Uint32Array.BYTES_PER_ELEMENT * 2;

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

interface WebGpuBuffer {
  mapAsync(mode: number): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
}

interface WebGpuQueue {
  writeBuffer(buffer: WebGpuBuffer, bufferOffset: number, data: ArrayBufferView): void;
  submit(commandBuffers: unknown[]): void;
}

interface WebGpuComputePipeline {
  getBindGroupLayout(index: number): unknown;
}

interface WebGpuBindGroup {}

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

interface WebGpuPhysicsBuffers {
  points: WebGpuBuffer;
  workgroupMaxima: WebGpuBuffer;
  temperature: WebGpuBuffer;
  parameters: WebGpuBuffer;
  readback: WebGpuBuffer;
  capacity: number;
  workgroupCapacity: number;
}

export class WebGpuPhysicsMemory {
  private readonly updatePipeline: WebGpuComputePipeline;
  private readonly reductionPipeline: WebGpuComputePipeline;
  private readonly bindGroupLayout: unknown;
  private buffers: WebGpuPhysicsBuffers | null = null;

  private constructor(
    private readonly pointGraphManager: PointGraphManager,
    private readonly device: WebGpuDevice,
    sourceCode: string,
    public readonly sourceUrl: URL,
  ) {
    const shaderModule = device.createShaderModule({ code: sourceCode });
    this.updatePipeline = device.createComputePipeline({
      layout: "auto",
      compute: {
        module: shaderModule,
        entryPoint: "updatePoints",
      },
    });
    this.reductionPipeline = device.createComputePipeline({
      layout: "auto",
      compute: {
        module: shaderModule,
        entryPoint: "reduceTemperature",
      },
    });

    this.bindGroupLayout = this.updatePipeline.getBindGroupLayout(0);
  }

  public static isSupported(): boolean {
    return "gpu" in navigator;
  }

  public static async create(
    pointGraphManager: PointGraphManager,
    sourceCode: string,
    sourceUrl: URL,
  ): Promise<WebGpuPhysicsMemory> {
    const gpu = (navigator as Navigator & { gpu?: WebGpuApi }).gpu;

    if (!gpu) {
      throw new Error("WebGPU is not supported by this browser.");
    }

    const adapter = await gpu.requestAdapter();

    if (!adapter) {
      throw new Error("WebGPU adapter is not available.");
    }

    const device = (await adapter.requestDevice()) as unknown as WebGpuDevice;

    return new WebGpuPhysicsMemory(
      pointGraphManager,
      device,
      sourceCode,
      sourceUrl,
    );
  }

  public async applyZDamping(
    dampingFactor: number,
    threshold: number,
  ): Promise<number> {
    const points = this.pointGraphManager.getPointsArray();

    if (points.length === 0) {
      return 0;
    }

    const buffers = this.ensureBuffers(points.length);
    const values = new Float32Array(points.length * POINT_STRIDE);

    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      const offset = index * POINT_STRIDE;

      values[offset] = point.x;
      values[offset + 1] = point.y;
      values[offset + 2] = point.z;
      values[offset + 3] = point.fixed ? 1 : 0;
    }

    this.device.queue.writeBuffer(buffers.points, 0, values);

    const parameters = new ArrayBuffer(PARAMETER_BUFFER_SIZE);
    const floatParameters = new Float32Array(parameters);
    const uintParameters = new Uint32Array(parameters);

    floatParameters[0] = dampingFactor;
    floatParameters[1] = threshold;
    uintParameters[2] = points.length;
    uintParameters[3] = Math.ceil(points.length / WORKGROUP_SIZE);

    this.device.queue.writeBuffer(
      buffers.parameters,
      0,
      new Uint8Array(parameters),
    );

    const bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: buffers.points } },
        { binding: 1, resource: { buffer: buffers.workgroupMaxima } },
        { binding: 2, resource: { buffer: buffers.temperature } },
        { binding: 3, resource: { buffer: buffers.parameters } },
      ],
    });

    const encoder = this.device.createCommandEncoder();

    const updatePass = encoder.beginComputePass();
    updatePass.setPipeline(this.updatePipeline);
    updatePass.setBindGroup(0, bindGroup);
    updatePass.dispatchWorkgroups(Math.ceil(points.length / WORKGROUP_SIZE));
    updatePass.end();

    const reductionPass = encoder.beginComputePass();
    reductionPass.setPipeline(this.reductionPipeline);
    reductionPass.setBindGroup(0, bindGroup);
    reductionPass.dispatchWorkgroups(1);
    reductionPass.end();

    encoder.copyBufferToBuffer(
      buffers.points,
      0,
      buffers.readback,
      0,
      values.byteLength,
    );
    encoder.copyBufferToBuffer(
      buffers.temperature,
      0,
      buffers.readback,
      values.byteLength,
      TEMPERATURE_BYTES,
    );

    this.device.queue.submit([encoder.finish()]);

    await buffers.readback.mapAsync(MAP_MODE_READ);

    const mapped = buffers.readback.getMappedRange();
    const result = new Float32Array(mapped.slice(0, values.byteLength));
    const temperature = new Float32Array(
      mapped.slice(values.byteLength, values.byteLength + TEMPERATURE_BYTES),
    )[0];
    buffers.readback.unmap();

    for (let index = 0; index < points.length; index++) {
      const point = points[index];
      const offset = index * POINT_STRIDE;

      point.x = result[offset];
      point.y = result[offset + 1];
      point.z = result[offset + 2];
    }

    return temperature;
  }

  public destroy(): void {
    if (!this.buffers) return;

    this.buffers.points.destroy();
    this.buffers.workgroupMaxima.destroy();
    this.buffers.temperature.destroy();
    this.buffers.parameters.destroy();
    this.buffers.readback.destroy();
    this.buffers = null;
  }

  private ensureBuffers(length: number): WebGpuPhysicsBuffers {
    const workgroupCount = Math.ceil(length / WORKGROUP_SIZE);

    if (workgroupCount > MAX_WORKGROUP_COUNT) {
      throw new Error(
        `WebGPU Z-damping supports at most ${MAX_WORKGROUP_COUNT * WORKGROUP_SIZE} points in the two-pass reduction prototype.`,
      );
    }

    if (
      this.buffers &&
      this.buffers.capacity >= length &&
      this.buffers.workgroupCapacity >= workgroupCount
    ) {
      return this.buffers;
    }

    this.buffers?.points.destroy();
    this.buffers?.workgroupMaxima.destroy();
    this.buffers?.temperature.destroy();
    this.buffers?.parameters.destroy();
    this.buffers?.readback.destroy();

    const capacity = Math.max(length, 1);
    const workgroupCapacity = Math.max(workgroupCount, 1);
    const pointBytes = capacity * POINT_BYTES;
    const readbackBytes = pointBytes + TEMPERATURE_BYTES;

    const points = this.device.createBuffer({
      size: pointBytes,
      usage: BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_SRC | BUFFER_USAGE.COPY_DST,
    });

    const workgroupMaxima = this.device.createBuffer({
      size: workgroupCapacity * BYTES_PER_FLOAT,
      usage: BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_DST,
    });

    const temperature = this.device.createBuffer({
      size: TEMPERATURE_BYTES,
      usage: BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_SRC,
    });

    const parameters = this.device.createBuffer({
      size: PARAMETER_BUFFER_SIZE,
      usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST,
    });

    const readback = this.device.createBuffer({
      size: readbackBytes,
      usage: BUFFER_USAGE.COPY_DST | BUFFER_USAGE.MAP_READ,
    });

    this.buffers = {
      points,
      workgroupMaxima,
      temperature,
      parameters,
      readback,
      capacity,
      workgroupCapacity,
    };

    return this.buffers;
  }
}
