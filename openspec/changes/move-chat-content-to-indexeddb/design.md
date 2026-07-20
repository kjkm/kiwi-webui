## Context

The current chat lifecycle is server-owned: SvelteKit page loads query SQLite, chat CRUD routes mutate SQLite, and generation reloads stored messages before forwarding them to the OpenAI-compatible provider. This persists all user and assistant content on the server.

The target is local-first persistence. The authenticated backend remains responsible for OIDC sessions, provider credentials, model discovery, validation, and streaming proxy behavior, but it must not persist conversation content. Existing conversations may be deleted rather than migrated.

## Goals / Non-Goals

**Goals:**
- Persist chat titles, timestamps, and messages in IndexedDB under the authenticated user's ID.
- Preserve chat creation, listing, navigation, rename, delete, reload, streaming, and failure behavior.
- Send bounded conversation history to an authenticated stateless generation endpoint.
- Ensure backend SQLite contains no chat titles or message content after deployment.
- Make local-storage initialization and failure states explicit.

**Non-Goals:**
- Migrating existing SQLite chats.
- Synchronizing chats across browsers or devices.
- Providing backup, export, import, or at-rest encryption.
- Preventing same-origin JavaScript or browser developer tools from reading IndexedDB.
- Preventing conversation content from transiting the backend and configured model provider during generation.

## Decisions

### Use IndexedDB through a small typed repository

Add the `idb` package and isolate browser persistence behind a typed repository. The database will contain separate `chats` and `messages` object stores. Records include `userId`, and compound indexes scope chat activity and message ordering by user and conversation.

A separate message store avoids rewriting an entire conversation record whenever a message is appended. Creation, message append, activity timestamp updates, and deletion will use IndexedDB transactions. IDs are generated in the browser with `crypto.randomUUID()`.

Native IndexedDB without a wrapper was considered, but its event-based transaction API adds substantial incidental complexity. Local storage was rejected because it is synchronous, size-constrained, and unsuitable for indexed conversation history.

### Partition local records by authenticated user and retain them on logout

Every repository operation requires the current backend user ID and only returns records for that ID. Local conversations remain in IndexedDB after logout so that the same OIDC user recovers them on the next login. The unauthenticated application exposes no chat UI.

Deleting local data on every logout was rejected because it conflicts with persistent chat history. This partitioning is an application boundary, not encryption: clearing site data removes all chats, and same-origin scripts can technically access all local records.

### Hydrate chat state only in the browser

The authenticated layout server will return application configuration and user metadata but no conversations. `ChatApp` will show a storage-loading state until IndexedDB opens and the current user's chat summaries are loaded. Chat CRUD and selection then operate locally.

The `/c/[id]` route remains bookmarkable, but its ID is resolved against IndexedDB after hydration. A missing local chat produces a recoverable not-found state with a path to start a new chat rather than a server 404.

### Make generation stateless

Replace `/api/chats/[id]/generate` with an authenticated `/api/generate` endpoint. The request contains a client-generated conversation ID, selected model, and ordered history including the newest user message. The backend validates the complete payload, forwards only roles and content to the provider, and streams deltas without writing to SQLite.

The client persists the user message before starting generation. It accumulates streamed assistant text in memory and appends the assistant message to IndexedDB only after a valid completion event. A failed or interrupted completion therefore preserves the user message but no incomplete assistant message.

The conversation ID is used only in an in-memory `${userId}:${conversationId}` concurrency key and is never persisted server-side. The endpoint will bound per-message length, message count, and aggregate character count to limit memory and request abuse. Provider credentials remain server-only.

A server-issued opaque conversation record was rejected because it would retain unnecessary chat metadata and recreate server ownership of the chat lifecycle.

### Remove server chat persistence with a destructive migration

Add a forward SQLite migration that drops `messages` and `chats`. Keep `users`, `sessions`, `oidc_flows`, and migration bookkeeping. Remove the chat repository, chat CRUD endpoints, and chat-dependent server page loads.

Editing the initial migration was rejected because deployed databases may already have recorded it. No content export or one-time browser import will be provided.

### Preserve privacy boundaries explicitly

Generation request bodies and streamed content will not be logged. Content necessarily exists transiently in request handling and is sent to the configured model provider; the guarantee is no backend persistence, not end-to-end confidentiality.

## Risks / Trade-offs

- **Browser data is cleared or storage is evicted** → Treat IndexedDB as the source of truth, clearly surface storage failures, and document that chats are browser-specific and not backed up.
- **IndexedDB is unavailable or blocked** → Show a blocking, recoverable storage error and do not silently fall back to server persistence.
- **Large histories increase request size and provider cost** → Enforce message-count and aggregate-size limits before forwarding requests.
- **A shared browser retains data after logout** → Scope all UI access by OIDC user ID and document retention; encryption and automatic logout deletion remain out of scope.
- **Client and local database updates diverge during streaming** → Persist the user message before the request and persist assistant output only after successful completion.
- **Rollback expects dropped chat tables** → Application rollback requires restoring a pre-deployment database backup; discarded conversations cannot be recovered from the migrated database.

## Migration Plan

1. Introduce the IndexedDB schema and client repository.
2. Switch the UI and routes to local chat hydration and CRUD.
3. Introduce and validate the stateless generation endpoint.
4. Remove server chat APIs and repository usage.
5. Apply the destructive SQLite migration dropping message and chat tables.
6. Update documentation and automated tests to assert that server storage contains no conversation content.

Rollback can restore the previous application only with a pre-migration SQLite backup. Local chats created after rollout are not imported into the old server model.

## Open Questions

None. Existing server chats are intentionally discarded, local chats persist across logout for the same user, and cross-device synchronization is outside this change.
