# Domain Architecture Plan

## Status

This document fixes the architecture plan discussed for the client after separating generic point infrastructure from Embedding and Levenshtein-specific concerns.

The selected name for the top-level grouping is **Domain**.

This document describes the target architecture and migration plan. It does not implement the refactoring itself.

## 1. Problem

The client currently mixes two different kinds of point data:

- embedding-specific data;
- document / Levenshtein-specific data.

A point displayed by the UI can therefore contain information belonging to different subsystems.

The goal is to separate these responsibilities without duplicating common graph and scene infrastructure.

## 2. Main architectural decision

The client is divided conceptually into:

- **Core** — generic graph, point and scene infrastructure;
- **Domain** — domain-specific functionality built on top of Core;
- **UI** — React views and domain-specific UI DTOs.

Target structure:

    Core/
    ├── Point/
    ├── PointGraph/
    ├── PointScene/
    └── ...

    Domain/
    ├── Embedding/
    │   ├── ModelManager
    │   ├── PointModel
    │   └── EmbeddingPoint
    │
    └── Levenshtein/
        ├── LevenshteinManager
        ├── DocumentModel
        └── DocumentPoint

The exact file names may evolve, but the architectural boundary is intentional.

## 3. Core responsibility

Core contains only concepts independent of a particular domain.

The base Point belongs to Core.

PointScene belongs to Core.

PointGraphManager belongs to Core.

Core must not need to know whether a point is:

- an embedding point;
- a document point;
- a future search point;
- a clustering point;
- another domain-specific point.

A specialized point may inherit from Point, but Core operates on the base abstraction.

## 4. PointScene and specialized point types

PointScene is responsible for displaying and interacting with points.

It is also the place where user interaction such as click or selection is detected.

However, PointScene must not interpret specialized point types.

It should work with the base Point:

    PointScene
        receives Point
        detects interaction
        publishes event

It must not contain logic that checks PointModel, DocumentPoint, or other specialized types.

## 5. Events as the extension point

The main extension mechanism is a generic point interaction event.

Examples:

    PointClicked(Point)
    PointSelected(Point)
    PointDeselected(Point)
    PointDoubleClicked(Point)

The event carries the base Point.

The scene does not decide what this point means for a particular domain.

The specialized domain manager subscribes to the event and interprets the point itself.

Target flow:

    PointScene
        │
        │ PointClicked(Point)
        │
        ├──> Embedding / ModelManager
        │       │
        │       └── PointModel -> UIEmbeddingPoint
        │
        └──> Levenshtein / LevenshteinManager
                │
                └── DocumentPoint -> UIDocumentPoint

A manager may simply ignore an event when the supplied point does not belong to its domain.

## 6. Analogy with EdgeFactory

This follows the same architectural idea already used by the graph infrastructure.

PointGraphManager works with generic EdgeRef.

It does not need to know which concrete Edge implementation should be created. Concrete creation is delegated through IEdgeFactory.

The same principle applies to point interpretation:

    PointGraphManager
        EdgeRef
           │
           └──> IEdgeFactory
                    └──> concrete Edge

    PointScene
        Point
           │
           └──> domain manager / adapter
                    ├──> PointModel
                    └──> DocumentPoint

The central principle is:

> Generic infrastructure publishes generic information. Specialized code provides the interpretation.

This prevents Core from accumulating knowledge about every future domain.

## 7. Domain-specific UI DTOs

The UI must not use one universal DTO containing all possible domain-specific data.

UI models should be separated by domain.

At minimum:

    UIEmbeddingPoint
    UIDocumentPoint

An embedding DTO may contain:

- embedding model names;
- semantic neighbors;
- cosine distance;
- other embedding metadata.

A document / Levenshtein DTO may contain:

- full document text;
- Levenshtein-specific information;
- textual/edit information;
- other document-domain metadata.

The exact fields are to be determined during implementation.

Important rule:

