__attribute__((export_name("z_damping")))
void z_damping(float* values, int length, float dampingFactor) {
  for (int i = 0; i < length; ++i) {
    values[i] *= dampingFactor;
  }
}
