import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Chat, ChatSummary, Message } from './types';

interface ChatRow {
  id: string;
  user_id: string;
  title: string;
  created_at: number;
  updated_at: number;
}
interface MessageRow {
  id: string;
  chat_id: string;
  position: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: number;
}

function mapSummary(row: ChatRow): ChatSummary {
  return { id: row.id, title: row.title, createdAt: row.created_at, updatedAt: row.updated_at };
}
function mapMessage(row: MessageRow): Message {
  return {
    id: row.id,
    chatId: row.chat_id,
    position: row.position,
    role: row.role,
    content: row.content,
    createdAt: row.created_at
  };
}

export const TITLE_MAX = 120;
export const MESSAGE_MAX = 32000;

export function validTitle(title: unknown): title is string {
  return typeof title === 'string' && title.trim().length > 0 && title.trim().length <= TITLE_MAX;
}
export function validMessage(content: unknown): content is string {
  return typeof content === 'string' && content.trim().length > 0 && content.length <= MESSAGE_MAX;
}

export class ChatRepository {
  constructor(private readonly db: Database.Database) {}

  create(userId: string, title = 'New chat'): ChatSummary {
    if (!validTitle(title)) throw new Error('Invalid chat title');
    const now = Date.now();
    const row: ChatRow = {
      id: randomUUID(),
      user_id: userId,
      title: title.trim(),
      created_at: now,
      updated_at: now
    };
    this.db
      .prepare(
        'INSERT INTO chats(id, user_id, title, created_at, updated_at) VALUES (@id, @user_id, @title, @created_at, @updated_at)'
      )
      .run(row);
    return mapSummary(row);
  }

  list(userId: string): ChatSummary[] {
    const rows = this.db
      .prepare('SELECT * FROM chats WHERE user_id = ? ORDER BY updated_at DESC, id')
      .all(userId) as ChatRow[];
    return rows.map(mapSummary);
  }

  get(userId: string, chatId: string): Chat | null {
    const row = this.db
      .prepare('SELECT * FROM chats WHERE id = ? AND user_id = ?')
      .get(chatId, userId) as ChatRow | undefined;
    if (!row) return null;
    const messages = this.db
      .prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY position')
      .all(chatId) as MessageRow[];
    return { ...mapSummary(row), userId: row.user_id, messages: messages.map(mapMessage) };
  }

  rename(userId: string, chatId: string, title: string): boolean {
    if (!validTitle(title)) return false;
    return (
      this.db
        .prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?')
        .run(title.trim(), Date.now(), chatId, userId).changes === 1
    );
  }

  delete(userId: string, chatId: string): boolean {
    return (
      this.db.prepare('DELETE FROM chats WHERE id = ? AND user_id = ?').run(chatId, userId)
        .changes === 1
    );
  }

  append(
    userId: string,
    chatId: string,
    role: 'user' | 'assistant',
    content: string
  ): Message | null {
    if (!validMessage(content)) return null;
    return this.db.transaction(() => {
      const owned = this.db
        .prepare('SELECT 1 FROM chats WHERE id = ? AND user_id = ?')
        .get(chatId, userId);
      if (!owned) return null;
      const position = (
        this.db
          .prepare('SELECT COALESCE(MAX(position), -1) + 1 value FROM messages WHERE chat_id = ?')
          .get(chatId) as { value: number }
      ).value;
      const row: MessageRow = {
        id: randomUUID(),
        chat_id: chatId,
        position,
        role,
        content,
        created_at: Date.now()
      };
      this.db
        .prepare(
          'INSERT INTO messages(id, chat_id, position, role, content, created_at) VALUES (@id, @chat_id, @position, @role, @content, @created_at)'
        )
        .run(row);
      this.db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(row.created_at, chatId);
      return mapMessage(row);
    })();
  }
}
