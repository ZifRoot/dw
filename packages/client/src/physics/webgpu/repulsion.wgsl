struct Parameters {
  repulsionStrength: f32,
  minDistance: f32,
  targetDistance: f32,
  epsilon: f32,
  stopTemperature: f32,
  count: u32,
  workgroupCount: u32,
};

struct PointState { x: f32, y: f32, z: f32, fixed: i32 };
const WORKGROUP_SIZE: u32 = 256u;

@group(0) @binding(0) var<storage, read> points: array<PointState>;
@group(0) @binding(1) var<storage, read_write> outputPoints: array<PointState>;
@group(0) @binding(2) var<uniform> parameters: Parameters;
@group(0) @binding(3) var<storage, read_write> workgroupMaxima: array<f32>;
@group(0) @binding(4) var<storage, read_write> temperature: array<f32>;

var<workgroup> localMaxima: array<f32, 256>;

fn randomUnit(seed: u32) -> f32 {
  var value = seed * 747796405u + 2891336453u;
  value = (value ^ (value >> 16u)) * 2246822519u;
  value = value ^ (value >> 13u);
  return f32(value) / 4294967295.0 * 2.0 - 1.0;
}

@compute @workgroup_size(256)
fn repulsion(
  @builtin(global_invocation_id) globalId: vec3<u32>,
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>,
) {
  let index = globalId.x;
  var result = points[index];
  var maxTemperature = 0.0;

  if (index < parameters.count && result.fixed == 0) {
    let targetSquared = parameters.targetDistance * parameters.targetDistance;
    var shift = vec3<f32>(0.0);

    for (var j = 0u; j < parameters.count; j++) {
      if (j == index) { continue; }

      let other = points[j];
      if (other.fixed != 0 && result.fixed != 0) { continue; }

      let d = vec3<f32>(result.x - other.x, result.y - other.y, result.z - other.z);
      let distSquared = dot(d, d);
      if (distSquared >= targetSquared) { continue; }

      if (distSquared < parameters.epsilon) {
        let seed = index * 73856093u ^ j * 19349663u;
        var random = vec3<f32>(randomUnit(seed), randomUnit(seed + 1u), randomUnit(seed + 2u));
        let randomLengthSquared = dot(random, random);
        if (randomLengthSquared > parameters.epsilon) {
          random *= parameters.minDistance / sqrt(randomLengthSquared);
          shift += random;
        }
        maxTemperature = max(maxTemperature, parameters.stopTemperature * 2.0);
      } else {
        let distance = sqrt(distSquared);
        let factor = select(0.5, 1.0, other.fixed != 0);
        let relativeDistance = parameters.targetDistance / distance - 1.0;
        shift += d * (relativeDistance * factor * parameters.repulsionStrength);
        maxTemperature = max(maxTemperature, abs(relativeDistance));
      }
    }

    result.x += shift.x;
    result.y += shift.y;
    result.z += shift.z;
  }

  outputPoints[index] = result;
  localMaxima[localId.x] = select(0.0, maxTemperature, index < parameters.count);
  workgroupBarrier();

  var stride = WORKGROUP_SIZE / 2u;
  while (stride > 0u) {
    if (localId.x < stride) localMaxima[localId.x] = max(localMaxima[localId.x], localMaxima[localId.x + stride]);
    workgroupBarrier();
    stride /= 2u;
  }

  if (localId.x == 0u) workgroupMaxima[workgroupId.x] = localMaxima[0];
}

@compute @workgroup_size(256)
fn reduceTemperature(@builtin(local_invocation_id) localId: vec3<u32>) {
  let index = localId.x;
  localMaxima[index] = select(0.0, workgroupMaxima[index], index < parameters.workgroupCount);
  workgroupBarrier();

  var stride = WORKGROUP_SIZE / 2u;
  while (stride > 0u) {
    if (localId.x < stride) localMaxima[localId.x] = max(localMaxima[localId.x], localMaxima[localId.x + stride]);
    workgroupBarrier();
    stride /= 2u;
  }

  if (localId.x == 0u) temperature[0] = localMaxima[0];
}
