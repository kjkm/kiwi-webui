## Context

Kiwi currently couples provider inference to one `POST /api/generate` response stream. The route aborts its provider request when that stream is cancelled, and the client treats any premature end as a terminal network error. Mobile browsers commonly suspend a page and tear down its network connection when the user switches applications, even though both Kiwi and the model provider remain healthy.

Normal user messages are already written to IndexedDB before generation, while assistant messages are written only after a complete response. Temporary chats remain page-memory-only. The backend intentionally has no durable chat-content storage, the deployment model permits one application instance, and provider request and response content must not enter SQLite or logs.

## Goals / Non-Goals

**Goals:**

- Let an accepted inference continue after an accidental frontend transport disconnect.
- Replay missed generation events when the same authenticated user reconnects.
- Avoid starting duplicate inference when creation or subscription requests are retried.
- Preserve explicit cancellation and existing browser-local completion persistence.
- Bound the lifetime, count, runtime, and memory consumption of server-side jobs.
- Keep all queued input, output, and event data ephemeral and content-free in diagnostics.

**Non-Goals:**

- Surviving a Kiwi process restart, deployment, or server crash.
- Sharing jobs across multiple Kiwi instances or introducing Redis or another queue service.
- Resuming a provider request that itself failed or disconnected.
- Recovering temporary-chat UI state after page reload, tab closure, or browser termination.
- Synchronizing completed chats across devices.
- Running jobs indefinitely or guaranteeing delivery after the retention window expires.

## Decisions

### Use client-generated, user-scoped generation identifiers

The client will create a UUID generation ID before submitting a message and include it in the bounded generation request. `POST /api/generate` creates the job or, when the same authenticated user retries an existing ID for the same conversation, subscribes to the existing job instead of starting inference again. Reuse with conflicting conversation metadata is rejected.

A client-generated ID is preferable to learning a server-generated ID from the first response event: if the connection fails immediately after creation, the client still knows which job to resume.

### Separate jobs from stream subscribers

Introduce a server-only in-memory generation job registry. A job owns:

- generation ID, authenticated user ID, and client conversation ID;
- creation, terminal, and expiry timestamps;
- an independent provider `AbortController`;
- lifecycle state and monotonically sequenced replay events;
- bounded accumulated output and current subscribers.

The provider runner belongs to the job, not to a request signal. Cancelling or losing one SSE response only detaches that subscriber. The runner continues until completion, provider failure, explicit cancellation, runtime timeout, or resource-limit failure.

The registry retains the existing one-active-generation-per-user-and-conversation rule. A retry with the same generation ID attaches to the same job; a different active generation ID for that conversation receives a conflict. Terminal jobs release the active-conversation index while remaining replayable until acknowledged or expired.

### Provide cursor-based SSE replay

`POST /api/generate` validates and creates-or-reuses a job, then returns its event stream from the beginning. `GET /api/generate/{generationId}?after=<sequence>` authenticates the caller and streams events with sequence numbers greater than the supplied cursor. `DELETE /api/generate/{generationId}` explicitly cancels a running job and removes a terminal job after the client no longer needs replay.

Each persisted SSE event uses a monotonic `id:` value in addition to the existing JSON `data:` payload. Status, delta, done, and error events are replayable in their original order. Lightweight heartbeat comments keep active streams observable but are neither sequenced nor retained. A terminal event closes each current or future subscription after replay.

Ownership failures and unknown or expired IDs return the same not-found response to avoid cross-user enumeration. All endpoints retain application-session authentication and existing same-origin protection for state-changing methods.

### Reconnect automatically without duplicating local content

The client tracks the current generation ID and last fully processed event sequence in page memory. If a stream ends without a terminal event, it enters an accessible “Reconnecting…” state and retries the authenticated GET subscription with bounded exponential backoff. Browser `online` and `visibilitychange` signals trigger an immediate retry after connectivity or foreground execution returns.

