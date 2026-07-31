## Context

Assistant responses are rendered client-side by the shared `Markdown.svelte` component using `marked`, with raw HTML escaped before DOMPurify sanitization. User messages remain plain text, and the same Markdown component also renders repository-managed welcome content. During generation, the complete accumulated assistant prefix is rendered again as each stream fragment arrives.

Mathematical output from OpenAI-compatible models commonly uses both dollar delimiters and LaTeX-style backslash delimiters. The implementation must distinguish those expressions from code and ordinary currency, tolerate incomplete streamed input, and retain the current untrusted-content boundary.

## Goals / Non-Goals

**Goals:**

- Render common inline and display formula delimiters in assistant responses.
- Preserve code, escaped delimiters, currency, and surrounding Markdown behavior.
- Keep malformed or incomplete formulas readable and non-disruptive.
- Maintain DOMPurify as the final HTML boundary and disable trusted KaTeX commands.
- Keep display equations contained and usable on narrow screens.
- Avoid changing welcome-message rendering unless math is explicitly requested.

**Non-Goals:**

- Executing arbitrary LaTeX packages, macros supplied outside the message, HTML commands, links, or other trusted KaTeX features.
- Server-side formula rendering, equation editing, numbering, references, or export.
- Changing user-message formatting, stored chat records, generation prompts, or provider APIs.
- Guaranteeing support for every TeX command or environment.

## Decisions

### Use KaTeX with tokenizer-aware `marked` extensions

Add KaTeX as a production dependency and recognize math through `marked` inline and block tokenizers. The tokenizers will render matched expressions with KaTeX while respecting Markdown token precedence, rather than applying regular-expression replacement to the complete source. This keeps delimiters inside inline code and fenced code literal.

The tokenizers will support `$...$`, `$$...$$`, `\(...\)`, and `\[...\]`. Dollar parsing will use conservative opening and closing boundary rules so normal currency text is not consumed as math. Escaped delimiters remain text. `marked-katex-extension` was considered, but it only recognizes dollar forms; a small local extension avoids unsafe whole-document delimiter normalization and covers the common syntax emitted by models.

### Make formula rendering an explicit Markdown mode

Add an opt-in property to `Markdown.svelte`, defaulting to disabled. Completed and streaming assistant messages in `ChatApp.svelte` will enable it, while `WelcomeModal.svelte` retains ordinary Markdown behavior. This prevents a shared renderer change from silently altering operator-authored welcome content and leaves room for other callers to choose deliberately.

### Render safely and fail visibly

Invoke KaTeX with `trust: false`, `throwOnError: false`, and no application-defined global macros. Raw Markdown HTML will continue to be escaped, and the combined rendered output will continue through DOMPurify. Sanitization will permit only the HTML and MathML profiles required by KaTeX; executable attributes, scripts, unsafe URLs, and trusted commands remain unavailable.

A closed but invalid formula will be emitted using KaTeX's non-throwing error output. An unmatched delimiter in a streaming prefix remains literal text until a later fragment closes it. Re-rendering the accumulated prefix then replaces the literal notation with the formula; no special stream buffering or persisted representation is needed.

### Bundle KaTeX presentation assets and contain wide display math

Import the packaged KaTeX stylesheet through the application bundle so its fonts are emitted by Vite and work in container deployments without an external CDN. Add scoped formula styles so block expressions can scroll horizontally inside the message width without creating page-level overflow. Inline formulas remain aligned with surrounding text.

### Test parsing and browser presentation at separate layers

Extract or export the math-enabled rendering behavior sufficiently for focused tests of delimiter recognition, code/currency preservation, malformed expressions, and sanitization. Extend Playwright coverage to confirm formulas appear in completed and streamed assistant output and that a wide display formula is contained at mobile width. The welcome modal remains covered as non-math Markdown.

## Risks / Trade-offs

- **[Dollar delimiters can be ambiguous with currency]** → Use conservative boundary rules and explicit regression cases; users can use backslash delimiters when notation is ambiguous.
- **[Incomplete streamed formulas can briefly appear as source]** → Keep them literal until closed; this is less disruptive than hiding streamed content or maintaining a second parser buffer.
- **[KaTeX increases client and font assets]** → Use the minified packaged stylesheet and Vite asset bundling; avoid the substantially heavier MathJax runtime.
- **[DOMPurify can strip required MathML]** → Enable the MathML profile explicitly and test representative output while retaining `trust: false` and the existing final sanitization pass.
- **[Very long equations can overflow messages]** → Limit overflow to KaTeX display containers and verify behavior at mobile viewport sizes.
- **[Client-only Markdown rendering changes after hydration]** → Preserve the existing browser-gated renderer behavior; no new server/client rendering model is introduced.

## Migration Plan

1. Add KaTeX and its bundled presentation assets.
2. Introduce opt-in math rendering and enable it for assistant output.
3. Deploy normally; existing stored messages require no migration and render formulas when next displayed.
4. Roll back by removing math mode and the dependency; message source remains unchanged because formulas are stored as original text.

## Open Questions

None.
