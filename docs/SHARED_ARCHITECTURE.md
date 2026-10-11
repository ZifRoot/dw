# Shared source architecture

## Purpose

This document describes a general **Shared source-layer pattern**, illustrated by its use in DW. One canonical copy of source code is consumed directly by several independent consumers, while each consumer keeps its own compilation context and runtime assumptions.

The idea is broader than a directory named `shared`. It is an architectural choice about **ownership of source code, compilation, runtime boundaries, and dependency resolution**.

The pattern is useful when a repository contains multiple source trees—call them A, B, C, and so on—that need to reuse implementation code but have different runtimes, TypeScript configurations, module formats, build tools, or dependency graphs. A consumer can be an application, a service, a worker, a command-line tool, or a test suite; the important property is its independent execution and compilation context, not its name.

## The problem this pattern addresses

This pattern is for a specific architectural constraint: **several independent TypeScript projects must compile the same original source files, while each project must keep its own source root**. The source should not be copied into each project, and the shared code should not become a separately built package.

### Start with the project boundaries

Imagine a repository with three independent consumers: a backend, a frontend, and a CLI tool. Each has its own `tsconfig.json`, compiler settings, and runtime. Their compilation roots are intentionally local to each project; raising them to a common parent directory is not allowed by the repository's architecture.

A simplified layout might look like this:

```text
src/
├── shared/                       # The one canonical source tree
├── backend/
│   ├── tsconfig.json              # Backend's own project/root
│   └── shared -> ../shared        # Link to the canonical source
├── frontend/
│   ├── tsconfig.json              # Frontend's own project/root
│   └── shared -> ../shared        # Link to the canonical source
└── cli/
    ├── tsconfig.json              # CLI's own project/root
    └── shared -> ../shared        # Link to the canonical source
```

The exact source layout and `rootDir` values depend on the project. The important constraint is that each consumer has a bounded compilation root and cannot simply expand it to include the common parent directory.

### Why an ordinary import may fail

Suppose the backend imports a file directly from `src/shared/`. That physical path is outside the backend project's own source root. Depending on the TypeScript configuration and how files enter the compilation, TypeScript can reject the file with **TS6059** (“File is not under 'rootDir'”). Changing `rootDir` to a higher-level directory might remove that particular error, but it also changes the project's declared boundary—and in some repositories that is explicitly not permitted.

A workspace package is another valid architecture, but it introduces a package boundary and requires an intentional decision about exports, dependencies, and whether the shared code is built separately or compiled by consumers. Copying the files into each consumer avoids the path issue but creates multiple editable copies, which is a different and undesirable source-of-truth model.

### The solution under these constraints

Keep one canonical source tree and expose it **inside each consumer's own source tree** through a symbolic link (or an equivalent mechanism that makes the same files visible within that tree). Each consumer can then include the shared files under its own compilation root, while the physical source remains in one place.

This is not a claim that symbolic links are universally required for all shared TypeScript code. They are a fit when all of these conditions apply:

1. Several independent TypeScript consumers need the same original source files.
2. Each consumer must retain its own local compilation root; that root cannot be widened to a common parent.
3. The same physical source should be used—maintained copies are not acceptable.
4. The shared source should remain source-only rather than becoming an independently configured and built package.
5. Each consumer must compile and validate the shared code using its own TypeScript and runtime context.

Under these constraints, links (or an equivalent source-resolution mechanism) solve the source-root problem without changing the project boundaries or duplicating files. The absence of a shared `package.json` and `tsconfig.json`, the lack of a separate shared build, and immediate visibility of source changes are properties of this chosen model—not independent reasons to adopt it.

## The general model

## The general model

Keep one canonical copy of the shared source in a dedicated directory. Each consumer exposes that source under its own source tree through a filesystem link (or an equivalent source-resolution mechanism). In the abstract model, A, B, and C each point to the same canonical source:

```text
                         shared/src
                         canonical source
                                  |
                    +-------------+-------------+
                    |                           |
                    v                           v
             A/src/shared       B/src/shared       C/src/shared
                 link               link               link
                    |                           |
                    v                           v
             A's project          B's project          C's project
           runtime/config A      runtime/config B      runtime/config C
```

