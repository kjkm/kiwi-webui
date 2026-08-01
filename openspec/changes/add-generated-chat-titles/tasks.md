## 1. Title Generation Service

- [x] 1.1 Add bounded title-request parsing and plain-text output normalization with the existing 120-character title limit
- [x] 1.2 Add a bounded OpenAI-compatible SSE completion helper for the internal title instruction without a generation-token cap
- [x] 1.3 Add an authenticated `/api/title` endpoint that resolves the selected provider model and returns only a validated title
- [x] 1.4 Keep title-provider failures content-free in server diagnostics and independent from primary generation concurrency

## 2. Local Title Persistence

- [x] 2.1 Add an atomic user-scoped compare-and-set title operation to `LocalChatRepository`
- [x] 2.2 Preserve manual titles and reject generated-title writes for deleted chats or other user partitions
- [x] 2.3 Add IndexedDB tests for successful, manually renamed, deleted, invalid, and cross-user conditional title updates

## 3. Client Orchestration

- [x] 3.1 Launch background title generation after the first normal assistant response completes and is persisted
- [x] 3.2 Apply a returned normal-chat title only while the chat remains named `New chat`, then refresh the local sidebar list
- [x] 3.3 Generate a saved temporary chat's title in the background while retaining its deterministic first-message fallback
- [x] 3.4 Ensure later turns, failed first responses, unsaved temporary chats, navigation, and title-task failures do not trigger duplicate naming or alter chat status

## 4. Regression Coverage

- [x] 4.1 Add unit tests for title request validation, output normalization, streaming provider payloads, bounded accumulation, and provider response handling
- [x] 4.2 Add route tests for authentication, model allowlisting, valid titles, invalid output, and unavailable providers
- [x] 4.3 Add Playwright coverage for automatic sidebar naming, non-blocking interaction, manual-rename preservation, saved temporary chats, and failure fallback

## 5. Documentation and Validation

- [x] 5.1 Document automatic browser-local chat titles and their provider/failure behavior
- [x] 5.2 Run formatting, lint, Svelte checks, unit and integration tests, Playwright, production build, and strict OpenSpec validation
