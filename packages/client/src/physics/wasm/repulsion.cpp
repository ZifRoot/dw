#include <stdint.h>

struct PointState {
  float x;
  float y;
  float z;
  int32_t fixed;
};

static float absf(float value) {
  return value < 0.0f ? -value : value;
}

static float sqrtf_approx(float value) {
  return __builtin_sqrtf(value);
}

static float randomUnit(int seed) {
  uint32_t value = static_cast<uint32_t>(seed) * 747796405u + 2891336453u;
  value ^= value >> 16;
  value *= 2246822519u;
  value ^= value >> 13;
  return static_cast<float>(value) / 4294967295.0f * 2.0f - 1.0f;
}

extern "C" {
__attribute__((export_name("repulsion")))
float repulsion(
    PointState* points,
    int length,
    float repulsionStrength,
    float minDistance,
    float targetDistance,
    float epsilon,
    float stopTemperature) {
  float maxTemperature = -1.0f;

  for (int i = 0; i < length; ++i) {
    for (int j = i + 1; j < length; ++j) {
      PointState& p1 = points[i];
      PointState& p2 = points[j];

      if (p1.fixed != 0 && p2.fixed != 0) continue;

      float dx = p1.x - p2.x;
      float dy = p1.y - p2.y;
      float dz = p1.z - p2.z;
      float distSq = dx * dx + dy * dy + dz * dz;

      if (distSq >= targetDistance * targetDistance) continue;

      float shiftX;
      float shiftY;
      float shiftZ;
      float temperature;

      if (distSq < epsilon) {
        const int seed = i * 73856093 ^ j * 19349663;
        shiftX = randomUnit(seed);
        shiftY = randomUnit(seed + 1);
        shiftZ = randomUnit(seed + 2);
        const float lengthSq = shiftX * shiftX + shiftY * shiftY + shiftZ * shiftZ;
        const float inverseLength =
            lengthSq > epsilon ? 1.0f / sqrtf_approx(lengthSq) : 1.0f;

        shiftX *= minDistance * inverseLength;
        shiftY *= minDistance * inverseLength;
        shiftZ *= minDistance * inverseLength;
        temperature = stopTemperature * 2.0f;
      } else {
        const float distance = sqrtf_approx(distSq);
        const float factor = (p1.fixed != 0 || p2.fixed != 0) ? 1.0f : 0.5f;
        const float relativeDistance = targetDistance / distance - 1.0f;

        shiftX = dx * relativeDistance * factor * repulsionStrength;
        shiftY = dy * relativeDistance * factor * repulsionStrength;
        shiftZ = dz * relativeDistance * factor * repulsionStrength;
        temperature = absf(relativeDistance);
      }

      if (p1.fixed == 0) {
        p1.x += shiftX;
        p1.y += shiftY;
        p1.z += shiftZ;
      }

      if (p2.fixed == 0) {
        p2.x -= shiftX;
        p2.y -= shiftY;
        p2.z -= shiftZ;
      }

      if (temperature > maxTemperature) maxTemperature = temperature;
    }
  }

  return maxTemperature;
}