The links do not create copies of the files: all consumers resolve to the same canonical files. A change in the shared source is visible to A, B, C, and any other linked consumer without copying or publishing a package.

Each consumer compiles and runs that source in its own context. The shared source layer itself does **not** own a separate TypeScript project configuration or package manifest.

## Why filesystem links are used

The primary reason for this design is a **TypeScript source-root constraint**, not merely convenience or reduced packaging overhead.

Each consumer compiles Shared code as part of its own project. When a TypeScript consumer sets `rootDir` to its own `src` tree (or otherwise relies on a bounded source root), importing the canonical shared files directly from a sibling directory can put those files outside that root. TypeScript may reject them with **TS6059** (“File is not under 'rootDir'”), because the compiler is being asked to compile source outside the declared project root. The exact behavior depends on the consumer's configuration, but the architectural constraint is general: a source file outside a consumer's root may not be accepted as one of its compilation inputs.

The chosen solution is to keep the **canonical source** in a dedicated shared directory, while exposing it through a filesystem link under each consumer's `src` tree—for example, `A/src/shared`, `B/src/shared`, and `C/src/shared`. The source is then reachable within each consumer's compilation root while remaining physically owned in one place. Each consumer compiles the same files with its own TypeScript configuration, without moving the canonical files into an application or maintaining duplicate copies.

This is the decisive reason for the link locations: **the links point inward, into each consumer's source tree, so the shared files fall within that consumer's compilation root**. The design is useful when the requirements are one canonical source tree, consumer-owned compilation, and consumer-local source roots. Direct imports from outside a root may violate that boundary; a separately built package or copied source may be valid alternatives, but they change the model rather than preserve the same source-only arrangement.

The links also provide useful secondary properties:

1. **One source of truth.** There is one editable copy of each shared implementation.
2. **Consumer-owned compilation.** Each consumer includes the source in its own TypeScript project.
3. **Consumer-owned runtime assumptions.** The shared code is checked in each consuming context rather than being forced through one shared build.
4. **No duplicated source tree.** Both paths refer to the canonical source instead of requiring maintained copies.
5. **Immediate propagation.** Changes in the canonical source are available through the links.

The links are generated locally and are not committed as ordinary source directories. In DW, `.gitignore` excludes `packages/client/src/shared/*` and `packages/server/src/shared/*`; a fresh checkout must create the links before typechecking or building. The paths and scripts below are the concrete DW example; they are not requirements for every adoption of the pattern.

### Link creation in DW

The canonical source directory is:

```text
packages/shared/src
```

The consumer paths are:

```text
packages/client/src/shared  -> packages/shared/src
packages/server/src/shared  -> packages/shared/src
```

The repository contains link creation scripts:

- `scripts/link-shared.sh` creates symbolic links on Unix-like environments.
- `scripts/link-shared.cmd` creates Windows directory junctions.

The root script currently defines:

```json
{
  "scripts": {
    "link:shared": "bash ./scripts/link-shared.sh"
  }
}
```

Run `npm run link:shared` after a fresh checkout and before commands that resolve shared imports. Note the current portability detail: the root npm command invokes Bash even though a Windows `.cmd` implementation exists. A Windows setup without Bash may need to invoke the Windows script directly; this is a known entry-point inconsistency, not a reason to change the source-layer design.

The scripts expect the repository root as their working directory. The Unix script derives the root from its own location; the Windows script currently derives it from the current directory.

## TypeScript configuration belongs to the consumer

The shared source is intentionally not a standalone TypeScript project. In this architecture, the important distinction is between:

- **shared source** — reusable implementation code;
- **consumer compilation project** — the TypeScript configuration that includes and checks that source;
- **test project** — the separate environment in which tests run.

DW has a root `tsconfig.base.json` with common compiler options, but no root `tsconfig.json` that turns the repository root into an independent TypeScript project. The shared source itself has no `packages/shared/tsconfig.json`.

The current configuration reflects the consumer-owned model:

- Client: `packages/client/tsconfig.base.json` sets `lib` including `DOM` and `DOM.Iterable`, uses `module: "ESNext"` and `moduleResolution: "bundler"`, and configures client aliases.
- Server: `packages/server/tsconfig.base.json` extends the root base, declares Node types and server libraries, uses `module: "commonjs"`, and configures server aliases.
- Shared source is included via each consumer's `src` tree and is checked in that consumer's context.

