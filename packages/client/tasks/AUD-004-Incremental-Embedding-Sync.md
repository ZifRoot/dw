# AUD-004 — Incremental synchronization of embeddings

## Problem

The client currently requests embedding changes from an effectively fixed historical date on every reload:

`embeddingsQueryGet({ updateat: lowDate })`, where `lowDate` is initialized to a date in 2000.

As a result, every reload can repeatedly scan the embedding history and then fetch full embeddings for sessions that appear in the result. This defeats incremental synchronization and creates unnecessary network traffic, vector processing, IndexedDB operations, and reload latency.

## Goal

Make embedding synchronization incremental **without changing the server API contract**.

The existing endpoint remains:

`GET /embeddings/query?updatedAt=<date>`

The response format and generated API DTOs must not be changed.

## Proposed solution

Persist the last successfully synchronized embedding `updatedAt` value in the client's existing IndexedDB database.

Introduce a generic `settings` table rather than a dedicated `embeddingSyncState` table:

```ts
interface SettingTable {
  key: string;
  value: string;
}
```

Store the watermark as:

```text
key   = embeddings.updatedAt
value = <ISO date string>
```

For example:

```text
embeddings.updatedAt = 2026-09-21T08:31:42.123Z
```

## Synchronization flow

1. Read `settings["embeddings.updatedAt"]`.
2. If it does not exist, use the existing initial historical date for the first full synchronization.
3. Call the existing `/embeddings/query?updatedAt=<date>` endpoint with that date.
4. Synchronize the returned embedding metadata/full vectors using the existing two-stage flow.
5. Calculate `maxUpdatedAt` from the successfully received changes.
6. Persist `maxUpdatedAt.toISOString()` to `settings["embeddings.updatedAt"]`.
7. On the next reload, use this value as the `updatedAt` parameter.

Conceptually:

```text
settings["embeddings.updatedAt"]
        |
        v
GET /embeddings/query?updatedAt=<value>
        |
        v
changed embeddings
        |
        v
syncEmbeddingsWithServer()
        |
        v
IndexedDB embeddings
        |
        | successful
        v
maxUpdatedAt(changed)
        |
        v
settings["embeddings.updatedAt"]
```

## Important invariants

### 1. The watermark advances only after successful synchronization

Do not update `embeddings.updatedAt` before all returned data has been successfully written to IndexedDB.

If synchronization fails, the previous watermark must remain unchanged so that the next reload retries the same range.

### 2. Do not use client time as the watermark

Do not use `Date.now()` or the reload time as the synchronization boundary.

The watermark must be derived from the timestamps returned by the server:

`maxUpdatedAt = max(updatedAt(changed))`

This avoids client/server clock skew and ensures that the synchronization position is based on server data.

### 3. Do not change the server response contract

Do **not** introduce a response such as:

```ts
{
  items: [...],
  nextCursor: "..."
}
```

The existing `updatedAt`-based query contract is sufficient for this fix.

### 4. Keep the setting generic

The database setting is intentionally generic and reusable:

```ts
{
  key: string;
  value: string;
}
```

The embedding-specific meaning belongs in the key (`embeddings.updatedAt`), not in a dedicated database table.

## Expected implementation areas

- Add the generic `settings` table to `PointDB` and its schema/version migration if required.
- Add helpers for reading/writing settings where appropriate.
- Replace the fixed `lowDate` embedding query in `DataManager` with the persisted `embeddings.updatedAt` value.
- Calculate `maxUpdatedAt` from the query result.
- Persist the watermark only after `syncEmbeddingsWithServer()` succeeds.
- Preserve the existing initial full synchronization behavior when the setting is absent.
- Remove the now-unnecessary fixed `lowDate` state if it is no longer needed.
- Keep the server API and generated client contract unchanged.

## Acceptance criteria

- A fresh client performs the initial embedding synchronization from the existing initial date.
- After a successful synchronization, `settings["embeddings.updatedAt"]` contains the maximum server `updatedAt` value received.
- Subsequent reloads query only for embeddings newer than the persisted watermark.
- A failed embedding synchronization does not advance the watermark.
- The server endpoint contract is unchanged.
- No dedicated `embeddingSyncState` table is introduced.
- The existing embedding synchronization logic continues to work for returned sessions and models.
