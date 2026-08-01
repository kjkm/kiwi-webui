## Why

New conversations remain labeled `New chat`, forcing users to rename them manually or distinguish multiple generic sidebar entries. Generating a concise title from the first user message would make local chat history recognizable without adding server-side chat persistence.

## What Changes

- Generate a concise chat title from the first user message through the configured OpenAI-compatible provider after the first assistant response completes.
- Apply generated titles to browser-local normal chats without delaying or blocking the primary response.
- Preserve manual renames and safely discard late title results for renamed or deleted chats.
- Fail open when title generation is unavailable or returns invalid output.
- Generate a title for a temporary conversation only after the user explicitly saves it.
- Keep chat messages and generated titles out of server-side durable storage.

## Capabilities

### New Capabilities
- `generated-chat-titles`: Model-backed title generation, validation, background application, race handling, failure behavior, and saved temporary-chat behavior.

### Modified Capabilities

- `local-chat-storage`: Browser-local chat persistence conditionally applies generated titles without overwriting user-authored titles.

## Impact

- Adds an authenticated title-generation API and a bounded non-streaming provider request path.
- Updates client chat orchestration and the IndexedDB repository's rename semantics.
- Adds route, provider, repository, and browser regression coverage.
- Introduces one additional provider completion for each successfully started normal chat and each explicitly saved temporary chat; no SQLite schema or durable backend chat storage changes are required.
