# GitHub Star Show Architecture

## Purpose

This document describes the system architecture of `GitHub Star Show`.

It is intentionally different from `README.md`:

- `README.md` explains what the project is, how to run it, and what it currently does.
- `ARCHITECT.md` explains how the system is structured, why major decisions were made, and how future changes should fit into the architecture.

The project should be understood as:

`GitHub Stars as ingestion source -> local project library as system of organization`

Not as:

`A perfect mirror of GitHub Stars`

That distinction drives almost every architectural choice below.

---

## Architectural Positioning

### Core product model

The system is a **personal open-source asset library** built on top of GitHub Stars.

GitHub provides:

- identity
- repository metadata
- starring state
- remote lifecycle signals

This application provides:

- local persistence
- user-owned organization
- categorization
- notes and curation
- sync history
- remote health tracking

### Source of truth

The architecture uses a **split source-of-truth model**:

- GitHub is the source of truth for remote facts.
- Local database is the source of truth for user organization.

Remote facts include:

- repository name
- description
- language
- topics
- stars count
- archive / missing / unstarred state

User-owned fields include:

- category
- note
- recommended flag
- local status

This means the system is neither:

- a fully detached local notebook
- nor a strict GitHub mirror

It is a hybrid.

---

## High-Level System Layout

```text
Browser (Vue + Vite)
        |
        v
Backend API (Express)
        |
        +--> Prisma ORM
        |        |
        |        v
        |     SQLite
        |
        +--> GitHub REST API
        |
        +--> Optional AI classification provider
```

### Frontend responsibilities

The frontend is responsible for:

- authentication entry
- project browsing
- project detail display
- local editing workflows
- sync controls
- filtering, pagination, and admin interactions
- lightweight i18n presentation

The frontend should remain thin with respect to domain logic. It may format or group data, but should not own sync rules or classification rules.

### Backend responsibilities

The backend is responsible for:

- GitHub OAuth flow
- session lifecycle
- sync orchestration
- classification logic
- remote state inspection
- user/project persistence
- conflict resolution policy
- exposing stable API responses to the frontend

### Database responsibilities

The database is responsible for:

- durable user state
- durable project metadata
- durable user-to-project relationships
- sync history
- future auditability of remote changes and user edits

---

## Bounded Domains

The codebase naturally splits into five domains.

### 1. Identity domain

Concerns:

- GitHub login
- local user creation
- GitHub account linkage
- session persistence
- scope-based capabilities such as `canManageStars`

This domain answers:

- who is the user
- what GitHub account is attached
- what the application is allowed to do on the user’s behalf

### 2. Catalog domain

Concerns:

- repository metadata
- project listing
- detail view
- project import
- README retrieval

This domain answers:

- what repositories exist in the local library
- what metadata is known about them

### 3. Curation domain

Concerns:

- categories
- notes
- recommended flags
- local user status
- future manual locks / field-level protection

This domain answers:

- how the user has organized a repository

### 4. Sync domain

Concerns:

- full sync
- incremental sync
- sync history
- diffing remote state
- remote health status

This domain answers:

- how GitHub state is ingested
- how local and remote changes are reconciled

### 5. Classification domain

Concerns:

- rules-based categorization
- structured metadata mapping
- future local NLP classifier
- optional AI classifier

This domain answers:

- how projects receive category suggestions

---

## Data Model Intent

The exact schema may evolve, but the conceptual model should stay stable.

### `User`

Represents a local application user.

Should contain:

- stable local id
- display info
- timestamps

### `GithubAccount`

Represents the user’s linked GitHub identity.

Should contain:

- GitHub user id
- login
- avatar / profile metadata
- tokens or token references
- granted scopes / capability flags

### `Session`

Represents authenticated application sessions.

Should contain:

- session token
- user relation
- expiry

### `Project`

Represents global repository metadata.

This should be treated as the normalized repository record shared across users when possible.

Should contain:

- owner / repo identity
- repository metadata
- GitHub URL
- language
- topics
- description
- stars count
- last pushed / updated time
- optional AI/rules enrichment fields

### `UserProject`

Represents the user-specific overlay on top of a repository.

This is the key architectural table.

It should contain:

- relation to `User`
- relation to `Project`
- local category
- note
- recommended flag
- local status
- remote status
- remote status note
- future field-level manual lock metadata

### `SyncRun`

Represents each sync execution.

Should contain:

- mode: `full` or `incremental`
- timestamps
- counts
- outcome status
- optional diagnostic summary

---

## Why `Project` and `UserProject` Both Exist

This is a deliberate normalization strategy.

### `Project` exists because

- repository metadata is globally meaningful
- it avoids storing the same GitHub facts repeatedly
- sync and import logic can update a single canonical record

### `UserProject` exists because

- different users may organize the same repository differently
- user notes are not global facts
- local status is not a GitHub fact
- remote lifecycle should be visible per user relationship

The architecture should continue to protect this distinction.

Future features should avoid collapsing these two concepts together.

---

## Sync Model

The sync system is intentionally **multi-mode**.

### Incremental sync

Goal:

- fast daily ingestion of newly starred repositories

Characteristics:

- optimized for frequent use
- does not re-scan the full library
- should avoid destructive behavior

Primary responsibility:

- add new Star items
- update sync history

### Full sync

Goal:

- periodic reconciliation with GitHub

Characteristics:

- slower but more complete
- used for remote state diffing
- used for repair and health checks

Primary responsibility:

- refresh full Star set
- detect repositories that are no longer starred
- detect archived repositories
- detect missing repositories

### Why both modes are required

Incremental sync gives usability.

Full sync gives correctness.

A system with only incremental sync becomes stale.
A system with only full sync becomes heavy and slow.

---

## Remote State Strategy

The project intentionally does **not** hard-delete local records just because GitHub state changed.

