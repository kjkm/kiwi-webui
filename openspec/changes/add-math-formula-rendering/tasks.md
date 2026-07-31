## 1. Formula Rendering Foundation

- [x] 1.1 Add KaTeX as a production dependency and bundle its stylesheet and fonts through the application build
- [x] 1.2 Implement tokenizer-aware inline and display math extensions for `$...$`, `$$...$$`, `\(...\)`, and `\[...\]`
- [x] 1.3 Apply conservative dollar-delimiter boundaries and preserve escaped delimiters, inline code, fenced code, and ordinary currency
- [x] 1.4 Configure KaTeX for untrusted, non-throwing rendering without application-global macros

## 2. Markdown and Chat Integration

- [x] 2.1 Add an opt-in math-rendering property to `Markdown.svelte` that defaults to disabled
- [x] 2.2 Extend the DOMPurify boundary to retain required safe KaTeX HTML and MathML while rejecting executable or trusted content
- [x] 2.3 Enable math rendering for completed and streaming assistant messages while leaving user messages and welcome Markdown unchanged
- [x] 2.4 Confirm formula-bearing messages continue to persist and reload as their original Markdown source

## 3. Responsive Presentation

- [x] 3.1 Add scoped KaTeX styles for inline alignment and theme-compatible formula output
- [x] 3.2 Contain wide display formulas with message-local horizontal scrolling and no page-level overflow
- [x] 3.3 Verify incomplete and malformed formulas remain readable throughout streamed generation

## 4. Verification and Documentation

- [x] 4.1 Add focused tests for all supported delimiters, malformed and incomplete expressions, and transition from streamed source to rendered formula
- [x] 4.2 Add regression tests proving code, escaped delimiters, currency, welcome content, and original persisted source remain unchanged
- [x] 4.3 Add security coverage for raw HTML injection, trusted KaTeX commands, sanitized MathML, and non-throwing invalid formulas
- [x] 4.4 Add Playwright coverage for completed and streamed formulas plus mobile containment of a wide display expression
- [x] 4.5 Document supported formula syntax, literal escaping, limitations, and client asset implications
- [x] 4.6 Run formatting, lint, Svelte checks, unit and integration tests, Playwright, production build, and strict OpenSpec validation
