## 1. Generation Protocol

- [x] 1.1 Extend bounded generation requests with a required UUID generation ID and add typed sequenced SSE event framing
- [x] 1.2 Add validation and protocol tests for generation IDs, event sequence parsing, cursors, and malformed replay requests

## 2. In-Memory Job Registry

- [x] 2.1 Implement user-scoped generation job records, lifecycle transitions, active-conversation indexing, and idempotent create-or-get behavior
- [x] 2.2 Implement sequenced event retention, backlog replay, live subscriber attachment, terminal stream closure, and heartbeat handling
- [x] 2.3 Implement independent provider cancellation, explicit cancellation/removal, acknowledgement cleanup, runtime timeout, and terminal expiration
- [x] 2.4 Enforce per-user active and retained job limits, process-wide limits, and bounded output/event memory
- [x] 2.5 Add registry tests for idempotency, ownership isolation, replay ordering, subscriber disconnect, cancellation races, limits, timeout, and expiration

## 3. Job-Based Provider Orchestration

- [x] 3.1 Move Ollama loading, provider startup, and completion consumption into a job runner independent of request abort signals
- [x] 3.2 Append loading, generating, delta, completion, and safe failure events to the job while releasing submitted history after provider startup
- [x] 3.3 Preserve content-free diagnostics and conversation concurrency cleanup across completion, failure, cancellation, timeout, and size-limit termination
- [x] 3.4 Add orchestration tests for disconnect during Ollama preload and inference, provider failure, output limits, and exactly one provider request per job

## 4. Authenticated Generation API

- [x] 4.1 Refactor `POST /api/generate` to validate and create-or-resubscribe to an idempotent generation job before returning its SSE subscription
- [x] 4.2 Add authenticated `GET /api/generate/[id]` cursor replay with indistinguishable unknown, expired, and foreign-job responses
- [x] 4.3 Add authenticated `DELETE /api/generate/[id]` for explicit cancellation and terminal acknowledgement/removal
- [x] 4.4 Add route tests for creation retry, replay before and after completion, cursor behavior, ownership isolation, conflicts, cancellation, and expiry

## 5. Browser Reconnection

- [x] 5.1 Generate and retain the active generation ID and last processed sequence in page memory for normal and temporary conversations
- [x] 5.2 Refactor stream consumption to process sequenced events exactly once and reconnect with bounded exponential backoff after non-terminal transport failure
- [x] 5.3 Trigger immediate reconnect attempts on browser online and foreground visibility events and show an accessible “Reconnecting…” assistant state
- [x] 5.4 Persist a completed assistant message exactly once, then acknowledge the terminal job only after successful IndexedDB or temporary-memory handling
- [x] 5.5 Stop retrying with a recoverable error when a job is unknown or expired while retaining the normal locally submitted user message

## 6. Intentional Cancellation

- [x] 6.1 Make Stop explicitly cancel the active server job while clearing transient local state immediately
- [x] 6.2 Best-effort cancel active jobs when starting or navigating to another chat, deleting or discarding the active chat, and signing out
- [x] 6.3 Preserve temporary-chat disposal and page-reload semantics without storing job IDs, cursors, prompts, or responses in browser persistence

## 7. Browser and Privacy Coverage

- [x] 7.1 Add browser coverage for mobile-style disconnect, queued completion replay, reconnecting UI, cursor deduplication, and normal local persistence
- [x] 7.2 Add browser coverage for disconnect during model loading, Stop during disconnection, intentional navigation, expired recovery, and temporary-chat disposal
- [x] 7.3 Verify IndexedDB and SQLite contain no job metadata or replay buffers and diagnostics contain no job identifiers or conversation content

## 8. Documentation and Validation

- [x] 8.1 Document resumable generation behavior, in-memory retention, resource limits, restart limitations, and single-instance constraints
- [x] 8.2 Run formatting, lint, Svelte checks, unit and integration tests, Playwright tests, and the production build
- [x] 8.3 Run strict OpenSpec validation for `add-resumable-generation-jobs` and review cancellation and privacy boundaries