Consequently, do not add a shared-only `tsconfig.json` merely because the shared directory contains TypeScript files. Doing so would create a separate project only if it is actually used as a compilation project; it would not replace the client/server checks. More importantly, a standalone compilation context would need an explicit target environment and could accidentally constrain the source to one set of APIs or module semantics.

### Shared source should remain environment-neutral

The source-layer model does not mean that any code can safely be shared. Code intended for both client and server should avoid depending on APIs that exist in only one consumer unless the dependency is isolated behind an explicit boundary.

For example, a utility used by both environments should not casually reference `window`, DOM classes, or Node-only globals. Consumer-specific adapters should remain with their consumers. Each consumer's typecheck then helps verify that the shared implementation is valid in that context.

## Import aliases express semantic roles, not physical layout

DW uses `@utils/*` for shared utility imports. It deliberately does **not** use `@shared/*`.

The reason is that an import should describe the role of the dependency rather than expose the repository's physical directory layout. The directory `packages/shared/src` is an implementation detail; `@utils/*` is the stable semantic name used by consumers.

The alias is configured in each consuming project's TypeScript configuration:

- Client: `@utils/*` maps to `src/shared/utils/*`.
- Server: `@utils/*` maps to `src/shared/utils/*`.

The actual runtime/build resolver must also understand the alias. In DW, the client uses `vite-tsconfig-paths`; the server release build uses `tsc-alias` because TypeScript does not rewrite path aliases in emitted JavaScript by itself.

When adding another alias, configure it in the relevant consumer(s) and in any build/runtime resolver required by those consumers. Do not introduce `@shared/*` as a second name for the same utilities.

## Tests are a separate environment

A common misconception is that because shared production source should not have its own compilation context, its tests should also be forced into either the client or server context. They should not.

Tests are executable code and have their own needs: a test runner, test APIs, test dependencies, and a selected runtime version. DW therefore treats shared tests as a distinct TypeScript project.

The current arrangement is:

```text
                         tsconfig.base.json
                                  |
                   +--------------+--------------+
                   |              |              |
                   v              v              v
             Client project  Server project  test/tsconfig.json
                   |              |              |
                   v              v              v
                Client          Server       Shared tests
```

Shared utility tests live under the root `test/` tree and use `test/tsconfig.json`. That configuration extends the root base directly rather than inheriting either the client or server project. Client and server tests likewise have their own configurations under their respective packages.

This test context is not a third production application. It is a separate compilation/runtime context for verifying shared code. Its Node.js version need not be identical to the server's runtime version; the selected version should instead be compatible with the test runner, test APIs, and supported CI environments.

In DW, tests run using Node.js's test runner through `tsx --test`. The GitHub Actions workflow currently uses Node.js 22. The CI host is not itself a TypeScript project; it supplies the runtime in which the tests execute.

## Dependency boundaries

A shared source directory should contain code that can genuinely be consumed by all intended consumers.

Before placing a module in shared, check:

1. Does it rely on browser-only or Node-only APIs?
2. Does it import a dependency available only in one consumer?
3. Does it assume one module format or a particular bundler?
4. Does it require configuration or services that belong to a specific application?
5. Can both consumer typechecks validate it?
6. Do its tests run in the chosen test environment without importing application-only runtime dependencies?

If the answer reveals a consumer-specific dependency, keep that code in the consumer or introduce a small explicit abstraction. Do not solve an environment mismatch by casually adding DOM types to the server or Node types to the client: that can hide an invalid dependency boundary.

## Setup and verification workflow

For a new checkout or a new environment:

1. Install repository dependencies using the repository's normal install command.
2. Create the filesystem links with `npm run link:shared` in an environment where the configured script can run.
3. Run the client typecheck.
4. Run the server typecheck.
5. Run the shared test project and the client/server test projects.
6. Run the normal build/CI checks.

In DW, the root commands include `npm run typecheck`, `npm run typecheck:tests`, and the test scripts. Use the commands defined by the current root `package.json`; this document describes the architectural roles, not a replacement for the command definitions.

