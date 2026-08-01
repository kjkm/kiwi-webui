## Context

Kiwi creates a normal chat lazily on first submission with the title `New chat`, persists its transcript in user-partitioned IndexedDB, and streams the selected provider model through `/api/generate`. The browser can already rename a local chat, while the server deliberately stores no chat content. Saved temporary chats currently derive a deterministic title from the first line of the first user message.

Model-backed title generation crosses the provider, authenticated API, client orchestration, and local repository boundaries. It must remain subordinate to the primary response and must not overwrite a title that the user changed while background work was in flight.

## Goals / Non-Goals

**Goals:**

- Generate a concise title from the first user message using the selected provider model.
- Keep the primary response path responsive and make title failure non-fatal.
- Store the resulting title only in the authenticated user's IndexedDB records.
- Preserve manual renames and safely handle navigation or deletion during background work.
- Apply equivalent behavior when a temporary conversation is explicitly saved.

**Non-Goals:**

- Persisting chat content or titles in SQLite or synchronizing titles across devices.
- Exposing title prompts, title-model settings, regeneration controls, or generation progress in the UI.
- Retitling existing chats, later turns, manually renamed chats, or unsaved temporary conversations.
- Adding a dedicated task model or changing the selected chat model.

## Decisions

### Use a dedicated authenticated title endpoint

Add a bounded JSON endpoint that accepts the selected model and first user message, resolves the model through the existing allowlist, performs one non-streaming OpenAI-compatible completion, and returns a normalized title. The provider request uses an internal title instruction and a low output-token limit. Client-supplied history, system prompts, or arbitrary provider parameters are not accepted.

This keeps title output separate from assistant streaming. Encoding a title into the main completion would complicate stream parsing and risk changing answer quality, while extending the existing SSE stream with a second provider task would delay stream closure and assistant persistence.

### Use the selected conversation model

The title request uses the same validated model selected for the first response. This avoids new configuration and model-discovery behavior. A dedicated task-model setting is unnecessary for the minimal single-provider application, although using a large model for a short title is an accepted cost.

### Run title generation after the primary response

For a normal chat, the client launches title generation only after the first assistant response has completed and been persisted. It does not await the title task before clearing the busy state or allowing another message. Sequential execution avoids competing inference requests on an Ollama deployment.

A failed first response does not trigger title generation. Later successful turns do not retry because automatic naming is scoped to the first exchange.

### Normalize untrusted model output at the server boundary

The server trims whitespace, collapses line breaks and repeated spacing, removes a single pair of common surrounding quotation marks, and enforces the existing non-empty 120-character title limit. Invalid or unavailable output produces a non-success response without logging message content. The client treats every such failure as non-fatal.

The returned title remains plain text. It is never interpreted as Markdown or HTML.

### Apply titles with compare-and-set semantics

Extend the local repository with a user-scoped conditional rename that updates a chat only when its current title equals the expected automatic title. Normal chats expect `New chat`. This prevents a late result from overwriting a manual rename and naturally discards results for deleted chats or another user's records.

The conditional update and comparison occur in one IndexedDB read-write transaction. No database version migration is required because the record shape does not change.

### Retain deterministic temporary-chat fallback

Saving a temporary conversation remains immediate and atomic. It initially uses the existing first-line title, then launches model title generation in the background using the first user message. The generated result is applied only if the saved chat still has that deterministic fallback title. Unsaved temporary conversations make no title request and no IndexedDB title write.

### Keep title failures silent

Title generation is an enhancement rather than part of message delivery. Provider, validation, storage, navigation, and race failures do not alter the completed assistant response or show a chat-level generation error. Normal chats retain `New chat`; saved temporary chats retain their deterministic fallback.

## Risks / Trade-offs

- **Additional provider cost per new saved chat** → Use one bounded completion with a low output-token limit and never retry automatically.
- **Selected models may produce poor or verbose titles** → Apply strict normalization and length validation while preserving manual rename controls.
- **Background completion can return after navigation or deletion** → Persist through the repository by user and chat ID and treat a failed conditional rename as a harmless stale result.
- **A user can rename a chat while the title request is pending** → Compare-and-set against the original automatic title before writing.
- **Page reload can cancel in-flight browser work** → Accept the unchanged fallback title rather than adding durable server jobs or retry metadata.
- **Sequential title generation appears later than concurrent generation** → Prefer preserving response latency and avoiding Ollama contention over earlier sidebar polish.
