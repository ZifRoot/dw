struct Parameters {
  dampingFactor: f32,
  threshold: f32,
  count: u32,
  workgroupCount: u32,
};

struct PointState {
  x: f32,
  y: f32,
  z: f32,
  fixed: i32,
};

const WORKGROUP_SIZE: u32 = 256u;

@group(0) @binding(0)
var<storage, read_write> points: array<PointState>;

@group(0) @binding(1)
var<storage, read_write> workgroupMaxima: array<f32>;

@group(0) @binding(2)
var<storage, read_write> temperature: array<f32>;

@group(0) @binding(3)
var<uniform> parameters: Parameters;

var<workgroup> localMaxima: array<f32, 256>;

@compute @workgroup_size(256)
fn updatePoints(
  @builtin(global_invocation_id) globalId: vec3<u32>,
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>,
) {
  let index = globalId.x;
  var displacement = 0.0;

  if (index < parameters.count) {
    let point = points[index];

    if (point.fixed == 0 && abs(point.z) > parameters.threshold) {
      let oldZ = point.z;
      var newZ = oldZ * (1.0 - parameters.dampingFactor);

      if (abs(newZ) < 1.0e-6) {
        newZ = 0.0;
      }

      points[index].z = newZ;
      displacement = abs(newZ - oldZ);
    }
  }

  localMaxima[localId.x] = displacement;
  workgroupBarrier();

  var stride = WORKGROUP_SIZE / 2u;
  while (stride > 0u) {
    if (localId.x < stride) {
      localMaxima[localId.x] = max(
        localMaxima[localId.x],
        localMaxima[localId.x + stride],
      );
    }

    workgroupBarrier();
    stride = stride / 2u;
  }

  if (localId.x == 0u) {
    workgroupMaxima[workgroupId.x] = localMaxima[0];
  }
}

@compute @workgroup_size(256)
fn reduceTemperature(@builtin(local_invocation_id) localId: vec3<u32>) {
  let index = localId.x;
  localMaxima[index] = select(
    0.0,
    workgroupMaxima[index],
    index < parameters.workgroupCount,
  );
  workgroupBarrier();

  var stride = WORKGROUP_SIZE / 2u;
  while (stride > 0u) {
    if (localId.x < stride) {
      localMaxima[localId.x] = max(
        localMaxima[localId.x],
        localMaxima[localId.x + stride],
      );
    }

    workgroupBarrier();
    stride = stride / 2u;
  }

  if (localId.x == 0u) {
    temperature[0] = localMaxima[0];
  }
}
