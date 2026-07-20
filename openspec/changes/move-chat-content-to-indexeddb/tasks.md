## 1. IndexedDB Foundation

- [x] 1.1 Add `idb` and IndexedDB test-environment dependencies
- [x] 1.2 Define user-scoped local chat and message record types, store keys, and indexes
- [x] 1.3 Implement database initialization and versioned object-store upgrades
- [x] 1.4 Implement transactional local create, list, get, rename, append, and delete operations
- [x] 1.5 Add repository tests for ordering, user partitioning, message ordering, cascade deletion, and storage failures

## 2. Client-Owned Chat Lifecycle

- [x] 2.1 Remove server-provided chats and messages from authenticated layout and page data
- [x] 2.2 Make the conversation route pass its requested local chat ID without querying SQLite
- [x] 2.3 Hydrate the current user's sidebar and selected conversation from IndexedDB before showing chat state
- [x] 2.4 Replace create, rename, delete, and navigation calls with local repository operations
- [x] 2.5 Add explicit loading, unavailable-storage, empty-history, and missing-local-chat states
- [x] 2.6 Retain user-partitioned local chats across logout and restore them for the same returning user

## 3. Stateless Generation

- [x] 3.1 Define and unit test bounded validation for conversation IDs, roles, messages, aggregate history, and selected models
- [x] 3.2 Implement an authenticated stateless generation endpoint using client-supplied ordered history
- [x] 3.3 Enforce per-user, per-conversation in-memory concurrency and release keys on every terminal path
- [x] 3.4 Stream provider deltas and completion or error events without logging or persisting content
- [x] 3.5 Persist the user message locally before generation and the assistant message only after successful completion
- [x] 3.6 Preserve local user content and discard incomplete assistant output on request, stream, and cancellation failures

## 4. Server Persistence Removal

- [x] 4.1 Add a destructive forward migration that drops the SQLite `messages` and `chats` tables
- [x] 4.2 Remove the server chat repository and chat CRUD endpoints
- [x] 4.3 Remove obsolete server chat/message types and update remaining imports
- [x] 4.4 Update database tests to verify only account, session, OIDC flow, and migration data remain persisted
- [x] 4.5 Update route tests to verify no successful or failed generation writes conversation content server-side

## 5. Validation and Documentation

- [x] 5.1 Update Playwright coverage for local creation, reload, rename, delete, deep links, user partitioning, streaming, and logout retention
- [x] 5.2 Document browser-local retention, lack of synchronization or backup, storage clearing, and transient provider/backend processing
- [x] 5.3 Run formatting, lint, Svelte checks, unit and integration tests, Playwright, and the production build