> A UI DTO represents one domain contract and does not contain references to domain objects from another layer.

## 8. Domain to UI mapping

The specialized manager owns conversion from its domain model to its UI DTO.

    PointModel
        └──> UIEmbeddingPoint

    DocumentPoint
        └──> UIDocumentPoint

The UI must not perform casts from a generic point to a specialized domain class merely to obtain additional UI data.

React components must not import domain classes just to discover additional fields.

## 9. AppMediator responsibility

The mediator remains the communication mechanism between application subsystems.

However, the mediator must not become a universal object containing every possible property of every domain.

Conceptually:

    AppMediator
    ├── Core point/graph events
    ├── Embedding domain state/events
    └── Levenshtein domain state/events

The exact API should be designed during implementation.

The important constraint is that adding a new domain must not require continuously expanding one universal point DTO or adding domain-specific fields to Core objects.

## 10. React UI separation

React panels should consume the DTO belonging to their domain.

    EmbeddingPanel
        <- UIEmbeddingPoint

    DocumentPanel
        <- UIDocumentPoint

Panels should not know about PointModel, DocumentPoint, or other Core/domain implementation classes.

The intended boundary is:

    Domain object
        ↓
    Domain manager / adapter
        ↓
    Domain UI DTO
        ↓
    Mediator
        ↓
    React panel

## 11. Domain structure

The selected top-level name is **Domain**.

### Embedding

Responsibilities include semantic embeddings and embedding-based point data.

Expected contents:

    Domain/Embedding/
    ├── ModelManager
    ├── PointModel
    └── EmbeddingPoint

Names may be adjusted if the existing model hierarchy indicates better terminology.

### Levenshtein

Responsibilities include document points and textual/edit-distance functionality.

Expected contents:

    Domain/Levenshtein/
    ├── LevenshteinManager
    ├── DocumentModel
    └── DocumentPoint

The existing DocumentPointsScene concept is planned to become LevenshteinManager because it is a domain manager rather than a generic scene.

## 12. PointGraphManager

PointGraphManager remains generic.

It owns common graph structure:

- points;
- edges;
- edge references;
- graph updates.

It does not calculate Levenshtein distance.

It does not calculate embeddings.

It does not decide how a point is represented in a domain-specific UI.

It continues to use generic contracts such as EdgeRef and factories for specialized edge creation.

## 13. PointScene

PointScene remains generic.

Responsibilities:

- rendering points;
- tracking interaction;
- detecting selection/clicks;
- publishing generic point events.

PointScene must not acquire dependencies on:

- PointModel;
- DocumentPoint;
- LevenshteinManager;
- embedding-specific models.

## 14. Levenshtein boundary

Levenshtein functionality remains a domain concern.

    Core
      Point
      PointGraphManager
      PointScene

    Domain/Levenshtein
      DocumentPoint
      LevenshteinManager
      Levenshtein edge/data logic

    Domain/Embedding
      PointModel
      ModelManager
      embedding-specific logic

Levenshtein calculation and document-specific data must not leak into Core.

## 15. Migration plan

### Step 1 — establish Domain folders

Create:

    Domain/
    ├── Embedding/
    └── Levenshtein/

Move domain-specific classes first.

Do not mix this step with unrelated behavior changes.

### Step 2 — isolate Core

Ensure that Core classes depend only on generic types.

Especially inspect:

- PointScene;
- point graph infrastructure;
- generic scenes;
- mediator contracts.

Remove domain-specific imports from Core.

### Step 3 — introduce PointScene generic events

Add generic point interaction events.

Events should carry the base Point.

Start with the minimum event set required by the UI instead of creating a large event hierarchy.

### Step 4 — subscribe domain managers

Make ModelManager and LevenshteinManager subscribe to the generic point events.

Each manager determines whether the point belongs to its domain.

### Step 5 — split UI DTOs

Replace the mixed point UI model with domain-specific DTOs.

