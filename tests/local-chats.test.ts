import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteDB } from 'idb';
import { LocalChatRepository, openChatDatabase } from '../src/lib/client/chats';

const databaseName = 'kiwi-webui-chats-test';
let repository: LocalChatRepository;
let database: Awaited<ReturnType<typeof openChatDatabase>>;

beforeEach(async () => {
  await deleteDB(databaseName);
  database = await openChatDatabase(databaseName);
  repository = new LocalChatRepository(Promise.resolve(database));
});

afterEach(async () => {
  database.close();
  await deleteDB(databaseName);
});

describe('local chat repository', () => {
  it('orders chats by activity and partitions users', async () => {
    const first = await repository.create('alice', 'First');
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await repository.create('alice', 'Second');
    await repository.create('bob', 'Private');
    await new Promise((resolve) => setTimeout(resolve, 2));
    await repository.append('alice', first.id, 'user', 'bump');

    expect((await repository.list('alice')).map((chat) => chat.id)).toEqual([first.id, second.id]);
    expect((await repository.list('bob')).map((chat) => chat.title)).toEqual(['Private']);
    expect(await repository.get('bob', first.id)).toBeNull();
  });

  it('stores ordered messages and validates local writes', async () => {
    const chat = await repository.create('alice');
    expect(await repository.append('alice', chat.id, 'user', 'one')).toMatchObject({ position: 0 });
    expect(await repository.append('alice', chat.id, 'assistant', 'two')).toMatchObject({
      position: 1
    });
    expect(await repository.append('alice', chat.id, 'user', '   ')).toBeNull();
    expect((await repository.get('alice', chat.id))?.messages.map((item) => item.content)).toEqual([
      'one',
      'two'
    ]);
  });

  it('atomically converts an ordered transcript into a local chat', async () => {
    const saved = await repository.createWithMessages('alice', 'Temporary chat', [
      { role: 'user', content: 'one', createdAt: 10 },
      { role: 'assistant', content: 'two', createdAt: 20 }
    ]);

    expect(await repository.get('alice', saved.id)).toMatchObject({
      title: 'Temporary chat',
      messages: [
        { role: 'user', content: 'one', position: 0, createdAt: 10 },
        { role: 'assistant', content: 'two', position: 1, createdAt: 20 }
      ]
    });
  });

  it('rejects an invalid conversion without leaving a partial chat', async () => {
    await expect(
      repository.createWithMessages('alice', 'Temporary chat', [
        { role: 'user', content: 'valid', createdAt: 10 },
        { role: 'assistant', content: '   ', createdAt: 20 }
      ])
    ).rejects.toThrow('Invalid chat transcript');

    expect(await repository.list('alice')).toEqual([]);
    expect(await database.count('messages')).toBe(0);
  });

  it('renames owned chats and cascades message deletion', async () => {
    const chat = await repository.create('alice');
    await repository.append('alice', chat.id, 'user', 'hello');
    expect(await repository.rename('bob', chat.id, 'Stolen')).toBe(false);
    expect(await repository.rename('alice', chat.id, 'Renamed')).toBe(true);
    expect((await repository.get('alice', chat.id))?.title).toBe('Renamed');
    expect(await repository.delete('alice', chat.id)).toBe(true);
    expect(await repository.get('alice', chat.id)).toBeNull();
  });

  it('surfaces database initialization failures', async () => {
    const failure = new LocalChatRepository(Promise.reject(new Error('storage blocked')));
    await expect(failure.list('alice')).rejects.toThrow('storage blocked');
  });
});
