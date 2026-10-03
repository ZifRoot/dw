// Test modules are loaded from top to bottom.
// Move a feature's test module to the top when it must be the first test suite.
await import("./shared/utils/observable-array.test");
await import("./shared/utils/logger-singleRunner.test");
await import("../packages/client/src/core/Engines/AnimationEngine.test");
