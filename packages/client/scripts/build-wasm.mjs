import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL("../src/physics/wasm/", import.meta.url));
const source = resolve(directory, "z-damping.cpp");
const output = resolve(directory, "z-damping.wasm");

if (existsSync(output)) {
  process.exit(0);
}

const result = spawnSync(
  "clang++",
  [
    "--target=wasm32",
    "-O3",
    "-nostdlib",
    "-Wl,--no-entry",
    "-Wl,--export-memory",
    "-Wl,--export=z_damping",
    "-o",
    output,
    source,
  ],
  {
    stdio: "inherit",
  },
);

if (result.error) {
  throw new Error(
    `Unable to compile WASM: clang++ is required to build ${source}.`,
    { cause: result.error },
  );
}

if (result.status !== 0) {
  throw new Error(`WASM compilation failed with exit code ${result.status}.`);
}