The key verification principle is that shared code must be validated in **every intended consumer context**. A green shared test suite alone does not prove that client and server compilation or bundling can consume the code.

## Trade-offs and failure modes

This pattern deliberately trades some package-level tooling and portability for direct source reuse and consumer-specific compilation.

### Benefits

- one canonical source tree;
- no duplicate source copies or package build output;
- client and server retain independent compiler settings;
- shared code is validated under each consumer's constraints;
- no need to make the shared source conform to one preselected module/build target.

### Costs and risks

- links must be created after checkout and in each relevant environment;
- scripts must handle operating-system differences correctly;
- editor tooling and TypeScript path resolution must follow the links consistently;
- consumers may accidentally import APIs that are not available in the other consumer;
- the shared code is not an independently versioned or published package;
- package-level dependency declarations and public exports are not enforced by a shared `package.json`;
- a change can break one consumer even if the other consumer compiles successfully, so both must be checked.

The repository audits have identified the manual link setup and the root script's Bash dependency as operational weaknesses. Those are real costs of the current implementation and should be considered when adopting the pattern elsewhere.

## Why not use an npm workspace package?

A workspace package is a valid alternative, not an inherently wrong design. It is preferable when shared code needs its own package identity, declared dependencies, public exports, independent versioning, generated declarations, build artifacts, or a stable package API.

However, it also requires an explicit decision about how that package is built and consumed. If client and server need different compilation contexts for the same TypeScript source, a package approach must deliberately preserve that requirement—for example, through source exports and consumer-side compilation—or accept a separate build contract. Simply adding `packages/shared/package.json` does not by itself solve the environment question.

In DW, the source-layer design is intentional: shared production code is compiled by its consumers. The independent audit also records the opposite trade-off—manual links make fresh checkouts and cross-platform setup more fragile. These considerations should be weighed rather than treating either symlinks or workspace packages as universally superior.

## Applying the pattern to another project

Use this checklist when adapting the pattern:

- [ ] Identify the intended consumers and their runtime/compiler differences.
- [ ] Create one canonical shared source directory.
- [ ] Link that directory into the source tree of each consumer, or provide an equivalent source-resolution mechanism.
- [ ] Keep each consumer's TypeScript configuration independent.
- [ ] Configure a semantic import alias in every consumer and in its build/runtime resolver.
- [ ] Keep browser-only, server-only, and application-specific adapters outside the shared layer.
- [ ] Give shared tests their own explicit TypeScript/runtime context rather than inheriting one application's configuration by accident.
- [ ] Make link setup reproducible on every supported operating system and run it in CI after checkout.
- [ ] Typecheck/build every consumer and run the shared tests.
- [ ] Document the trade-offs: links are operational infrastructure, not committed source copies or package boundaries.

## Concrete example: DW

The general pattern above is used in DW with three distinct contexts: the client, the server, and the shared test suite. The client and server are production consumers; the tests are a verification consumer with their own TypeScript configuration, test runner, and runtime. The test suite does not inherit the client or server configuration merely because it tests shared code. This illustrates that A, B, and C need not all be applications: a test environment can be another independent consumer.

The current DW implementation details are described below and throughout the examples in this document. They should be treated as an example of the pattern, not as universal requirements.

## Existing DW documentation

This document consolidates the Shared-related design notes already present in the repository. The principal sources are:

- `docs/PROJECT_CONTEXT.md` — source-layer rationale, consumer TypeScript contexts, aliases, and separate shared-test context.
- `docs/INDEPENDENT_AUDIT_2026-09-23.md` — the decision to retain symlink/junction architecture and the cross-platform root-script caveat.
- `docs/INDEPENDENT_AUDIT_2026-09-18.md` — audit notes describing the manual link approach and the alternative of a workspace package.
- `scripts/link-shared.sh` and `scripts/link-shared.cmd` — the concrete link-creation behavior.
- `package.json`, `tsconfig.base.json`, `packages/client/tsconfig.base.json`, and `packages/server/tsconfig.base.json` — the current commands and compiler configuration.

This is a conceptual guide, not a claim that the implementation has no shortcomings. If the implementation changes, update the operational details here to match the code.
