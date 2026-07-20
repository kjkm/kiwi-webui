## 1. Local Conversion Support

- [x] 1.1 Add a validated repository operation that atomically creates a chat and its ordered transcript in one IndexedDB transaction
- [x] 1.2 Add repository tests for successful temporary-chat conversion and complete rollback on invalid or failed conversion

## 2. Temporary Conversation State

- [x] 2.1 Add in-memory temporary mode, temporary conversation ID, and disposable message lifecycle state to `ChatApp`
- [x] 2.2 Branch message submission so temporary user and completed assistant messages never call IndexedDB persistence methods
- [x] 2.3 Reuse the existing stateless generation stream with temporary ordered history and preserve failure and stop behavior
- [x] 2.4 Clear temporary state when disabling empty mode, starting a normal chat, opening saved history, navigating away, reloading, or logging out
- [x] 2.5 Implement atomic save conversion, sidebar refresh, route replacement, and recoverable conversion failure behavior

## 3. Open WebUI Interface Fidelity

- [x] 3.1 Add Open WebUI dotted-chat, checked dotted-chat, save-chat, and eye-slash SVG icon components using the reference paths and sizing
- [x] 3.2 Add the accessible new-chat header toggle and active temporary-chat state
- [x] 3.3 Add the centered temporary notice, explanatory text, and dashed composer treatment
- [x] 3.4 Replace the toggle with a save action for non-empty temporary conversations and disable saving during generation
- [x] 3.5 Verify temporary controls and indications remain responsive and keyboard accessible in light and dark themes

## 4. Verification and Documentation

- [x] 4.1 Add component or browser coverage proving temporary generation does not create IndexedDB chat or message records
- [x] 4.2 Add browser coverage for mode activation, active visuals, temporary streaming, reload discard, navigation discard, and explicit save conversion
- [x] 4.3 Update privacy documentation to distinguish normal browser-local retention from non-retained temporary chats and provider transmission
- [x] 4.4 Run formatting, lint, Svelte checks, unit and integration tests, Playwright, production build, and strict OpenSpec validation
