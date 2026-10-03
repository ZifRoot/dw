#include <stdint.h>

struct PointState {
  float x;
  float y;
  float z;
  int32_t fixed;
};

struct EdgeState {
  int32_t source;
  int32_t target;
  float distance;
  int32_t physics;
};

static float absf(float value) {
  return value < 0.0f ? -value : value;
}

extern "C" {
__attribute__((export_name("graph")))
float graph(
    PointState* points,
    int pointCount,
    EdgeState* edges,
    int edgeCount,
    float strength) {
  float maxTemperature = -1.0f;

  for (int i = 0; i < edgeCount; ++i) {
    EdgeState& edge = edges[i];

    if (edge.physics == 0 ||
        edge.source < 0 ||
        edge.target < 0 ||
        edge.source >= pointCount ||
        edge.target >= pointCount) {
      continue;
    }

    PointState& p1 = points[edge.source];
    PointState& p2 = points[edge.target];

    if (p1.fixed != 0 && p2.fixed != 0) continue;

    const float dx = p1.x - p2.x;
    const float dy = p1.y - p2.y;
    const float dz = p1.z - p2.z;
    const float distSq = dx * dx + dy * dy + dz * dz;
    const float targetDistSq = edge.distance * edge.distance;

    if (distSq <= targetDistSq) continue;

    const float distance = __builtin_sqrtf(distSq);
    const float factor = (p1.fixed != 0 || p2.fixed != 0) ? 1.0f : 0.5f;
    const float temperature = 1.0f - edge.distance / distance;
    const float k = temperature * strength * factor;

    const float moveX = dx * k;
    const float moveY = dy * k;
    const float moveZ = dz * k;

    if (p1.fixed == 0) {
      p1.x -= moveX;
      p1.y -= moveY;
      p1.z -= moveZ;
    }

    if (p2.fixed == 0) {
      p2.x += moveX;
      p2.y += moveY;
      p2.z += moveZ;
    }

    if (absf(temperature) > maxTemperature) {
      maxTemperature = absf(temperature);
    }
  }

  return maxTemperature;
}
