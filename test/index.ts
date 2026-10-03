// Test modules are loaded from top to bottom.
// Move a feature's test module to the top when it must be the first test suite.
await import("./utils/observable-array.test");
await import("./utils/logger-singleRunner.test");
await import("./client/core/Engines/AnimationEngine.test");
