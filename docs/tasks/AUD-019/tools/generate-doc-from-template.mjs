#!/usr/bin/env node

/**
 * Generate markdown document from template.
 *
 * Usage:
 *
 * node tools/generate-doc-from-template.mjs \
 *   template.md \
 *   config.json \
 *   output.md
 *
 */

import fs from "node:fs/promises";
import path from "node:path";

function replacePlaceholders(template, variables) {
  return template.replace(/<([A-Z0-9_]+)>/g, (_, key) => {
    if (!(key in variables)) {
      return `<${key}>`;
    }

    return String(variables[key]);
  });
}

async function main() {
  const [, , templateFile, configFile, outputFile] = process.argv;

  if (!templateFile || !configFile || !outputFile) {
    console.error(
      "Usage: node generate-doc-from-template.mjs <template.md> <config.json> <output.md>",
    );

    process.exit(1);
  }

  const template = await fs.readFile(templateFile, "utf8");

  const configText = await fs.readFile(configFile, "utf8");

  const config = JSON.parse(configText);

  const result = replacePlaceholders(template, config);

  await fs.mkdir(path.dirname(outputFile), {
    recursive: true,
  });

  await fs.writeFile(outputFile, result, "utf8");

  console.log(`Generated: ${outputFile}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
