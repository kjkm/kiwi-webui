## 1. Account Menu Structure

- [x] 1.1 Refactor the existing identity and account actions into shared local markup used by both sidebar presentations
- [x] 1.2 Track the expanded and compact account details elements and close them when toggling the desktop sidebar
- [x] 1.3 Preserve the existing welcome-message and logout behavior in both account-menu presentations

## 2. Collapsed Profile Control

- [x] 2.1 Add a desktop-only compact account menu with an accessible initial avatar at the bottom of the collapsed rail
- [x] 2.2 Style the compact avatar control to match the rail's dimensions, radius, hover, and visible-focus treatments
- [x] 2.3 Position a bounded compact account popover to the right of the rail and prevent clipping or page-level overflow
- [x] 2.4 Verify expanded/collapsed transitions and narrow-view navigation remain visually and functionally unchanged

## 3. Regression Coverage

- [x] 3.1 Add Playwright coverage for the compact avatar's visibility, bottom placement, accessible name, and keyboard operation
- [x] 3.2 Verify the compact menu exposes the same identity, welcome-message, and sign-out actions as the expanded menu
- [x] 3.3 Verify the compact popover remains within the viewport and does not create document-level horizontal overflow
- [x] 3.4 Verify sidebar toggling closes open account menus and the compact profile control is absent on mobile

## 4. Validation

- [x] 4.1 Run formatting, lint, Svelte checks, unit and integration tests, Playwright, production build, and strict OpenSpec validation
