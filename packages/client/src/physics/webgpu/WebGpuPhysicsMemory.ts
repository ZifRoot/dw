import { PointGraphManager } from "@core/collections/PointGraphManager";

const WORKGROUP_SIZE = 64;
const BYTES_PER_FLOAT = Float32Array.BYTES_PER_ELEMENT;
const BYTES_PER_UINT = Uint32Array.BYTES_PER_ELEMENT;
const PARAMETER_BUFFER_SIZE = BYTES_PER_FLOAT + BYTES_PER_UINT;

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
  createBuffer(descriptor: {
    size: number;
    usage: number;
  }): WebGpuBuffer;
  createShaderModule(descriptor: { code: string }): unknown;
  createComputePipeline(descriptor: {
    layout: "auto";
    compute: {
      module: unknown;
      entryPoint: string;
    };
  }): WebGpuComputePipeline;
  createBindGroup(descriptor: {
    layout: unknown;
    entries: Array<{
      binding: number;
      resource: { buffer: WebGpuBuffer };
    }>;
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
  writeBuffer(
    buffer: WebGpuBuffer,
    bufferOffset: number,
    data: ArrayBufferView,
  ): void;
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
  values: WebGpuBuffer;
  parameters: WebGpuBuffer;
  readback: WebGpuBuffer;
  capacity: number;
}

const SHADER_SOURCE = `
struct Parameters {
  dampingFactor: f32,
  count: u32,
};

@group(0) @binding(0)
var<storage, read_write> values: array<f32>;

@group(0) @binding(1)
var<uniform> parameters: Parameters;

@compute @workgroup_size(${WORKGROUP_SIZE})
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= parameters.count) {
    return;
  }

  values[id.x] = values[id.x] * parameters.dampingFactor;
}
`;

export class WebGpuPhysicsMemory {
  private readonly device: WebGpuDevice;
  private readonly pipeline: WebGpuComputePipeline;
  private readonly bindGroupLayout: unknown;
  private buffers: WebGpuPhysicsBuffers | null = null;

  private constructor(
    private readonly pointGraphManager: PointGraphManager,
    device: WebGpuDevice,
    pipeline: WebGpuComputePipeline,
  ) {
    this.device = device;
    this.pipeline = pipeline;
    this.bindGroupLayout = pipeline.getBindGroupLayout(0);
  }

  public static isSupported(): boolean {
    return "gpu" in navigator;
  }

  public static async create(
    pointGraphManager: PointGraphManager,
  ): Promise<WebGpuPhysicsMemory> {
    const gpu = (navigator as Navigator & { gpu?: WebGpuApi }).gpu;

    if (!gpu) {
      throw new Error("WebGPU is not supported by this browser.");
    }

    const adapter = await gpu.requestAdapter();

    if (!adapter) {
      throw new Error("WebGPU adapter is not available.");
    }

    const device = await adapter.requestDevice();
    const shaderModule = device.createShaderModule({ code: SHADER_SOURCE });
    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: {
        module: shaderModule,
        entryPoint: "main",
      },
    });

    return new WebGpuPhysicsMemory(pointGraphManager, device, pipeline);
  }

  public async applyZDamping(
    dampingFactor: number,
    threshold: number,
  ): Promise<number> {
    const activePoints = this.pointGraphManager
      .getPointsArray()
      .filter((point) => !point.fixed && Math.abs(point.z) > threshold);

    if (activePoints.length === 0) {
      return 0;
    }

    const pointIds = activePoints.map((point) => point.id);
    const values = new Float32Array(activePoints.map((point) => point.z));
    const result = await this.execute(values, dampingFactor);

    for (let index = 0; index < pointIds.length; index++) {
      const point = this.pointGraphManager.getPointById(pointIds[index]);

      if (!point || point.fixed) {
        continue;
      }

      point.z = result[index];

      if (Math.abs(point.z) < 1e-6) {
        point.z = 0;
      }
    }

    return 3;
  }

  public destroy(): void {
    if (!this.buffers) return;

    this.buffers.values.destroy();
    this.buffers.parameters.destroy();
    this.buffers.readback.destroy();
    this.buffers = null;
  }

  private async execute(
    values: Float32Array,
    dampingFactor: number,
  ): Promise<Float32Array> {
    const buffers = this.ensureBuffers(values.length);

    this.device.queue.writeBuffer(buffers.values, 0, values);

    const parameters = new ArrayBuffer(PARAMETER_BUFFER_SIZE);
    new Float32Array(parameters, 0, 1)[0] = dampingFactor;
    new Uint32Array(parameters, BYTES_PER_FLOAT, 1)[0] = values.length;
    this.device.queue.writeBuffer(
      buffers.parameters,
      0,
      new Uint8Array(parameters),
    );

    const bindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: buffers.values } },
        { binding: 1, resource: { buffer: buffers.parameters } },
      ],
    });

    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(Math.ceil(values.length / WORKGROUP_SIZE));
    pass.end();

    encoder.copyBufferToBuffer(
      buffers.values,
      0,
      buffers.readback,
      0,
      values.byteLength,
    );

    this.device.queue.submit([encoder.finish()]);

    await buffers.readback.mapAsync(MAP_MODE_READ);

    const result = new Float32Array(
      buffers.readback.getMappedRange().slice(0),
    );

    buffers.readback.unmap();

    return result;
  }

  private ensureBuffers(length: number): WebGpuPhysicsBuffers {
    if (this.buffers && this.buffers.capacity >= length) {
      return this.buffers;
    }

    this.buffers?.values.destroy();
    this.buffers?.parameters.destroy();
    this.buffers?.readback.destroy();

    const capacity = Math.max(length, 1);
    const valueBytes = capacity * BYTES_PER_FLOAT;

    const values = this.device.createBuffer({
      size: valueBytes,
      usage: BUFFER_USAGE.STORAGE | BUFFER_USAGE.COPY_SRC | BUFFER_USAGE.COPY_DST,
    });

    const parameters = this.device.createBuffer({
      size: PARAMETER_BUFFER_SIZE,
      usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST,
    });

    const readback = this.device.createBuffer({
      size: valueBytes,
      usage: BUFFER_USAGE.COPY_DST | BUFFER_USAGE.MAP_READ,
    });

    this.buffers = {
      values,
      parameters,
      readback,
      capacity,
    };

    return this.buffers;
  }
}
