## 1. Ollama Configuration

- [x] 1.1 Add optional validated `OLLAMA_BASE_URL` server configuration while leaving non-Ollama provider requirements unchanged
- [x] 1.2 Document Ollama native endpoint routing, authentication expectations, and deployment environment configuration
- [x] 1.3 Add configuration tests for absent, valid, malformed, and normalized Ollama base URLs

## 2. Native Ollama Loading Client

- [x] 2.1 Implement a server-only Ollama client that queries `/api/ps` and matches selected model names with conservative `:latest` normalization
- [x] 2.2 Implement bounded empty-chat preloading with safe errors and no conversation-content inputs
- [x] 2.3 Add an in-memory per-model single-flight coordinator whose shared preload is independent of any one chat's cancellation
- [x] 2.4 Add unit tests for resident models, unloaded models, normalization, probe failures, preload failures, timeout, and concurrent preload deduplication

## 3. Generation Stream Orchestration

- [x] 3.1 Refactor `/api/generate` to return its event stream before Ollama checks and provider startup while retaining request, model, and concurrency validation
- [x] 3.2 Emit loading and generating status events around required preload work, then relay ordinary completion deltas and completion events
- [x] 3.3 Preserve cancellation and concurrency cleanup across residency checks, shared preload waits, completion startup, stream failures, and disconnects
- [x] 3.4 Add route tests for configured and unconfigured Ollama flows, status ordering, fail-open probe behavior, preload failure, cancellation, and content-free errors

## 4. Chat Loading Experience

- [x] 4.1 Extend the typed client event parser with ephemeral loading and generating status events
- [x] 4.2 Show an accessible “Loading model…” assistant state only during confirmed preload and restore the existing thinking state before inference
- [x] 4.3 Clear transient loading state on first delta, completion, error, stop, navigation, and temporary-chat disposal without persisting it to IndexedDB
- [x] 4.4 Add browser coverage for cold-model loading, already-resident generation, status transition ordering, stopping during loading, and absence of status persistence

## 5. Validation

- [x] 5.1 Run formatting, lint, Svelte checks, unit and integration tests, Playwright tests, and the production build
- [x] 5.2 Run strict OpenSpec validation for `show-ollama-model-loading` and verify no request or response content is introduced into server persistence or diagnostics