The client appends only events after its cursor, clears the reconnecting state on a successful subscription, and writes one assistant message to IndexedDB only after a valid done event and non-empty accumulated output. It acknowledges/removes the terminal job only after normal-chat IndexedDB persistence or temporary-chat in-memory completion succeeds. Thus replay cannot create a second provider inference or duplicate already-processed deltas in the active page.

Generation identifiers and cursors remain page-memory-only in this change. Consequently, an intact mobile page can reconnect after app switching, but a page reload does not recover a pending job. Normal user messages remain available locally after reload; temporary chats continue to be discarded as documented.

### Make intentional exits explicit cancellation

The Stop control sends `DELETE` and immediately clears local generation state. Starting another chat, navigating away from the generating conversation, deleting that chat, discarding a temporary chat, or signing out will best-effort cancel the active job rather than merely closing its subscriber. Network failure, page suspension, and stream cancellation alone do not cancel inference.

If cancellation cannot reach the server, the job remains bounded by its runtime and retention limits. A logout path will cancel known jobs for the authenticated user before revoking the session where practical, without logging job content.

### Bound memory and job lifetime

The registry will enforce constants for maximum active jobs per user, maximum retained jobs per user and process, maximum job runtime, replay/output bytes, and terminal retention. A proposed baseline is four active jobs per user, twenty retained jobs per user, a ten-minute runtime, a ten-minute terminal replay window, and output bounded by Kiwi's existing assistant-message limit plus fixed event overhead.

Creating a job above active limits is rejected. Old terminal jobs are evicted before accepting retained jobs; active jobs are never silently evicted. Exceeding runtime or output/event bounds aborts the provider and records one safe terminal error. Periodic and operation-triggered cleanup removes expired jobs and clears references to input, output, subscribers, and controllers.

Conversation history is retained only as needed to start the provider request and is released after provider startup. Replay output exists only in memory until acknowledgement or expiration. Job IDs, counts, durations, and fixed error labels may be logged; user IDs, conversation IDs, model output, prompts, credentials, and event payloads may not.

### Integrate existing Ollama loading events into the job runner

The job runner performs Ollama residency checks, model preload, provider startup, and OpenAI stream consumption. Existing `loading_model` and `generating` status events are appended to the same replay buffer, so reconnecting during a cold model load receives a coherent lifecycle. Shared model preload remains independent from one job's subscriber and retains its existing bounded behavior.

## Risks / Trade-offs

- [Server memory temporarily contains chat content] → Enforce strict output, job-count, runtime, and retention limits; clear references promptly; never persist or log payloads.
- [A process restart loses every job] → Document this explicitly and return a recoverable expired/unavailable error; durable queues remain out of scope.
- [The client disconnects after the job expires] → Keep the submitted normal user message in IndexedDB and show that recovery is no longer available.
- [A client retries creation after its job was evicted] → Do not silently start a second inference from a reconnect GET; only an explicit new send creates a new generation ID.
- [Event replay duplicates text] → Use monotonically increasing event IDs and advance the client cursor only after processing each event.
- [Unbounded or abusive clients exhaust memory] → Apply per-user and global quotas before job creation and fail jobs that exceed output or runtime bounds.
- [Intentional cancellation races with completion] → Make terminal transition atomic; cancellation after completion only removes retained replay data and cannot undo a locally saved message.
- [Background fetch is suspended rather than immediately closed] → Heartbeats help detect dead transports; visibility and online events force retry when the page resumes.
- [A logout cancellation request fails] → Authentication prevents later cross-user retrieval, and runtime/retention cleanup removes the orphaned job.

## Migration Plan

1. Add the job registry, resource limits, and route tests behind the existing authenticated generation API.
2. Deploy server support for generation IDs, event IDs, replay GET, and explicit DELETE together with the reconnecting client.
3. Update privacy and operational documentation to describe bounded in-memory response retention and restart limitations.
4. Monitor only content-free job counts, expiry, cancellation, and failure categories.
5. Roll back by restoring the previous coupled generation route; in-memory jobs disappear on process restart and require no data migration.

No SQLite migration or IndexedDB schema migration is required.

## Open Questions

None.
