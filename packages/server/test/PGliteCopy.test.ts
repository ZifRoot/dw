import assert from "node:assert/strict";
import { test } from "node:test";

import { PGlite } from "@electric-sql/pglite";

type BinaryCopyValue = {
  type: "int4" | "text" | "bytea";
  value: number | string | Buffer;
};

type BinaryCopyWriter = NodeJS.ReadWriteStream & {
  write(chunk: BinaryCopyValue[]): boolean;
};

const { rowWriter } = require("pg-copy-streams-binary") as {
  rowWriter: () => BinaryCopyWriter;
};

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
	indented</text>
  </g>
</svg>`;

  const content = Array.from({ length: 256 }, () => svgBlock).join("\n");

  return Array.from({ length: 32 }, (_, index) => ({
    id: index + 1,
    content,
    payload: Buffer.from([0, 1, 2, 127, 128, 255, index]),
  }));
}

async function createBinaryCopy(rows: CopyRow[]): Promise<Blob> {
  const writer = rowWriter();
  const chunks: Uint8Array<ArrayBuffer>[] = [];

  const completed = new Promise<void>((resolve, reject) => {
    writer.on("data", (chunk: Buffer) =>
      chunks.push(new Uint8Array(chunk).slice()),
    );
    writer.once("end", resolve);
    writer.once("error", reject);
  });

  for (const row of rows) {
    writer.write([
      { type: "int4", value: row.id },
      { type: "text", value: row.content },
      { type: "bytea", value: row.payload },
    ]);
  }

  writer.end();
  await completed;

  return new Blob(chunks);
}

test("PGlite COPY imports large JS data using PostgreSQL binary COPY", async () => {
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
    const binaryCopy = await createBinaryCopy(rows);

    await pg.query(
      "COPY copy_rows (id, content, payload) FROM '/dev/blob' WITH (FORMAT binary)",
      [],
      { blob: binaryCopy },
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
