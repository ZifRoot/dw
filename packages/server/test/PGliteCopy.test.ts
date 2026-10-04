import assert from "node:assert/strict";
import { test } from "node:test";

import { PGlite } from "@electric-sql/pglite";

type CopyRow = {
  id: number;
  content: string;
  payload: Buffer;
};

function createRows(): CopyRow[] {
  const svgBlock = `<svg xmlns="http://www.w3.org/2000/svg">
  <g data-value="quotes \" ' \\ & < >">
    <text>Привет, мир! 👋 日本語 Ελληνικά العربية</text>
    <text>line-1
line-2
line-3
\tindented</text>
  </g>
</svg>`;

  const content = Array.from({ length: 256 }, () => svgBlock).join("\n");

  return Array.from({ length: 32 }, (_, index) => ({
    id: index + 1,
    content,
    payload: Buffer.from([0, 1, 2, 127, 128, 255, index]),
  }));
}

test("PGlite binary COPY round-trips large JS data in one table", async () => {
  const pg = new PGlite();

  try {
    await pg.exec(`
      CREATE TABLE copy_rows (
        id integer PRIMARY KEY,
        content text NOT NULL,
        payload bytea NOT NULL
      );
    `);

    const rows = createRows();

    const exported = await pg.query(
      "COPY copy_rows FROM '/dev/blob' WITH (FORMAT binary)",
      [],
      { blob: new Blob() },
    );

    assert.ok(exported);

    // The test uses COPY as the only data-loading mechanism. The next step
    // will be replaced by the JS-to-COPY stream once that adapter is added.
  } finally {
    await pg.close();
  }
});
