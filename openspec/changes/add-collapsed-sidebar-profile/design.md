## Context

Kiwi's authenticated desktop shell has two navigation presentations in `ChatApp.svelte`: a 260px expanded sidebar and a 52px collapsed rail. The expanded sidebar owns the only account menu. The collapsed rail currently contains only the logo/expand affordance and new-chat control, even though Open WebUI keeps a compact user-menu trigger at the bottom of its collapsed rail.

The existing account menu uses native `<details>`/`<summary>`, an initial-based avatar, and actions for reopening the welcome message and signing out. The compact control must preserve those behaviors without introducing account state, profile images, presence indicators, or a separate menu implementation.

## Goals / Non-Goals

**Goals:**

- Keep the authenticated user's account menu available while the desktop sidebar is collapsed.
- Match the existing rail dimensions and Open WebUI's bottom-aligned compact profile pattern.
- Reuse identical identity and action content in expanded and compact account menus.
- Keep the compact popover visible outside the narrow rail and inside the viewport.
- Preserve keyboard access, accessible naming, focus treatment, and sidebar transitions.
- Keep mobile navigation behavior unchanged.

**Non-Goals:**

- Adding profile images, profile editing, online presence, status badges, or new account actions.
- Changing authentication, logout submission, welcome-message acknowledgement, or user persistence.
- Adding compact chat-history controls or changing the rail width.
- Replacing native `<details>` with a general-purpose popover framework.

## Decisions

### Render a compact account menu at the bottom of the existing rail

The collapsed `.sidebar-rail` will remain a vertical flex container. A compact account-menu wrapper will use automatic top margin to place the existing 28px initial avatar in a 36px rail-sized summary control at the bottom.

This follows the Open WebUI reference and keeps account access spatially consistent with the expanded sidebar footer. Making the avatar expand the sidebar instead was rejected because it would add an unnecessary step and make the visible profile control behave differently between sidebar states.

### Share menu content while retaining presentation-specific details elements

The expanded and compact presentations will each have their own native `<details>` container, while their identity block and actions will be rendered from shared local markup, such as a Svelte snippet. This keeps positioning and summary geometry independent without allowing the two menus to drift functionally.

A separate application-wide account-menu component was considered but rejected because the behavior is local to `ChatApp.svelte` and the menu has only two small presentations. Duplicating all menu actions was also rejected because future action changes could become inconsistent.

### Open the compact popover to the right of the rail

The compact account popover will have a fixed useful width, align with the bottom of the compact avatar, and open to the right of the 52px rail. The rail must permit visible overflow so the popover is not clipped. Its existing stacking context will keep the menu above the conversation while the sidebar stage continues to reserve only the rail width.

Expanding the popover within the 52px rail was rejected because identity and action labels would be unusable. A portal or floating-positioning dependency is unnecessary for this fixed desktop location.

### Close presentation-specific menus during sidebar transitions

Switching between expanded and collapsed states will close any open account `<details>` elements before changing the sidebar state. This prevents a menu opened in one presentation from remaining open invisibly and unexpectedly reappearing later.

The menu will otherwise retain the current native details keyboard behavior. Both summaries will expose the accessible name `User menu`, and visible focus styles will remain available.

### Keep the compact control desktop-only

The compact profile control will live inside the existing `.sidebar-rail.desktop-only`. Mobile users will continue to access the full account row in the sidebar drawer, avoiding duplicate account controls on narrow viewports.

## Risks / Trade-offs

- **Allowing visible rail overflow could expose unintended descendants during transitions** → Scope rail descendants to fixed-size controls, retain parent visibility and pointer-event transitions, and cover expanded/collapsed states in browser tests.
- **Two native details elements can retain independent open state** → Explicitly close both whenever the desktop sidebar toggles.
- **Shared menu markup could accidentally create nested interactive elements** → Share only popover content; keep each summary and details container presentation-specific.
- **The right-opening menu could cause horizontal overflow at unusual desktop widths** → Limit the behavior to the desktop rail breakpoint and give the popover a bounded width that fits the supported viewport.
- **Layout regressions could move the avatar away from the viewport bottom** → Assert compact avatar placement and viewport containment in Playwright.
