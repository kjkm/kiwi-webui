import { TITLE_MAX, validMessage, validTitle } from '$lib/chat';

export interface TitleRequest {
  model: unknown;
  message: string;
}

export function parseTitleRequest(value: unknown): TitleRequest | null {
  if (!value || typeof value !== 'object') return null;
  const body = value as Record<string, unknown>;
  if (!validMessage(body.message)) return null;
  return { model: body.model, message: body.message };
}

const QUOTE_PAIRS = [
  ['"', '"'],
  ["'", "'"],
  ['“', '”'],
  ['‘', '’']
] as const;

export function normalizeGeneratedTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let title = value.trim().replace(/\s+/g, ' ');
  const pair = QUOTE_PAIRS.find(
    ([opening, closing]) => title.startsWith(opening) && title.endsWith(closing)
  );
  if (pair && title.length >= pair[0].length + pair[1].length) {
    title = title.slice(pair[0].length, -pair[1].length).trim();
  }
  if (title.length > TITLE_MAX || !validTitle(title)) return null;
  return title;
}
