## Context

Kiwi uses a generic OpenAI-compatible completion endpoint. The generation route currently waits for that endpoint to accept a completion before returning its own event stream, so an Ollama cold load looks like an unexplained pause. Ollama separately exposes a native API: `/api/ps` reports models resident in memory, while an empty `/api/chat` request loads a model without performing inference.

The integration must remain optional because the configured OpenAI-compatible provider is not necessarily Ollama. Chat content must remain browser-local except for the bounded history sent for generation, and operational logs and status events must not expose prompts or responses.

## Goals / Non-Goals

**Goals:**

- Detect whether the selected Ollama model is already resident before inference.
- Explicitly preload a non-resident model and report that phase to the initiating browser.
- Return the browser-facing event stream before potentially slow Ollama work begins.
- Preserve cancellation, per-user conversation serialization, provider model validation, and content-free diagnostics.
- Avoid changing behavior for installations without Ollama native API configuration.

**Non-Goals:**

- Reporting byte-level download progress, load percentage, queue position, or estimated time remaining.
- Pulling models that are not installed on Ollama.
- Managing model eviction or changing Ollama's global residency policy.
- Automatically identifying arbitrary OpenAI-compatible endpoints as Ollama.
- Exposing Ollama administration APIs directly to browsers.

## Decisions

### Configure the native Ollama endpoint explicitly

Add an optional `OLLAMA_BASE_URL`, expected to point at the Ollama origin without `/v1`. When absent, Kiwi skips all residency checks and preserves the existing generic-provider path. Native requests use the existing server-side provider credential when present, so credentials remain out of browser payloads.

Explicit configuration is preferred over deriving an origin from `OPENAI_BASE_URL`: proxies can route `/v1` and `/api` to different services, and other OpenAI-compatible providers may expose unrelated paths.

### Check residency and preload through native APIs

Before requesting inference, Kiwi will call `GET {OLLAMA_BASE_URL}/api/ps` and compare the selected model against both the `name` and `model` fields. Comparison will canonicalize case and an omitted `:latest` tag. If absent, Kiwi will emit `loading_model` and send an empty, non-streaming `POST /api/chat` with the selected model and an empty `messages` array. The preload request will not set an indefinite `keep_alive`; Ollama's configured/default policy remains authoritative.

Kiwi will not preload when `/api/ps` reports the model as resident. It will never call a pull endpoint, because a selected model must already have passed provider model discovery.

### Begin the Kiwi stream before provider startup

The generation endpoint will create and return its `ReadableStream` after authentication, payload validation, model validation, and concurrency reservation, but before checking Ollama or opening the completion stream. The stream's asynchronous work will then:

1. Check Ollama residency when configured.
2. Emit `loading_model` before a required preload.
3. Await preload.
4. Emit `generating` and request the real completion.
5. Relay `delta`, `done`, or `error` events as today.

This ordering gives the browser immediate progress while retaining the same validation boundary. Provider startup failures become stream `error` events instead of pre-stream JSON 502 responses once the response has begun.

### Use status events as ephemeral presentation state

Extend the event union with `status` events whose status is `loading_model` or `generating`. The client will show “Loading model…” only for `loading_model`. `generating` restores the existing animated thinking state, and the first delta also clears any loading label. Status is memory-only and is never written to IndexedDB.

A Stop action during either phase aborts the client stream and releases the conversation concurrency key. Ollama preload work may finish server-side after a disconnect if it is already underway, but it remains bounded by a timeout and contains no conversation content.

### Coordinate concurrent loads per model

Maintain an in-memory, per-model single-flight map for preload operations. Requests that observe the same unloaded model await one preload rather than issuing duplicate loads. The preload uses its own bounded timeout so cancellation by one chat does not fail other chats awaiting the same model. Each disconnected chat stops awaiting immediately, while the shared load may finish for remaining or future requests.

### Degrade without misrepresenting inference

If the optional `/api/ps` probe fails, Kiwi logs a content-free warning and proceeds directly to normal completion without emitting `loading_model`, because residency is unknown. If residency was established as absent but the explicit preload fails, Kiwi emits a safe stream error rather than claiming inference has started; this surfaces a broken configured integration instead of silently repeating the same cold-start path.

## Risks / Trade-offs

- [Model names differ between `/v1/models` and `/api/ps`] → Compare both documented fields with conservative `:latest` canonicalization; a false miss causes only an extra idempotent preload.
- [Ollama is evicted after `/api/ps` but before inference] → Treat `/api/ps` as advisory; inference may still incur a load race that cannot be represented precisely.
- [Native API proxy authentication differs from the OpenAI endpoint] → Keep the endpoint optional, document routing and credential expectations, and fail clearly after a confirmed preload requirement.
- [Returning HTTP 200 before provider startup changes error transport] → Preserve JSON errors for request/model/concurrency validation and use the existing safe SSE error mechanism for post-stream provider failures.
- [Shared preload continues after its initiating request is cancelled] → Bound it with a timeout and no conversation content; this avoids cancellation races across users.
- [Ollama load status has no percentage] → Show an indeterminate text state rather than fabricated progress.

## Migration Plan

1. Add optional configuration and documentation without enabling it by default.
2. Deploy server and client status-event support together.
3. Set `OLLAMA_BASE_URL` only in Ollama-backed environments and verify `/api/ps` and empty `/api/chat` access from the application container.
4. Roll back operationally by removing `OLLAMA_BASE_URL`; generic OpenAI-compatible generation remains available.

No database migration or browser-storage migration is required.

## Open Questions

None.
