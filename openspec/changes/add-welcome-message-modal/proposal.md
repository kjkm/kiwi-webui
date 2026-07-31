## Why

New users currently enter the chat interface without any operator-provided introduction or guidance. Kiwi should display a one-time, Markdown-authored welcome message after a user's first authenticated visit so the operator can explain the service without hard-coding presentation markup.

## What Changes

- Add a repository-managed Markdown file containing the operator-authored welcome message.
- Show the sanitized Markdown in an accessible, responsive modal on the user's first authenticated visit.
- Require explicit dismissal through a button labeled “Cool, thanks.” before recording acknowledgement.
- Add a user-menu action that reopens the current welcome message on demand.
- Store acknowledgement locally, partitioned by OIDC user, so edits to the Markdown do not make the message reappear automatically.
- Fail open when the message is missing, empty, or unavailable so chat access is never blocked by welcome-message loading.

## Capabilities

### New Capabilities

- `welcome-message-modal`: Defines Markdown welcome-message loading, first-visit acknowledgement, accessible dismissal, and failure behavior.

### Modified Capabilities

None.

## Impact

- Adds a Markdown content asset managed alongside the application source.
- Adds a welcome modal component to the authenticated application layout and reuses the existing sanitized Markdown renderer.
- Adds browser-local acknowledgement state keyed by authenticated user ID.
- Adds responsive modal styling and browser regression coverage.
- Does not add database state, APIs, dependencies, or cross-device acknowledgement synchronization.
