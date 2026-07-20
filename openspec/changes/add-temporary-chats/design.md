## Context

Kiwi currently creates an IndexedDB chat record on the first submission from `/`, appends the user message before generation, and appends the assistant message after a complete stream. The backend generation endpoint is already stateless. Temporary chat therefore requires a client-side persistence branch rather than a server or database change.

Open WebUI exposes temporary mode from the new-chat header with dotted-chat icons, uses a dashed composer border, and replaces the toggle with a save action once a temporary conversation exists. Kiwi follows that interaction while using an `Incognito` heading and wireframe Kiwi mark as its uncluttered temporary-mode indicator, and interprets "temporary" as component-memory-only because its normal persistence layer is already browser-local.

## Goals / Non-Goals

**Goals:**
- Keep temporary titles and messages entirely out of IndexedDB unless the user explicitly saves the conversation.
- Reuse the existing bounded stateless generation request and streaming behavior.
- Match Open WebUI's temporary toggle, active icon, dashed composer treatment, and save action while using Kiwi's wireframe `Incognito` placeholder state.
- Make transitions between temporary, saved, and normal new-chat states explicit and testable.

**Non-Goals:**
- Persist temporary mode or temporary messages across reloads, tabs, navigation, logout, or browser restarts.
- Add private/incognito guarantees beyond avoiding Kiwi's persistence layers; the provider still receives generation input.
- Add server storage, IndexedDB schema changes, automatic expiry, temporary-chat history, or recovery after accidental dismissal.

## Decisions

### Keep temporary state in `ChatApp` memory

`ChatApp` will hold a temporary-mode flag, a random per-session conversation ID, and the existing in-memory message list. It will not encode temporary state in the URL, `localStorage`, `sessionStorage`, or IndexedDB. A reload consequently returns to a normal empty chat.

Using session storage was rejected because it would survive reloads and create another persistence boundary. A dedicated IndexedDB temporary store was rejected because it contradicts the disposable behavior.

### Branch persistence at the chat orchestration boundary

The send path will continue to construct the same bounded history and call `/api/generate`. In normal mode it retains existing repository writes. In temporary mode it creates an in-memory user message before generation and an in-memory assistant message only after successful completion. The random temporary conversation ID is sent only as the generation concurrency key and is never used as a route ID.

This keeps the provider contract and server concurrency behavior unchanged while ensuring no temporary chat or message repository methods are called.

### Restrict activation to the empty new-chat context

The temporary toggle will appear only when no saved chat is active. Enabling it clears any unsent empty-state prompt failure but does not create a record. Once messages exist, the header will show a save action rather than an off toggle. Starting a normal new chat, selecting a saved chat, disabling an empty temporary chat, navigating away, or reloading discards temporary state.

Allowing mode changes inside a saved conversation was rejected because it makes ownership and persistence of mixed message history ambiguous.

### Save by atomically converting the in-memory transcript

The local repository will expose an atomic operation that creates a normal chat and all validated ordered messages in one IndexedDB transaction. On success, the UI refreshes history, replaces the URL with `/c/{id}`, and exits temporary mode without re-generating content. Saving is disabled while generation is active.

Sequential calls to `create` and `append` were rejected because a failed intermediate transaction could leave a partial saved chat.

### Reuse Open WebUI visual language

Kiwi will copy the relevant Open WebUI SVG paths for dotted-chat inactive/active controls and save-chat. The control sits at the right of the conversation header, the empty state replaces the normal greeting and filled logo with an `Incognito` heading and wireframe Kiwi mark, and temporary composers use the dashed border treatment. Controls remain keyboard accessible with explicit labels and active state.

## Risks / Trade-offs

- [Users may mistake temporary mode for provider privacy] → State specifically that the chat is not saved in history while retaining the existing AI/provider disclosure boundaries in documentation.
- [Accidental navigation permanently loses the transcript] → Make temporary mode visually persistent and provide an explicit save action after the first message.
- [A save transaction could accept malformed in-memory state] → Validate title, roles, message content, and ordering before committing, and abort the complete transaction on failure.
- [Normal and temporary branches can diverge] → Share request construction and stream parsing; isolate only message creation and persistence decisions.
- [Duplicate temporary controls can regress Open WebUI fidelity] → Add browser assertions for inactive, active, indicator, dashed composer, and save states.

## Migration Plan

No data or schema migration is required. Deploy the client and repository additions together. Rollback removes the temporary controls and conversion method; existing normal IndexedDB chats remain unchanged.

## Open Questions

None.
