## Why

Chat content is currently persisted in the backend SQLite database, which retains everything users enter and everything the model generates. Keeping conversation content in each user's browser instead reduces server-side data retention while preserving the authenticated chat experience.

## What Changes

- Store chat records, titles, messages, ordering, and timestamps in browser IndexedDB, partitioned by the authenticated OIDC user.
- Load, create, rename, delete, and navigate chats from client-side storage.
- Replace stateful generation with an authenticated stateless endpoint that accepts conversation history, proxies it to the configured provider, and streams the response without persisting content.
- Keep only users, sessions, and temporary OIDC flow state in backend SQLite.
- Discard existing server-side chats and messages without migration.
- Define local-data behavior for logout, browser storage loss, unavailable IndexedDB, and deep links to missing local chats.
- **BREAKING**: Remove the backend chat CRUD contract and server-side conversation persistence.

## Capabilities

### New Capabilities
- `local-chat-storage`: Browser-local persistence and lifecycle of user-partitioned chats and messages in IndexedDB.
- `stateless-chat-generation`: Authenticated generation using client-supplied history with no server-side conversation-content persistence.

### Modified Capabilities

None.

## Impact

- Replaces `ChatRepository`, chat API routes, chat page server loading, and SQLite chat/message tables.
- Changes the Svelte chat shell from server-provided conversations to client-hydrated IndexedDB state.
- Changes generation request validation, concurrency handling, and tests to operate on complete client-supplied histories.
- Existing persisted conversations are intentionally deleted; no export or migration path is provided.
- Chat history becomes browser/profile-specific and will not synchronize across devices.
