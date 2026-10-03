struct Parameters {
  strength: f32,
  pointCount: u32,
  edgeCount: u32,
  workgroupCount: u32,
};

struct PointState { x: f32, y: f32, z: f32, fixed: i32 };
struct EdgeState { source: i32, target: i32, distance: f32, physics: i32 };

const WORKGROUP_SIZE: u32 = 256u;

@group(0) @binding(0) var<storage, read> points: array<PointState>;
@group(0) @binding(1) var<storage, read> edges: array<EdgeState>;
@group(0) @binding(2) var<storage, read_write> outputPoints: array<PointState>;
@group(0) @binding(3) var<uniform> parameters: Parameters;
@group(0) @binding(4) var<storage, read_write> workgroupMaxima: array<f32>;
@group(0) @binding(5) var<storage, read_write> temperature: array<f32>;

var<workgroup> localMaxima: array<f32, 256>;

@compute @workgroup_size(256)
fn graph(
  @builtin(global_invocation_id) globalId: vec3<u32>,
  @builtin(local_invocation_id) localId: vec3<u32>,
  @builtin(workgroup_id) workgroupId: vec3<u32>,
) {
  let index = globalId.x;
  var result = points[index];
  var maxTemperature = 0.0;

  if (index < parameters.pointCount) {
    for (var edgeIndex = 0u; edgeIndex < parameters.edgeCount; edgeIndex++) {
      let edge = edges[edgeIndex];
      if (edge.physics == 0) { continue; }

      var otherIndex = -1;
      var sign = 0.0;
      if (edge.source == i32(index)) {
        otherIndex = edge.target;
        sign = 1.0;
      } else if (edge.target == i32(index)) {
        otherIndex = edge.source;
        sign = -1.0;
      } else {
        continue;
      }

      if (otherIndex < 0 || u32(otherIndex) >= parameters.pointCount) { continue; }
      let other = points[u32(otherIndex)];
      if (result.fixed != 0 && other.fixed != 0) { continue; }

      let d = vec3<f32>(result.x - other.x, result.y - other.y, result.z - other.z);
      let distSquared = dot(d, d);
      let targetSquared = edge.distance * edge.distance;
      if (distSquared <= targetSquared) { continue; }

      let distance = sqrt(distSquared);
      let factor = select(0.5, 1.0, result.fixed != 0 || other.fixed != 0);
      let temp = 1.0 - edge.distance / distance;
      let k = temp * parameters.strength * factor;
      let move = d * k * sign;

      if (result.fixed == 0) {
        result.x -= move.x;
        result.y -= move.y;
        result.z -= move.z;
      }

      maxTemperature = max(maxTemperature, temp);
    }
  }

  outputPoints[index] = result;
  localMaxima[localId.x] = select(0.0, maxTemperature, index < parameters.pointCount);
  workgroupBarrier();

  var stride = WORKGROUP_SIZE / 2u;
  while (stride > 0u) {
    if (localId.x < stride) {
      localMaxima[localId.x] = max(localMaxima[localId.x], localMaxima[localId.x + stride]);
    }
    workgroupBarrier();
    stride /= 2u;
  }

  if (localId.x == 0u) workgroupMaxima[workgroupId.x] = localMaxima[0];

  if (workgroupId.x == 0u && localId.x == 0u) {
    var total = 0.0;
    for (var i = 0u; i < parameters.workgroupCount; i++) {
      total = max(total, workgroupMaxima[i]);
    }
    temperature[0] = total;
  }
}
