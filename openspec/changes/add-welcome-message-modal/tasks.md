## 1. Welcome Content and State

- [x] 1.1 Add `static/welcome.md` with an operator-editable default welcome message
- [x] 1.2 Define a stable, namespaced acknowledgement key partitioned by authenticated OIDC user ID
- [x] 1.3 Add first-visit logic that checks acknowledgement before fetching `/welcome.md` without browser caching
- [x] 1.4 Handle missing, failed, and whitespace-only content without opening the modal or blocking chat

## 2. Modal Experience

- [x] 2.1 Create an authenticated `WelcomeModal` component that renders content through the existing sanitized `Markdown` component
- [x] 2.2 Implement accessible modal semantics, initial focus, contained keyboard focus, and prevention of Escape and backdrop dismissal
- [x] 2.3 Add the exact “Cool, thanks.” acknowledgement action with storage-failure-safe dismissal
- [x] 2.4 Add desktop and mobile styling with constrained sizing, scrollable long content, and a reachable action area
- [x] 2.5 Integrate the modal into the persistent authenticated application layout without coupling it to chat routes

## 3. Regression Coverage

- [x] 3.1 Add browser coverage for first-visit rendering, sanitized Markdown, exact action text, and acknowledgement persistence across reloads and chat navigation
- [x] 3.2 Add browser coverage showing acknowledgement is isolated between OIDC users and remains valid when welcome content changes
- [x] 3.3 Add browser coverage for Escape and backdrop behavior, keyboard focus containment, and responsive long-content scrolling
- [x] 3.4 Add failure-path coverage for unavailable, empty, and blocked-storage conditions while confirming chat remains usable

## 4. Documentation and Validation

- [x] 4.1 Document how to edit and deploy `static/welcome.md` and describe browser-local per-user acknowledgement behavior
- [x] 4.2 Run formatting, lint, Svelte checks, unit and integration tests, Playwright tests, and the production build
- [x] 4.3 Run strict OpenSpec validation for `add-welcome-message-modal` and review accessibility and Markdown security boundaries
