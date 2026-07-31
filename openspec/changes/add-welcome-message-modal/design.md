## Context

Kiwi's authenticated application layout currently renders route content directly, while chat pages each instantiate `ChatApp`. The browser already holds user-partitioned local chat data and local UI preferences, and the application already has a `Markdown` component that escapes raw HTML and sanitizes rendered output. There is no modal primitive or server-side user-preference store.

The operator wants to author a first-visit message as Markdown in the repository. Content updates will follow the normal commit and image rebuild workflow, but previously acknowledging users must not see edited content again.

## Goals / Non-Goals

**Goals:**

- Display operator-authored Markdown once per authenticated OIDC user in a browser profile.
- Require an explicit “Cool, thanks.” action before acknowledgement is stored.
- Keep the interaction accessible, responsive, and independent of individual chat routes.
- Reuse Kiwi's existing sanitized Markdown rendering.
- Ensure missing content, failed loading, or unavailable browser storage never prevents chat use.

**Non-Goals:**

- Cross-device or server-side acknowledgement synchronization.
- Re-showing the modal when the Markdown changes.
- An in-application content editor, announcement history, scheduling, or targeting.
- Showing the message before OIDC authentication.
- Persisting the welcome content or acknowledgement in SQLite.

## Decisions

### Place the modal in the authenticated application layout

A dedicated `WelcomeModal` component will be rendered by `src/routes/(app)/+layout.svelte` using the authenticated user supplied by the existing layout load. The layout persists while navigating among chat routes, so modal lifecycle and acknowledgement checks occur once without coupling the feature to `ChatApp`.

Embedding the component separately in each chat page was rejected because route navigation could recreate the modal and duplicate state handling.

### Manage the message as a static Markdown asset

The operator will edit `static/welcome.md`. The client will request the asset with browser caching disabled after determining that the current user has not acknowledged it. This preserves a simple Markdown editing workflow and ensures newly eligible users receive the image's current content after deployment.

A runtime-mounted file and server file-reading endpoint were rejected because all content changes already go through the normal commit and image rebuild workflow. An environment variable was rejected because multiline Markdown is cumbersome to configure.

### Store a stable, user-partitioned browser acknowledgement

Acknowledgement will use a namespaced localStorage key containing the authenticated OIDC user ID. The value will not include a content version or digest, so editing the Markdown never makes the message reappear for that user in that browser profile.

A global browser key was rejected because multiple OIDC users can share a browser profile. SQLite storage was rejected because cross-device acknowledgement is explicitly out of scope and would expand server-side user state.

### Acknowledge only through the explicit action

The modal will offer one button labeled exactly “Cool, thanks.” Backdrop clicks and Escape cancellation will not dismiss it. Activating the button will attempt to store acknowledgement and will close the modal even if storage fails, preventing storage policy or quota errors from trapping the user.

### Use an accessible modal dialog and existing Markdown renderer

The component will use a native dialog or equivalent accessible dialog semantics, move focus into the modal when opened, contain keyboard focus while open, and restore normal page interaction after dismissal. The content region will scroll independently on constrained screens, and the action will remain reachable. Markdown will be rendered with the existing sanitized `Markdown` component rather than a second parser path.

### Fail open when content cannot be presented

The modal will not open when the Markdown asset is missing, unavailable, or empty after trimming. These failures will not record acknowledgement, allowing a later visit to retry, but they will never interfere with chat initialization or use.

## Risks / Trade-offs

- [Acknowledgement is browser-local] → Document that another browser, device, cleared profile, or private session can show the message again.
- [Static content requires deployment] → Accept this because operator edits already follow the repository build and deployment workflow.
- [localStorage can be blocked] → Catch all storage access failures and allow the explicit button to close the modal for the current page session.
- [The modal appears after client startup] → Keep loading asynchronous and avoid opening an empty shell; the brief delay is preferable to server-rendering a modal before browser acknowledgement can be checked.
- [An unavailable asset retries on later visits] → Fail open without acknowledgement so transient deployment or network failures do not permanently suppress the intended welcome.

## Migration Plan

1. Ship a default `static/welcome.md` with the application image.
2. Deploy the updated image normally; no database or data migration is required.
3. Existing users have no acknowledgement key and will see the message once after deployment, just like new users.
4. Rollback removes the UI behavior while leaving harmless namespaced localStorage keys in browsers.

## Open Questions

None.