At minimum:

    UIEmbeddingPoint
    UIDocumentPoint

### Step 6 — move mapping into domain managers

Each manager becomes responsible for:

    Domain object -> domain UI DTO

React receives DTOs and stops importing domain classes.

### Step 7 — separate mediator contracts

Adjust AppMediator so embedding and Levenshtein state/events are represented by separate contracts.

Avoid creating one large mediator property containing every domain field.

### Step 8 — migrate React panels

Update panels so each panel consumes only the DTO for its domain.

Remove domain-specific casts from React.

### Step 9 — remove obsolete mixed abstractions

After all consumers are migrated:

- remove obsolete fields from generic DTOs;
- remove domain imports from Core;
- remove compatibility code;
- remove obsolete manager/scene names.

### Step 10 — verify architecture

Search the project for forbidden dependencies.

Examples:

    Core -> Domain
    React -> Domain implementation
    UI DTO -> Domain object reference
    PointScene -> PointModel
    PointScene -> DocumentPoint

The desired result is that these dependencies no longer exist.

## 16. Do not over-expand the mediator

The event-based design must not simply move the previous coupling into AppMediator.

The mediator should transport application-level contracts. It should not become a registry of all domain models.

When a new domain is added, prefer:

    generic Point event
        ↓
    new domain manager
        ↓
    new domain DTO
        ↓
    new domain UI

over:

    new domain
        ↓
    add fields to Point
        ↓
    add fields to universal UIPoint
        ↓
    add fields to AppMediator
        ↓
    modify PointScene

The second approach recreates the original architectural problem.

## 17. Non-goals

This refactoring does not currently aim to:

- redesign the physics engine;
- redesign PointGraphManager;
- change Levenshtein algorithms;
- change embedding algorithms;
- redesign SVG rendering;
- replace the mediator architecture completely;
- introduce a full dependency-injection framework;
- introduce a new event bus library.

The goal is to establish clean domain boundaries using the existing architecture.

## 18. Expected final architecture

    UI
    React + UI DTOs
             │
             │ DTO / mediator
             ▼
    AppMediator
             │
             │ generic events
             ▼
    Core
      Point
      PointScene
      PointGraphManager
             │
             │ base Point
             ▼
       ┌─────┴─────────────────────┐
       │                           │
       ▼                           ▼
    Domain/Embedding          Domain/Levenshtein
      ModelManager              LevenshteinManager
      PointModel                DocumentModel
      EmbeddingPoint            DocumentPoint
      UIEmbeddingPoint          UIDocumentPoint

Central architectural rule:

> Core knows the generic Point. Domains know their specialized Points. UI knows domain DTOs, not domain objects.

## 19. Acceptance criteria

The refactoring can be considered complete when:

1. The top-level domain grouping is named Domain.
2. Embedding and Levenshtein-specific classes are located under their respective domains.
3. Core does not import specialized domain point types.
4. PointScene operates on the base Point.
5. PointScene publishes generic point interaction events.
6. Domain managers subscribe to the events they need.
7. Embedding and document/Levenshtein UI models are separate DTOs.
8. UI DTOs contain data, not domain object references.
9. React panels do not cast generic points to specialized domain classes.
10. Domain managers/adapters perform domain-to-UI mapping.
11. The mediator does not become a universal storage place for domain-specific point data.
12. Adding another point domain should not require modifying PointScene to recognize the new point type.

## 20. Implementation order

    Domain folders
        ↓
    Core dependency cleanup
        ↓
    PointScene generic events
        ↓
    Domain manager subscriptions
        ↓
    Separate UI DTOs
        ↓
    Domain → UI mapping
        ↓
    Mediator contract separation
        ↓
    React panel migration
        ↓
    Remove old mixed abstractions
        ↓
    Architecture verification

This order is intentional: first establish ownership and boundaries, then move data through those boundaries, and only then remove compatibility code.
