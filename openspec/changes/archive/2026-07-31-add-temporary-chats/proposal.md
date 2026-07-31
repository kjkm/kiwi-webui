## Why

Users need a disposable conversation mode for prompts they do not want retained in browser history. Although normal Kiwi chats are already browser-local, they still survive reloads in IndexedDB; temporary chats should exist only in the current page session.

## What Changes

- Add an Open WebUI-style temporary-chat toggle to the new-chat header and a clear temporary-mode indicator in the empty state.
- Keep temporary chat messages and generated responses only in component memory, without creating chat or message records in IndexedDB.
- Keep temporary chats off `/c/{id}` routes and out of the sidebar history.
- Clear temporary content when the user leaves or reloads the page, starts a regular new chat, opens a saved chat, or disables temporary mode.
- Continue sending bounded temporary history to the existing stateless generation endpoint without adding backend persistence.
- Allow a user to explicitly save an active temporary conversation as a normal browser-local chat, matching Open WebUI's save-temporary-chat affordance.

## Capabilities

### New Capabilities
- `temporary-chat`: Disposable in-memory conversation mode, its lifecycle, generation behavior, visual state, and explicit conversion to a normal local chat.

### Modified Capabilities
- `local-chat-storage`: Exempt temporary conversations from IndexedDB persistence unless the user explicitly saves one.
- `minimal-chat-ui`: Add Open WebUI-style temporary-chat controls, indication, and interaction states.

## Impact

- Affects `src/lib/components/ChatApp.svelte`, local chat orchestration, and Open WebUI-derived icon components and styling.
- Extends browser tests and local persistence tests to prove temporary content never reaches IndexedDB and disappears on navigation or reload.
- Does not change SQLite, authentication, provider APIs, or the stateless `/api/generate` contract.
