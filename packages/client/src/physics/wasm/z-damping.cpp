#include <cstdint>

struct PointState {
  float x;
  float y;
  float z;
  int32_t fixed;
};

extern "C" {
__attribute__((export_name("z_damping")))
float z_damping(PointState* points, int length, float dampingFactor, float threshold) {
  float temperature = 0.0f;

  for (int i = 0; i < length; ++i) {
    PointState& point = points[i];

    if (point.fixed != 0 || __builtin_fabsf(point.z) <= threshold) {
      continue;
    }

    const float oldZ = point.z;
    float newZ = oldZ * (1.0f - dampingFactor);

    if (__builtin_fabsf(newZ) < 1.0e-6f) {
      newZ = 0.0f;
    }

    point.z = newZ;

    const float displacement = __builtin_fabsf(newZ - oldZ);
    if (displacement > temperature) {
      temperature = displacement;
    }
  }

  return temperature;
}
}
