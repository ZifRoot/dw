import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const sourceDirectory = resolve(root, "src/physics/wasm");
const modules = [
  ["repulsion.cpp", "repulsion.wasm", "repulsion"],
  ["graph.cpp", "graph.wasm", "graph"],
  ["z-damping.cpp", "z-damping.wasm", "z_damping"],
];

for (const [sourceName, outputName, exportName] of modules) {
  const source = resolve(sourceDirectory, sourceName);
  const output = resolve(sourceDirectory, outputName);
  if (existsSync(output)) continue;
  mkdirSync(sourceDirectory, { recursive: true });
  execFileSync("clang++", [
    "--target=wasm32", "-O3", "-nostdlib", "-Wl,--no-entry",
    "-Wl,--import-memory", "-Wl,--export=" + exportName,
    "-o", output, source,
  ], { stdio: "inherit" });
}
