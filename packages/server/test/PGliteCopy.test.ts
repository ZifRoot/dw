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

function quoteCsv(value: string): string {
  return '"' + value.split('"').join('""') + '"';
}

function createCsv(rows: CopyRow[]): Blob {
  const lines = rows.map((row) =>
    [
      row.id.toString(),
      quoteCsv(row.content),
      quoteCsv("\\x" + row.payload.toString("hex")),
    ].join(","),
  );

  return new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
}

test("PGlite COPY imports large JS data into and reads it from one table", async () => {
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
    const csv = createCsv(rows);

    await pg.query(
      "COPY copy_rows (id, content, payload) FROM '/dev/blob' WITH (FORMAT csv, HEADER false)",
      [],
      { blob: csv },
    );

    const result = await pg.query<CopyRow>(
      "SELECT id, content, payload FROM copy_rows ORDER BY id",
    );

    assert.equal(result.rows.length, rows.length);

    for (let index = 0; index < rows.length; index += 1) {
      assert.equal(result.rows[index].id, rows[index].id);
      assert.equal(result.rows[index].content, rows[index].content);
      assert.deepEqual(result.rows[index].payload, rows[index].payload);
    }
  } finally {
    await pg.close();
  }
});
