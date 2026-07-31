## Why

When Ollama must load a selected model into memory, generation appears stalled because Kiwi emits no browser-visible progress before the upstream completion request starts returning. Detecting unloaded models and reporting the load phase will distinguish expected startup latency from a failed or unresponsive request.

## What Changes

- Add optional server-side Ollama integration that checks `/api/ps` before generation.
- Preload a selected model through Ollama's native API when it is not currently resident.
- Extend the generation event stream with safe status events for model loading and inference startup.
- Show a "Loading model…" state in the chat UI until preload completes, while preserving the existing generation and cancellation behavior.
- Leave non-Ollama OpenAI-compatible providers unchanged when Ollama integration is not configured.

## Capabilities

### New Capabilities
- `ollama-model-loading`: Detect unloaded Ollama models, preload them, and communicate model-loading progress to the initiating chat client.

### Modified Capabilities

None.

## Impact

- Server provider configuration and readiness validation
- Ollama native API client code
- Stateless generation stream orchestration and event schema
- Chat generation status UI
- Unit, route, and browser regression tests
- Deployment and environment documentation
