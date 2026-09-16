# Code Review — `dw`

**Repository:** `ZifRoot/dw`  
**Branch reviewed:** `dev`  
**Review type:** static architectural/code review  
**Date:** 2026-09-16

## 1. Executive summary

The project has a solid domain architecture for a research/pet-project that has grown into a fairly complex system. The main conceptual layers are already present:

```text
DeepSeek
   │
   ▼
Server
 ├── PostgreSQL
 ├── Synchronization
 └── Embeddings
        │
        ▼
     REST API
        │
        ▼
Client
 ├── IndexedDB
 ├── PointModel / EdgeModel / EmbeddingModel
 ├── NeighborGraph
 ├── ModelManager
 ├── Physics engines
 └── D3/SVG rendering
```

The project does **not** need a full rewrite. The main issue is that several original abstractions have been outgrown and now contain inconsistent invariants, lifecycle problems, security weaknesses, and performance bottlenecks.

The most important areas are:

1. API/security boundary and handling of DeepSeek credentials.
2. Consistent graph/edge identity.
3. Correct asynchronous behavior of server actions.
4. Embedding identity and lifecycle.
5. Client lifecycle/unsubscription.
6. `ModelManager` scalability.
7. Shared package/build infrastructure.
8. Reduction of `any`, mutation, and overly broad service/repository responsibilities.

---

# 2. Critical issues — P0

## CRITICAL-1 — DeepSeek credentials are stored as plain JSONB

`userTable.credentials` contains DeepSeek authorization/cookie data, while the DeepSeek client uses these values as HTTP credentials.

### Risk

The database therefore contains reusable authentication material. Combined with the current API boundary, compromise of the application/database can expose the user's DeepSeek session.

### Recommendation

- Encrypt credentials at application level, or move secrets to a dedicated secret store.
- Never expose credentials through DTOs/API responses.
- Never log authorization/cookie headers.
- Introduce authenticated user context before accessing credentials.

---

## CRITICAL-2 — API listens on `0.0.0.0`

The server binds to all network interfaces.

For a locally hosted application this unnecessarily exposes the API to the LAN.

### Recommendation

Default to:

```ts
app.listen(PORT, "127.0.0.1");
```

Make the bind address configurable if remote access is actually required.

---

## CRITICAL-3 — `ActionController` starts async work without awaiting it

Current behavior is effectively:

```text
POST /actions/update
       │
       ├── Update()
       │
       └── immediately return 200 OK
```

An exception occurring later does not affect the HTTP response.

### Recommendation

For a synchronous endpoint:

```ts
await this.program.Update();
return c.json({ status: "ok" }, 200);
```

For long-running synchronization/embedding operations, prefer a job model:

```text
POST /actions/update
        ↓
202 Accepted + jobId
        ↓
GET /actions/update/{jobId}
```

---

## CRITICAL-4 — `EdgeModel.id` ignores `modelName`

Current identity is effectively:

```text
sourceId-targetId
```

but graph uniqueness elsewhere is based on:

```text
sourceId + targetId + modelName
```

Therefore these two edges collide:

```text
A ─── B [model-A]
A ─── B [model-B]
```

### Recommendation

Define one canonical edge identity:

```ts
canonicalEdgeKey(sourceId, targetId, modelName)
```

For an undirected graph, canonicalize endpoint order first.

For example:

```text
min(A,B):max(A,B):model-A
```

Use this identity consistently in `EdgeModel`, `NeighborGraph`, collections, persistence, and serialization.

---

## CRITICAL-5 — `EmbeddingsController` returns a `Promise` as `received`

The POST implementation computes `count` through an async `reduce`, but the resulting promise is not awaited before constructing the response.

The response can therefore contain a Promise-derived value instead of the actual count.

### Recommendation

Prefer straightforward code:

```ts
let count = 0;

for (const [sessionId, embeddings] of groups) {
    count += await this.repo.createManyEmbeddings(
        sessionId,
        embeddings
    );
}
```

Readability is more valuable here than asynchronous `reduce` cleverness.

---

## CRITICAL-6 — DeepSeek HTTP client does not consistently validate HTTP status

The generic request path returns `fetch()` results and then callers often immediately parse JSON/array buffers.

Errors such as:

```text
401
403
429
500
```

can consequently become misleading JSON/parser errors.

### Recommendation

Introduce a single request wrapper which:

1. executes `fetch`;
2. checks `response.ok`;
3. reads useful error information;
4. reports endpoint/status;
5. optionally retries transient 429/5xx responses.

