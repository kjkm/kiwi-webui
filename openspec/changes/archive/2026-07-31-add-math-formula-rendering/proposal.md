## Why

Chat responses currently display mathematical notation as raw delimiter syntax, making equations difficult to read and limiting the usefulness of models for technical, scientific, and educational conversations. Adding safe formula rendering will make inline and display mathematics legible without changing generation or persistence behavior.

## What Changes

- Render inline and display mathematical formulas in assistant chat messages using KaTeX.
- Accept common model-produced delimiters: `$...$`, `$$...$$`, `\(...\)`, and `\[...\]`.
- Preserve ordinary currency, escaped delimiters, code spans, and fenced code as non-mathematical text.
- Render formulas safely through the existing Markdown sanitization boundary, with invalid formulas failing visibly rather than breaking the message.
- Keep wide display equations usable on narrow screens through contained horizontal scrolling.
- Handle incomplete formulas during streamed generation without interrupting or corrupting the response.
- Keep welcome-message Markdown behavior unchanged unless formula rendering is explicitly enabled.

## Capabilities

### New Capabilities

- `math-formula-rendering`: Safe, responsive rendering of inline and display mathematics in streamed and completed assistant messages.

### Modified Capabilities

None.

## Impact

- Affects `src/lib/components/Markdown.svelte`, assistant-message rendering in `src/lib/components/ChatApp.svelte`, and formula-related styles in `src/app.css`.
- Adds KaTeX and a compatible `marked` extension or equivalent integration, including KaTeX CSS/font assets in client output.
- Extends Markdown security and browser regression coverage; no server API, database, IndexedDB, or authentication changes are required.
