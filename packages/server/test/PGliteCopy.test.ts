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
    payload: Buffer.from([
      0,
      1,
      2,
      127,
      128,
      255,
      index,
    ]),
  }));
}

test("PGlite binary COPY imports large JS data without text escaping", async () => {
  const pg = new PGlite();

  try {
    await pg.exec(`
      CREATE TABLE source_rows (
        id integer PRIMARY KEY,
        content text NOT NULL,
        payload bytea NOT NULL
      );

      CREATE TABLE target_rows (
        id integer PRIMARY KEY,
        content text NOT NULL,
        payload bytea NOT NULL
      );
    `);

    const rows = createRows();

    for (const row of rows) {
      await pg.query(
        "INSERT INTO source_rows (id, content, payload) VALUES ($1, $2, $3)",
        [row.id, row.content, row.payload],
      );
    }

    const exported = await pg.query(
      "COPY source_rows TO '/dev/blob' WITH (FORMAT binary)",
    );

    assert.ok(exported.blob);

    await pg.query(
      "COPY target_rows FROM '/dev/blob' WITH (FORMAT binary)",
      [],
      { blob: exported.blob },
    );

    const imported = await pg.query<CopyRow>(
      "SELECT id, content, payload FROM target_rows ORDER BY id",
    );

    assert.equal(imported.rows.length, rows.length);

    for (let index = 0; index < rows.length; index += 1) {
      assert.equal(imported.rows[index].id, rows[index].id);
      assert.equal(imported.rows[index].content, rows[index].content);
      assert.deepEqual(imported.rows[index].payload, rows[index].payload);
    }
  } finally {
    await pg.close();
  }
});