---

# 3. Critical/high-priority correctness issues — P1

## 3.1 `EdgeRef` is mutated during conversion

`PointGraphManager.edgeIndexToEdgeModel()` swaps `sourceId` and `targetId` directly on the supplied `EdgeRef`.

A conversion function should not unexpectedly mutate its input.

### Recommendation

Use local canonical values:

```ts
const [sourceId, targetId] =
    a < b ? [a, b] : [b, a];
```

Return a new object.

---

## 3.2 `fetch_page_all()` can fail on an empty page

The implementation accesses the first chat session before checking whether the page is empty.

### Recommendation

Handle empty pages explicitly and remove the unused temporary value.

---

## 3.3 Repository initialization uses `null!`

`InitDb()` effectively uses a non-null assertion to return `null` as an `IRepository`.

This defeats TypeScript's type checking.

### Recommendation

Either:

```ts
IRepository | null
```

or throw a clear initialization exception when the database cannot be started.

---

## 3.4 `AnimationEngine` has lifecycle hazards

The animation loop can schedule another `requestAnimationFrame` after a callback has caused a stop, and an exception in a callback can leave the engine in an inconsistent running state.

### Recommendation

Make the loop lifecycle explicit:

```text
start
  ↓
frame
  ↓
callbacks
  ↓
check running state
  ↓
request next frame
```

Use `try/finally` or a guarded scheduling path so `isRunning` and `rafId` remain consistent.

---

## 3.5 Physics engines subscribe without retaining unsubscribe callbacks

`RepulsionEngine` and `GraphEngine` subscribe to mediator events but do not retain the corresponding unsubscribe functions, unlike `ModelManager`.

This can cause stale handlers and memory leaks when engines are recreated.

### Recommendation

Store each unsubscribe function and implement `destroy()` consistently for every engine.

---

## 3.6 Embedding database identity is inconsistent with business logic

The database schema permits multiple embeddings for the same `(sessionId, modelName)` because the primary key includes creation time.

The application, however, frequently treats `(sessionId, modelName)` as the unique embedding identity.

### Recommendation

Choose one explicit model:

### Current embedding only

```text
PRIMARY KEY(session_id, model_name)
```

with upsert.

### Or immutable history

Keep versions/timestamps explicitly and make the current version selection part of the domain model.

For the current application behavior, a unique current embedding per `(session, model)` appears to fit better.

---

# 4. Performance issues — P1/P2

## 4.1 `ModelManager` performs O(N²) similarity work

The current improvement step compares points pairwise and calculates average cosine distance.

Approximate complexity:

```text
O(N² × M × D)
```

where:

- `N` = number of sessions;
- `M` = number of embedding models;
- `D` = embedding dimension.

There is also sorting of candidate edges.

### Recommendation

After correctness fixes, introduce a nearest-neighbor index:

```text
Embeddings
    ↓
EmbeddingIndex
    ↓
kNN per model
    ↓
NeighborGraph
```

For hundreds of sessions the current implementation is acceptable; for thousands/tens of thousands it will become a major bottleneck.

---

## 4.2 IndexedDB synchronization performs many sequential operations

Embedding synchronization repeatedly queries IndexedDB and then performs individual HTTP requests for sessions.

This can become an N+1-style synchronization pattern.

### Recommendation

Add batch API operations and batch IndexedDB reads where possible.

The existing embeddings query API should be evaluated for replacing per-session requests.

---

## 4.3 `DocumentsController` contains N+1 database access

`buildFullText()` loads messages and then queries fragments separately for each message.

Current pattern:

```text
1 query for messages
+
N queries for fragments
```

### Recommendation

Fetch all fragments for the session in one query and group them in memory.

The same principle should be applied to `buildFragmentsList()`.

---

## 4.4 Local synchronization does not clearly remove stale points

`syncPointsWithServer()` updates/adds server documents but does not symmetrically remove local points which disappeared from the server.

This can lead to:

```text
server: A B C
local:  A B C D E F
```

### Recommendation

Define synchronization semantics explicitly:

- authoritative server snapshot;
- incremental synchronization;
- tombstones/deletions.

Then implement deletion handling accordingly.

---

# 5. Architecture issues — P1/P2

## 5.1 `AppMediator` has become a God Object

`AppMediator` currently mixes:

- state storage;
- event bus;
- commands;
- notifications;
- graph state;
- selection state;
- progress state;
- UI state.

