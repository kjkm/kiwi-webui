## Why

Mobile browsers frequently suspend or terminate streaming connections when users switch applications, causing an otherwise healthy inference to be cancelled and reported as a network error. Kiwi should let server-side inference survive transient frontend disconnects and replay the missed response when the same authenticated client reconnects, without duplicating generation or introducing durable server-side chat storage.

## What Changes

- Introduce bounded, user-scoped generation jobs that continue independently of any one browser stream connection.
- Let clients reconnect to an existing job with an event cursor and replay missed status, delta, completion, or error events.
- Distinguish an accidental transport disconnect from an explicit Stop, navigation, temporary-chat discard, or other intentional cancellation.
- Retain bounded job input and output only in server memory for a short lifetime, then remove it after acknowledgement or expiration.
- Automatically reconnect interrupted browser streams and show a temporary reconnecting state instead of immediately failing the message.
- Preserve browser-local persistence: completed assistant messages are still written to IndexedDB only by the browser, while temporary chats remain page-memory-only.
- Preserve the single-instance deployment model; backend restarts and backend-to-provider failures remain non-resumable.

## Capabilities

### New Capabilities
- `resumable-generation-jobs`: Create, stream, reconnect to, cancel, expire, and securely isolate ephemeral server-side generation jobs.

### Modified Capabilities

None.

## Impact

- Authenticated generation API and SSE event framing
- In-memory concurrency and generation lifecycle management
- Provider and Ollama loading orchestration
- Client generation, reconnection, cancellation, navigation, and persistence behavior
- Memory, runtime, and per-user resource limits
- Unit, route, browser, privacy, and cancellation tests
- Deployment and privacy documentation