Instead, it applies a remote lifecycle label.

Current conceptual statuses:

- `active`
- `unstarred`
- `missing`
- `archived`

### Rationale

This supports the product identity of a local asset library.

If a user:

- unstars a repository on GitHub
- or the repository disappears remotely

the application should usually:

- preserve the local record
- preserve the user’s organization work
- mark the remote state clearly

This is a conscious choice against strict mirror behavior.

### Principle

Remote state changes should be **visible first**, **destructive only by user choice**.

---

## Manual Edit Protection Strategy

The architecture should follow **field-level protection**, not record-level freezing.

### Recommended rule

User-edited curation fields should be protected from automatic overwrite.

Remote fact fields should continue to update.

### Example

If the user edits:

- category
- note
- recommended
- local status

then sync should continue updating:

- repository name
- description
- stars count
- pushed date
- remote status

### Why record-level freeze is wrong

A single note edit should not freeze the repository forever.

That would make the remote health model untrustworthy.

### Future implementation direction

Prefer a field-level lock model such as:

- `manualCategory`
- `manualNote`
- `manualRecommended`
- `manualStatus`

Or an equivalent structured lock record.

Avoid a single coarse `isManualEdited` flag as the only protection rule.

---

## Classification Architecture

Classification should remain layered.

### Layer 1: structured rules

Highest priority:

- GitHub topics
- language fallback
- name / description keyword rules

This layer should stay:

- cheap
- deterministic
- explainable
- available without AI

### Layer 2: future local classifier

When enough clean labeled data exists, a local NLP classifier may be added.

Its role should be:

- assist on rule misses
- remain local and low-cost

It should not replace the rule layer prematurely.

### Layer 3: optional AI enhancement

AI should remain:

- optional
- batched
- used for difficult tail cases

AI must never become a mandatory dependency for core system operation.

---

## Read Flow

### Project list flow

1. Frontend requests the current user’s project list.
2. Backend resolves session user.
3. Backend loads user-specific project view.
4. Backend returns normalized records shaped for UI consumption.
5. Frontend applies filtering and pagination.

### Project detail flow

1. Frontend requests a project by id.
2. Backend loads the user-specific project overlay if logged in.
3. Backend enriches the record with README content.
4. Frontend renders overview, notes, links, and README sections.

README retrieval is intentionally enrichment, not the base list payload, to keep list responses lighter.

---

## Write Flow

### Local edit flow

1. User edits project fields in admin.
2. Frontend sends patch/create request.
3. Backend updates canonical project fields if needed.
4. Backend writes user-specific overlay fields.
5. Future syncs must respect manual protection rules on those fields.

### Local delete flow

Default behavior:

- remove the user’s local relationship only

Optional behavior:

- also unstar on GitHub if explicitly selected and authorized

This is intentionally user-controlled, not automatic.

---

## Failure Model

The system integrates with external APIs, so failures are normal, not exceptional.

### Expected failure categories

- GitHub rate limits
- token expiry
- insufficient GitHub scopes
- repository not found
- network failure
- partial sync failure

### Architectural rule

Failures should degrade gracefully:

- preserve local data
- avoid silent destructive behavior
- surface enough state for users to retry or understand what happened

### Important example

When a user chooses:

- remove locally
- and also unstar on GitHub

then GitHub unstar must succeed first before local deletion completes.

This prevents cross-system inconsistency.

---

## Frontend Architecture Notes

The frontend currently uses a lightweight component architecture rather than a full client-side state framework.

That is acceptable for the current system size, provided that:

- domain logic remains in the backend
- components stay mostly presentational
- API response contracts stay stable

### Current UI zones

- sidebar navigation
- hero/sync control zone
- stats zone
- pagination zone
- project grid
- project detail drawer
- admin panel

This is a workable structure.

Future UI work should focus on:

- clearer hierarchy
- reduced density in cards
- better admin efficiency

Not on introducing unnecessary frontend architectural complexity.

---

## Security and Capability Boundaries

### OAuth scopes

The application should always prefer minimum viable GitHub scope.

Capabilities should escalate only when a feature needs them, for example:

- read profile / read Stars
- optional unstar management

### Sensitive boundaries

The system acts on behalf of a user when:

- reading Stars
- checking starred state
- removing a Star

These actions should always remain explicit and auditable in code.

---

## Scheduling Model

Long-term, the system should support:

- frequent manual incremental sync
- scheduled full reconciliation

Recommended default:

- user-triggered incremental sync for day-to-day usage
- automatic weekly full sync for remote health reconciliation

This matches both product intent and operational cost balance.

---

## Extension Points

The architecture is already pointing toward several safe extension points.

### Safe future additions

- scheduled jobs
- stronger rule engine
- local NLP classifier
- optional AI batch classifier
- export formats
- public read-only views
- better audit history

### Additions that should be approached carefully

- turning the product into a general bookmark manager
- collapsing `Project` and `UserProject`
- moving core sync logic into the frontend
- making AI mandatory
- using a single coarse manual-edit freeze flag

---

## Non-Goals

The project should avoid drifting into these directions unless its product definition changes.

- a generic knowledge base platform
- a full GitHub alternative client
- a perfect real-time mirror of GitHub
- an AI-first product where basic operation depends on a paid model

---

## Architectural Priorities Going Forward

If development continues, the recommended order is:

1. strengthen engineering safety
2. strengthen sync correctness and observability
3. strengthen admin workflow efficiency
4. strengthen rule classification quality
5. add optional intelligence layers only after the above are stable

In short:

`stability before sophistication`

---

## One-Sentence Architecture Summary

`GitHub Star Show is a hybrid system that ingests GitHub Star data as remote facts, persists it locally as a user-owned project library, and protects user curation while continuing to reconcile external repository state over time.`
