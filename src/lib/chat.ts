export type ChatRole = 'user' | 'assistant';

export interface ChatSummary {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface Message {
  id: string;
  chatId: string;
  position: number;
  role: ChatRole;
  content: string;
  createdAt: number;
}

export interface Chat extends ChatSummary {
  messages: Message[];
}

export const TITLE_MAX = 120;
export const MESSAGE_MAX = 32000;

export function validTitle(title: unknown): title is string {
  return typeof title === 'string' && title.trim().length > 0 && title.trim().length <= TITLE_MAX;
}

export function validMessage(content: unknown): content is string {
  return typeof content === 'string' && content.trim().length > 0 && content.length <= MESSAGE_MAX;
}
