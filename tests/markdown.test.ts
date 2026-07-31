import { describe, expect, it } from 'vitest';
import { renderMarkdownSource } from '../src/lib/markdown';

function render(source: string): string {
  return renderMarkdownSource(source, true);
}

describe('math-enabled Markdown rendering', () => {
  it.each([
    ['inline dollar', 'The result is $x^2 + y^2$.', false],
    ['inline parentheses', String.raw`The result is \(x^2 + y^2\).`, false],
    ['display dollars', '$$x^2 + y^2$$', true],
    ['display brackets', String.raw`\[x^2 + y^2\]`, true]
  ])('renders %s delimiters', (_name, source, displayMode) => {
    const html = render(source);

    expect(html).toContain('class="katex"');
    expect(html.includes('class="katex-display"')).toBe(displayMode);
    expect(html).toContain('<math');
  });

  it('leaves inline code, fenced code, escaped delimiters, and currency literal', () => {
    const source = [
      'Code: `$x$`',
      '',
      '```text',
      '$$y$$',
      '```',
      '',
      String.raw`Escaped: \$z$`,
      '',
      'Currency: tickets cost $5 and $10 today.'
    ].join('\n');
    const html = render(source);

    expect(html).not.toContain('class="katex"');
    expect(html).toContain('<code>$x$</code>');
    expect(html).toContain('$$y$$');
    expect(html).toContain('Escaped: $z$');
    expect(html).toContain('tickets cost $5 and $10 today');
  });

  it('keeps an incomplete streamed formula literal until it is closed', () => {
    const incomplete = render('Working: $x^2 +');
    const complete = render('Working: $x^2 + y^2$');

    expect(incomplete).not.toContain('class="katex"');
    expect(incomplete).toContain('$x^2 +');
    expect(complete).toContain('class="katex"');
  });

  it('uses non-throwing output for invalid formulas and renders following text', () => {
    const html = render(String.raw`Before $\notARealCommand{x}$ after **continues**.`);

    expect(html).toContain('\\notARealCommand');
    expect(html).toContain('mathcolor="#cc0000"');
    expect(html).toContain('<strong>continues</strong>');
  });

  it('does not enable formulas unless explicitly requested', () => {
    const html = renderMarkdownSource('Welcome $x^2$.');

    expect(html).not.toContain('class="katex"');
    expect(html).toContain('$x^2$');
  });

  it('escapes raw HTML and rejects trusted KaTeX links', () => {
    const rawHtml = render('<img src=x onerror=alert(1)>');
    const trustedFormula = render(String.raw`$\href{javascript:alert(1)}{click}$`);

    expect(rawHtml).not.toContain('<img');
    expect(rawHtml).toContain('&lt;img');
    expect(trustedFormula).not.toMatch(/<a(?:\s|>)/);
    expect(trustedFormula).not.toContain('href=');
    expect(trustedFormula).toContain('\\href');
  });
});