### Recommendation

Split conceptual responsibilities without introducing an unnecessarily heavy framework:

```text
AppState
SceneEvents
SceneCommands
GraphEvents
DataEvents
```

A lightweight typed mediator/event architecture is sufficient.

---

## 5.2 `BaseMediator` loses type safety through `any`

The base mediator stores values and event details as `any`.

The typed `AppMediator` API is therefore backed by an untyped core.

### Recommendation

Use a generic event/state map:

```ts
type EventMap = Record<string, unknown>;
```

and generic methods such as:

```ts
emit<K extends keyof TEvents>(event: K, value: TEvents[K])
```

This preserves TypeScript's value at the central boundary.

---

## 5.3 `DrizzleRepository` is too large

The repository currently handles users, sessions, messages, files, fragments, embeddings, transactions and multiple domain queries.

### Recommendation

Split persistence responsibilities:

```text
UserRepository
SessionRepository
MessageRepository
FileRepository
EmbeddingRepository
```

Then place cross-aggregate workflows into services such as:

```text
DeepSeekSyncService
EmbeddingService
```

This keeps repositories focused on persistence rather than orchestration.

---

## 5.4 Embedder has too many responsibilities

`EmbedderLmStudio` currently combines:

- LM Studio client behavior;
- model discovery;
- model lifecycle;
- embedding requests;
- pending-session discovery;
- database reads/writes;
- processing orchestration.

### Recommendation

Separate:

```text
LmStudioClient
EmbeddingModelRegistry
EmbeddingProcessor
EmbeddingRepository
EmbeddingScheduler
```

This will make retries, testing and model management much easier.

---

# 6. Domain model issues

## 6.1 `EntityCollection._setPoints()` is public despite being an implementation detail

A public method named `_setPoints()` signals that the class's invariants can be bypassed.

### Recommendation

Make it private and expose explicit operations such as:

```text
add
remove
replace
update
clear
```

Keep `items` and index structures protected from arbitrary external mutation where possible.

---

## 6.2 `EntityCollection.clone()` is not a true entity clone

The implementation uses object spread, which turns class instances into plain objects.

Therefore methods/prototypes can be lost.

### Recommendation

Use an entity-level `clone()`/copy factory or a dedicated immutable snapshot representation.

---

## 6.3 `PointModel.clone()` does not clone embeddings

`PointModel` contains mutable embedding state in a `Map`, but its clone implementation does not copy that state.

If the intention is to clone only coordinates/visual state, rename the method to communicate that fact. If it is a domain clone, copy all relevant state.

---

## 6.4 Two different similarity concepts are mixed

The project uses cosine distance as well as an `activeIndices`/intersection representation based on embedding activation and sign.

These are mathematically different representations.

### Recommendation

Separate them explicitly:

```text
EmbeddingVector
    ├── cosine similarity
    └── sparse/signature representation
```

Document where each metric is used and why.

Avoid temporary constants such as `0.5` when they represent unfinished domain logic.

---

# 7. API/design issues

## 7.1 Fake `/document/{id}/parse` endpoint

The endpoint currently returns an empty object while representing itself as a parser endpoint.

### Recommendation

Either:

- implement it;
- return `501 Not Implemented`;
- or remove it until the parser exists.

A fake successful endpoint is misleading for clients and future developers.

---

## 7.2 API schemas use `z.any()` where domain schemas should exist

This weakens OpenAPI generation and client typing.

### Recommendation

Define real Zod DTO schemas and derive OpenAPI from them.

Avoid `any` at the API boundary.

---

## 7.3 `Deepseek` client contains browser-specific headers

The HTTP client hardcodes headers such as `sec-ch-*`, browser platform information and version-like values.

### Recommendation

Keep only headers that are actually required by the API, for example:

```text
Authorization
Cookie
Accept
Content-Type
```

Encapsulate any genuinely required DeepSeek-specific protocol headers in one place and document why they are required.

Avoid pretending to be a particular browser unless the remote API explicitly requires it.

---

## 7.4 Hardcoded DeepSeek version/client metadata

Client/application version strings are embedded in requests.

### Recommendation

Centralize protocol metadata and make it easy to update. Add tests around the request format so a DeepSeek protocol change fails clearly.

---

# 8. Infrastructure/build issues

## 8.1 `shared` is implemented through filesystem links

The project creates links from:

```text
packages/server/src/shared
packages/client/src/shared
```

to `packages/shared/src`.

This makes the repository dependent on a manual filesystem setup step.

