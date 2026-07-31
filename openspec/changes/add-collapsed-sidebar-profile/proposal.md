## Why

Collapsing the desktop sidebar currently removes the only visible account control, forcing users to reopen navigation before they can identify or access their account menu. Keeping a compact profile control in the rail preserves essential account access and more closely matches Open WebUI's collapsed-sidebar behavior.

## What Changes

- Add a bottom-aligned profile avatar to the collapsed desktop navigation rail.
- Open the existing account menu from the compact profile control, including identity, welcome-message, and sign-out actions.
- Position the compact account popover outside the narrow rail without clipping or page overflow.
- Preserve keyboard operation, accessible naming, focus visibility, sidebar transitions, and existing mobile behavior.
- Close account menus when switching between expanded and collapsed sidebar states so hidden menus do not remain open.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `minimal-chat-ui`: Require account controls to remain accessible through a compact profile menu when desktop chat navigation is collapsed.

## Impact

- Updates the collapsed rail and account-menu markup in `src/lib/components/ChatApp.svelte`.
- Updates collapsed-rail, avatar, popover, focus, and responsive styling in `src/app.css`.
- Extends browser regression coverage in `e2e/chat.spec.ts`.
- Does not change authentication, user persistence, APIs, dependencies, or mobile navigation behavior.
