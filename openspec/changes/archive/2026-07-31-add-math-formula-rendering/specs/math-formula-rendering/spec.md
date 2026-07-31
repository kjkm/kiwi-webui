## ADDED Requirements

### Requirement: Assistant formula rendering
The system SHALL render supported mathematical notation in completed assistant messages while preserving the original message source in browser-local chat storage.

#### Scenario: Dollar-delimited inline formula
- **WHEN** an assistant message contains a valid formula delimited by `$...$`
- **THEN** the system renders the formula inline with surrounding text

#### Scenario: Backslash-delimited inline formula
- **WHEN** an assistant message contains a valid formula delimited by `\(...\)`
- **THEN** the system renders the formula inline with surrounding text

#### Scenario: Dollar-delimited display formula
- **WHEN** an assistant message contains a valid formula delimited by `$$...$$`
- **THEN** the system renders the formula as display mathematics separate from surrounding paragraphs

#### Scenario: Backslash-delimited display formula
- **WHEN** an assistant message contains a valid formula delimited by `\[...\]`
- **THEN** the system renders the formula as display mathematics separate from surrounding paragraphs

#### Scenario: Stored source remains unchanged
- **WHEN** a formula-bearing assistant message is saved and loaded again
- **THEN** the system stores and retrieves its original Markdown and formula delimiters rather than generated KaTeX markup

### Requirement: Literal text preservation
The system MUST avoid interpreting protected or non-mathematical text as formulas.

#### Scenario: Inline code contains delimiters
- **WHEN** an assistant message contains formula delimiters inside an inline code span
- **THEN** the system displays those delimiters as literal code

#### Scenario: Fenced code contains delimiters
- **WHEN** an assistant message contains formula delimiters inside a fenced code block
- **THEN** the system displays those delimiters as literal code

#### Scenario: Escaped delimiter
- **WHEN** an assistant message contains an escaped formula delimiter
- **THEN** the system displays the delimiter literally

#### Scenario: Currency values
- **WHEN** an assistant message contains ordinary currency values using dollar signs
- **THEN** the system displays the currency as text rather than as a formula

### Requirement: Streaming and error tolerance
The system SHALL preserve readable assistant output while a formula is incomplete or invalid and SHALL continue rendering later stream content.

#### Scenario: Formula is incomplete during streaming
- **WHEN** the current streamed assistant prefix contains an unmatched formula delimiter
- **THEN** the system displays the incomplete notation as literal text without interrupting the stream

#### Scenario: Stream completes a formula
- **WHEN** a later stream fragment closes a previously unmatched formula delimiter
- **THEN** the system renders the completed expression as a formula

#### Scenario: Invalid formula
- **WHEN** an assistant message contains a closed expression that KaTeX cannot parse
- **THEN** the system displays non-throwing error output or readable source and continues rendering the rest of the message

### Requirement: Safe formula output
The system MUST treat formula source as untrusted content and sanitize generated output before adding it to the document.

#### Scenario: Unsupported trusted command
- **WHEN** formula source attempts to use a KaTeX command that requires trusted mode
- **THEN** the system does not create the requested trusted HTML, link, or executable behavior

#### Scenario: Formula source contains an injection attempt
- **WHEN** an assistant message combines formula syntax with scripts, event handlers, or unsafe raw HTML
- **THEN** the system removes or escapes the unsafe content while retaining safe message content

#### Scenario: Accessible formula output
- **WHEN** the system renders a valid formula
- **THEN** the sanitized result retains the KaTeX HTML and MathML needed for visual and assistive interpretation

### Requirement: Responsive formula presentation
The system SHALL contain rendered formulas within the chat message layout at desktop and mobile viewport sizes.

#### Scenario: Wide display formula on mobile
- **WHEN** a display formula is wider than its message at a mobile viewport
- **THEN** the formula provides contained horizontal scrolling without creating page-level horizontal overflow

#### Scenario: Inline formula alignment
- **WHEN** an inline formula appears within prose
- **THEN** it remains aligned with the surrounding line and does not become a display block

### Requirement: Explicit renderer scope
The system SHALL enable formula interpretation for completed and streaming assistant messages without implicitly changing other Markdown surfaces.

#### Scenario: Streaming assistant output
- **WHEN** the application renders the active assistant stream
- **THEN** supported complete formulas use the same rendering behavior as completed assistant messages

#### Scenario: Welcome content contains formula delimiters
- **WHEN** repository-managed welcome Markdown contains formula delimiters and does not explicitly enable formula rendering
- **THEN** the welcome message displays them according to ordinary Markdown behavior rather than invoking KaTeX

#### Scenario: User message contains formula delimiters
- **WHEN** a user message contains formula delimiters
- **THEN** the existing plain-text user-message presentation remains unchanged
