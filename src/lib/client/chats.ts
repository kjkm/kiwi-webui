import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import {
  validMessage,
  validTitle,
  type Chat,
  type ChatRole,
  type ChatSummary,
  type Message
} from '$lib/chat';

export const CHAT_DATABASE_NAME = 'kiwi-webui-chats';
export const CHAT_DATABASE_VERSION = 1;

interface LocalChatRecord extends ChatSummary {
  key: string;
  userId: string;
}

interface LocalMessageRecord extends Message {
  key: string;
  userId: string;
}

export interface ChatDatabase extends DBSchema {
  chats: {
    key: string;
    value: LocalChatRecord;
    indexes: { 'by-user-updated': [string, number] };
  };
  messages: {
    key: string;
    value: LocalMessageRecord;
    indexes: { 'by-chat-position': [string, string, number] };
  };
}

const chatKey = (userId: string, chatId: string) => `${userId}:${chatId}`;
const messageKey = (userId: string, messageId: string) => `${userId}:${messageId}`;
const userRange = (userId: string) =>
  IDBKeyRange.bound([userId, 0], [userId, Number.MAX_SAFE_INTEGER]);
const messageRange = (userId: string, chatId: string) =>
  IDBKeyRange.bound([userId, chatId, 0], [userId, chatId, Number.MAX_SAFE_INTEGER]);

export function openChatDatabase(name = CHAT_DATABASE_NAME): Promise<IDBPDatabase<ChatDatabase>> {
  return openDB<ChatDatabase>(name, CHAT_DATABASE_VERSION, {
    upgrade(database) {
      const chats = database.createObjectStore('chats', { keyPath: 'key' });
      chats.createIndex('by-user-updated', ['userId', 'updatedAt']);
      const messages = database.createObjectStore('messages', { keyPath: 'key' });
      messages.createIndex('by-chat-position', ['userId', 'chatId', 'position'], { unique: true });
    }
  });
}

function summary(record: LocalChatRecord): ChatSummary {
  return {
    id: record.id,
    title: record.title,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function message(record: LocalMessageRecord): Message {
  return {
    id: record.id,
    chatId: record.chatId,
    position: record.position,
    role: record.role,
    content: record.content,
    createdAt: record.createdAt
  };
}

export class LocalChatRepository {
  constructor(
    private readonly database: Promise<IDBPDatabase<ChatDatabase>> = openChatDatabase()
  ) {}

  async create(userId: string, title = 'New chat'): Promise<ChatSummary> {
    if (!validTitle(title)) throw new Error('Invalid chat title');
    const now = Date.now();
    const record: LocalChatRecord = {
      key: chatKey(userId, crypto.randomUUID()),
      id: '',
      userId,
      title: title.trim(),
      createdAt: now,
      updatedAt: now
    };
    record.id = record.key.slice(userId.length + 1);
    await (await this.database).put('chats', record);
    return summary(record);
  }

  async createWithMessages(
    userId: string,
    title: string,
    transcript: ReadonlyArray<Pick<Message, 'role' | 'content' | 'createdAt'>>
  ): Promise<ChatSummary> {
    if (!validTitle(title)) throw new Error('Invalid chat title');
    if (
      transcript.length === 0 ||
      transcript.some(
        (item) =>
          (item.role !== 'user' && item.role !== 'assistant') ||
          !validMessage(item.content) ||
          !Number.isSafeInteger(item.createdAt) ||
          item.createdAt < 0
      )
    ) {
      throw new Error('Invalid chat transcript');
    }

    const database = await this.database;
    const transaction = database.transaction(['chats', 'messages'], 'readwrite');
    const id = crypto.randomUUID();
    const now = Date.now();
    const chat: LocalChatRecord = {
      key: chatKey(userId, id),
      id,
      userId,
      title: title.trim(),
      createdAt: now,
      updatedAt: now
    };
    await transaction.objectStore('chats').add(chat);
    for (const [position, item] of transcript.entries()) {
      const id = crypto.randomUUID();
      await transaction.objectStore('messages').add({
        key: messageKey(userId, id),
        id,
        userId,
        chatId: chat.id,
        position,
        role: item.role,
        content: item.content,
        createdAt: item.createdAt
      });
    }
    await transaction.done;
    return summary(chat);
  }

  async list(userId: string): Promise<ChatSummary[]> {
    const records = await (
      await this.database
    ).getAllFromIndex('chats', 'by-user-updated', userRange(userId));
    return records.reverse().map(summary);
  }

  async get(userId: string, chatId: string): Promise<Chat | null> {
    const database = await this.database;
    const record = await database.get('chats', chatKey(userId, chatId));
    if (!record) return null;
    const records = await database.getAllFromIndex(
      'messages',
      'by-chat-position',
      messageRange(userId, chatId)
    );
    return { ...summary(record), messages: records.map(message) };
  }

  async rename(userId: string, chatId: string, title: string): Promise<boolean> {
    if (!validTitle(title)) return false;
    const database = await this.database;
    const key = chatKey(userId, chatId);
    const record = await database.get('chats', key);
    if (!record) return false;
    await database.put('chats', { ...record, title: title.trim(), updatedAt: Date.now() });
    return true;
  }

  async append(
    userId: string,
    chatId: string,
    role: ChatRole,
    content: string
  ): Promise<Message | null> {
    if (!validMessage(content)) return null;
    const database = await this.database;
    const transaction = database.transaction(['chats', 'messages'], 'readwrite');
    const key = chatKey(userId, chatId);
    const chat = await transaction.objectStore('chats').get(key);
    if (!chat) {
      await transaction.done;
      return null;
    }
    const records = await transaction
      .objectStore('messages')
      .index('by-chat-position')
      .getAll(messageRange(userId, chatId));
    const now = Date.now();
    const item: LocalMessageRecord = {
      key: '',
      id: crypto.randomUUID(),
      userId,
      chatId,
      position: records.length,
      role,
      content,
      createdAt: now
    };
    item.key = messageKey(userId, item.id);
    await transaction.objectStore('messages').put(item);
    await transaction.objectStore('chats').put({ ...chat, updatedAt: now });
    await transaction.done;
    return message(item);
  }

  async delete(userId: string, chatId: string): Promise<boolean> {
    const database = await this.database;
    const transaction = database.transaction(['chats', 'messages'], 'readwrite');
    const chats = transaction.objectStore('chats');
    const key = chatKey(userId, chatId);
    if (!(await chats.get(key))) {
      await transaction.done;
      return false;
    }
    const messages = transaction.objectStore('messages');
    const keys = await messages.index('by-chat-position').getAllKeys(messageRange(userId, chatId));
    await Promise.all(keys.map((messageId) => messages.delete(messageId)));
    await chats.delete(key);
    await transaction.done;
    return true;
  }
}
