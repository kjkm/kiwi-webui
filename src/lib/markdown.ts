import katex from 'katex';
import { Marked, Renderer, type MarkedExtension } from 'marked';

interface MathToken {
  type: 'mathBlock' | 'mathInline';
  raw: string;
  text: string;
  displayMode: boolean;
}

const dollarBlock = /^(?: {0,3})\$\$[ \t]*\n?([\s\S]*?)\n?[ \t]*\$\$(?:[ \t]*(?:\n|$))/;
const bracketBlock = /^(?: {0,3})\\\[[ \t]*\n?([\s\S]*?)\n?[ \t]*\\\](?:[ \t]*(?:\n|$))/;
const dollarDisplay = /^\$\$(?!\s)((?:\\\$|[^$\n])+?)(?<!\s)\$\$/;
const bracketDisplay = /^\\\[(?!\s)((?:(?!\\\])[^\n])+?\S)\\\]/;
const dollarInline = /^\$(?![$\s])((?:\\\$|[^$\n])+?)(?<!\s)\$(?!\d)/;
const parenthesisInline = /^\\\((?!\s)((?:(?!\\\))[^\n])+?\S)\\\)/;

function renderFormula(source: string, displayMode: boolean): string {
  return katex.renderToString(source, {
    displayMode,
    throwOnError: false,
    trust: false,
    strict: 'ignore'
  });
}

function mathToken(
  type: MathToken['type'],
  raw: string,
  text: string,
  displayMode: boolean
): MathToken {
  return { type, raw, text, displayMode };
}

const mathExtension: MarkedExtension = {
  extensions: [
    {
      name: 'mathBlock',
      level: 'block',
      start(source) {
        const dollarIndex = source.search(/^ {0,3}\$\$/m);
        const bracketIndex = source.search(/^ {0,3}\\\[/m);
        const indexes = [dollarIndex, bracketIndex].filter((index) => index >= 0);
        return indexes.length > 0 ? Math.min(...indexes) : undefined;
      },
      tokenizer(source) {
        const match = dollarBlock.exec(source) ?? bracketBlock.exec(source);
        if (!match) return;
        return mathToken('mathBlock', match[0], match[1].trim(), true);
      },
      renderer(token) {
        const math = token as MathToken;
        return `${renderFormula(math.text, true)}\n`;
      }
    },
    {
      name: 'mathInline',
      level: 'inline',
      start(source) {
        const indexes = [source.indexOf('$'), source.indexOf('\\('), source.indexOf('\\[')].filter(
          (index) => index >= 0
        );
        return indexes.length > 0 ? Math.min(...indexes) : undefined;
      },
      tokenizer(source) {
        const displayMatch = dollarDisplay.exec(source) ?? bracketDisplay.exec(source);
        if (displayMatch) return mathToken('mathInline', displayMatch[0], displayMatch[1], true);

        const inlineMatch = dollarInline.exec(source) ?? parenthesisInline.exec(source);
        if (!inlineMatch) return;
        return mathToken('mathInline', inlineMatch[0], inlineMatch[1], false);
      },
      renderer(token) {
        const math = token as MathToken;
        return renderFormula(math.text, math.displayMode);
      }
    }
  ]
};

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export function renderMarkdownSource(value: string, enableMath = false): string {
  const renderer = new Renderer();
  renderer.html = ({ text }: { text: string }) => escapeHtml(text);

  const parser = enableMath ? new Marked(mathExtension) : new Marked();
  return parser.parse(value, { async: false, gfm: true, breaks: true, renderer });
}