### Recommendation

Make `packages/shared` a real npm workspace package:

```text
packages/shared/
    package.json
    src/
```

and import it through a package name such as:

```text
@dw/shared
```

This removes junction/symlink setup from the build process.

---

## 8.2 Root scripts contain a concrete release-script typo

The release build command currently contains:

```text
npm run build:server :release
```

instead of:

```text
npm run build:server:release
```

This should be fixed immediately.

---

## 8.3 Build scripts are inconsistently cross-platform

The repository mixes:

- `bash`;
- Windows `.cmd` scripts;
- Windows path separators;
- `rm -rf`;
- Node tooling.

### Recommendation

Either explicitly support Windows only, or make root scripts platform-independent using Node `.mjs` helper scripts.

For example:

```text
scripts/
    clean.mjs
    link-shared.mjs
    generate.mjs
```

---

## 8.4 Duplicate `package-lock.json`

The repository contains a root lock file and a client-level lock file despite using npm workspaces.

### Recommendation

Use one root `package-lock.json` for the workspace unless there is a very deliberate reason to maintain multiple independent installations.

---

## 8.5 TypeScript/module configuration should be simplified

The server and client currently use different module/runtime assumptions.

This is technically possible, but the shared package becomes harder to reason about.

### Recommendation

Evaluate an ESM-oriented setup across packages, or document the intentional CommonJS/ESM boundary very clearly.

Do not change this merely for style; prioritize it after the correctness fixes above.

---

# 9. Code quality issues

## 9.1 Excessive `any`

Examples occur in controller helper methods and API schemas.

### Recommendation

Replace `any` with:

- domain interfaces;
- DTO types;
- generated API types;
- `unknown` at untrusted boundaries followed by validation.

---

## 9.2 Error swallowing

`DataManager.reloadTables()` catches errors and effectively ignores them.

This makes synchronization failures look like valid stale data.

### Recommendation

Log/report the failure and propagate it where appropriate:

```ts
catch (error) {
    logger.error(error);
    mediator.syncFailed(error);
    throw error;
}
```

---

## 9.3 Legacy/dead code in `RepulsionEngine`

There are multiple versions of the pairwise repulsion algorithm (`applyPair1`, `applyPair2`, `applyPair`).

### Recommendation

Remove obsolete implementations once the active algorithm is established. If alternatives are intentionally retained for experiments, move them to clearly named experimental code or document their purpose.

---

## 9.4 Configuration values which are not actually used

`GraphEngineConfig.targetDistance` is defined but the active graph implementation uses `edge.distance` instead.

### Recommendation

Remove unused configuration or connect it to the algorithm. Configuration should reflect actual behavior.

---

## 9.5 Naming/typos

There are examples such as:

```text
findAllFragmentsShrort
```

Small issues like this are harmless individually but are signs that large repository classes need cleanup.

---

# 10. Metrics/data-model consistency

The schema and views use several related but different concepts:

```text
logical text size
file size
total session size
embedding input size
processing time
throughput
speed
```

Some metrics operate on response fragments while others include files or other data.

### Recommendation

Define the semantics of each metric explicitly and use stable names, for example:

```text
message_text_bytes
file_bytes
embedding_input_bytes
session_total_bytes
embedding_processing_ms
embedding_throughput_bytes_per_sec
```

This prevents different views from silently measuring different quantities under similar names.

---

# 11. Documentation issues

The repository contains several large analysis/context documents:

```text
PROJECT_CONTEXT.md
INDEPENDENT_ANALYSIS.md
report-to-update.md
deep - 2026-09-15 20.01.md
```

These are useful during development, but some may describe historical states of the project.

This is particularly risky for AI-assisted development because an AI may treat an old analysis as the current architecture.

### Recommendation

Keep a small authoritative documentation set:

```text
README.md
ARCHITECTURE.md
docs/
```

Move temporary/historical analyses to `docs/archive/` or remove them after their conclusions have been incorporated into current documentation.

---

# 12. Recommended target architecture

Do not rewrite the project. Evolve it incrementally toward:

```text
packages/
├── shared/
│   ├── package.json
│   └── src/
│
├── server/
│   └── src/
│       ├── api/
│       ├── services/
│       │   ├── DeepSeekSyncService
│       │   ├── EmbeddingService
│       │   └── FileSyncService
│       ├── repositories/
│       │   ├── UserRepository
│       │   ├── SessionRepository
│       │   ├── MessageRepository
│       │   ├── FileRepository
│       │   └── EmbeddingRepository
│       └── clients/
│           ├── DeepSeekClient
│           └── EmbeddingClient
│
└── client/
    └── src/
        ├── domain/
        │   ├── PointModel
        │   ├── EdgeModel
        │   ├── EmbeddingModel
        │   └── NeighborGraph
        ├── graph/
        │   ├── PointGraphManager
        │   ├── ModelManager
        │   └── EmbeddingIndex
        ├── physics/
        ├── storage/
        └── rendering/
```

The important principle is separation of responsibilities, not adding frameworks.

---

# 13. Recommended implementation order

## Phase 1 — correctness/security

1. Fix `build:server:release` script typo.
2. Await `ActionController` operations.
3. Fix embedding `Promise` response bug.
4. Handle empty DeepSeek pages.
5. Add HTTP status/error handling to DeepSeek client.
6. Fix `EdgeModel.id` to include model identity.
7. Stop mutating `EdgeRef` during conversion.
8. Fix repository `null!` initialization.
9. Fix animation lifecycle.
10. Add unsubscribe/destroy lifecycle to all physics engines.
11. Protect credentials.
12. Bind localhost by default.
13. Add API authentication/authorization if the API is not strictly localhost-only.

## Phase 2 — domain consistency

1. Define canonical `EdgeKey`.
2. Make embedding identity explicit.
3. Separate cosine similarity from sparse/signature similarity.
4. Remove misleading temporary constants.
5. Make entity cloning semantics explicit.
6. Protect `EntityCollection` invariants.

## Phase 3 — architecture

1. Split `DrizzleRepository`.
2. Split `EmbedderLmStudio`.
3. Reduce `AppMediator` responsibilities.
4. Replace `any` with typed domain/DTO models.
5. Replace shared symlink architecture with a workspace package.

## Phase 4 — synchronization/performance

1. Remove N+1 document queries.
2. Add batch embedding synchronization.
3. Implement stale/deleted document handling.
4. Introduce nearest-neighbor indexing.
5. Profile graph layout with realistic data sizes.

## Phase 5 — tooling/documentation

1. Consolidate package locks.
2. Make scripts platform-independent or document supported OS explicitly.
3. Establish one authoritative architecture document.
4. Move historical AI analyses to an archive.
5. Add automated tests.

---

# 14. Priority table

| Priority | Issue |
|---|---|
| P0 | API authentication / credential protection |
| P0 | `EdgeModel.id` missing `modelName` |
| P0 | Fire-and-forget controller actions |
| P0 | Embedding `Promise` bug |
| P0 | DeepSeek HTTP error handling |
| P1 | API binding to `0.0.0.0` |
| P1 | `fetch_page_all()` empty-page handling |
| P1 | Animation lifecycle |
| P1 | Physics unsubscribe/lifecycle |
| P1 | `null!` DB initialization |
| P1 | Shared symlink architecture |
| P1 | N+1 database queries |
| P1 | Embedding identity inconsistency |
| P1 | IndexedDB synchronization inefficiency |
| P1 | `ModelManager` O(N²) algorithm |
| P2 | `AppMediator` God Object |
| P2 | Large `DrizzleRepository` |
| P2 | `EmbedderLmStudio` too many responsibilities |
| P2 | `any` in domain/API |
| P2 | Mutable `EdgeRef` conversion |
| P2 | Weak entity cloning semantics |
| P2 | Error swallowing |
| P2 | Dead/legacy physics code |
| P2 | Unused configuration |
| P3 | Naming/typos |
| P3 | Documentation drift |
| P3 | Lockfile/tooling cleanup |

---

# 15. Final assessment

The architecture is fundamentally viable. The project should be **refactored incrementally rather than rewritten**.

The most important architectural invariant to establish first is:

```text
identity must be consistent across

Domain model
      ↓
Graph
      ↓
Collections
      ↓
Persistence
      ↓
API
```

In particular:

```text
Edge = source + target + embedding model
Embedding = session + embedding model
```

Once these identities are made explicit, the remaining refactoring becomes much safer.

The second major objective is to turn the current application from a collection of working asynchronous components into a system with explicit lifecycle and error semantics.

The third is scalability: only after correctness is stabilized should the O(N²) graph calculation and synchronization round-trips be optimized.

**Recommended first engineering milestone:** complete all P0 items, then implement canonical `EdgeKey`/embedding identity and add tests around these invariants before undertaking larger refactoring.
