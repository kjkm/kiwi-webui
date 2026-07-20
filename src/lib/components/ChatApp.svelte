<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import Markdown from './Markdown.svelte';
  import type { Chat, ChatSummary, Message, User } from '$lib/server/db/types';

  let {
    appName,
    user,
    initialChats,
    initialChat
  }: { appName: string; user: User; initialChats: ChatSummary[]; initialChat: Chat | null } =
    $props();

  let chats = $state<ChatSummary[]>([]);
  let messages = $state<Message[]>([]);
  let loadedChatId = $state<string | null | undefined>(undefined);
  $effect(() => {
    chats = [...initialChats];
    const nextId = initialChat?.id ?? null;
    if (nextId !== loadedChatId) {
      messages = initialChat ? [...initialChat.messages] : [];
      loadedChatId = nextId;
    }
  });
  let prompt = $state('');
  let streaming = $state('');
  let busy = $state(false);
  let failure = $state('');
  let mobileNav = $state(false);
  let controller: AbortController | null = null;

  async function createChat(): Promise<void> {
    const response = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({})
    });
    if (!response.ok) return;
    const { chat } = (await response.json()) as { chat: ChatSummary };
    chats = [chat, ...chats];
    await goto(resolve(`/c/${chat.id}`));
  }

  async function renameChat(chat: ChatSummary): Promise<void> {
    const title = window.prompt('Rename chat', chat.title)?.trim();
    if (!title || title === chat.title) return;
    const response = await fetch(`/api/chats/${chat.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title })
    });
    if (response.ok) chats = chats.map((item) => (item.id === chat.id ? { ...item, title } : item));
  }

  async function deleteChat(chat: ChatSummary): Promise<void> {
    if (!window.confirm(`Delete “${chat.title}”?`)) return;
    const response = await fetch(`/api/chats/${chat.id}`, { method: 'DELETE' });
    if (!response.ok) return;
    chats = chats.filter((item) => item.id !== chat.id);
    if (initialChat?.id === chat.id) await goto(resolve('/'));
  }

  function consumeEvent(raw: string): void {
    const line = raw.split(/\r?\n/).find((part) => part.startsWith('data:'));
    if (!line) return;
    const value = JSON.parse(line.slice(5).trim()) as {
      type: 'delta' | 'done' | 'error';
      content?: string;
      message?: Message;
      error?: string;
    };
    if (value.type === 'delta') streaming += value.content ?? '';
    if (value.type === 'done' && value.message) {
      messages = [...messages, value.message];
      streaming = '';
    }
    if (value.type === 'error') {
      streaming = '';
      failure = value.error ?? 'The response was interrupted.';
    }
  }

  async function send(): Promise<void> {
    const content = prompt.trim();
    if (!initialChat || !content || busy) return;
    prompt = '';
    failure = '';
    streaming = '';
    busy = true;
    const optimistic: Message = {
      id: `pending-${Date.now()}`,
      chatId: initialChat.id,
      position: messages.length,
      role: 'user',
      content,
      createdAt: Date.now()
    };
    messages = [...messages, optimistic];
    controller = new AbortController();

    try {
      const response = await fetch(`/api/chats/${initialChat.id}/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content }),
        signal: controller.signal
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Unable to generate a response.');
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const events = buffer.split(/\r?\n\r?\n/);
        buffer = events.pop() ?? '';
        for (const item of events) consumeEvent(item);
        if (done) {
          if (buffer) consumeEvent(buffer);
          break;
        }
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') failure = (error as Error).message;
    } finally {
      busy = false;
      controller = null;
    }
  }

  function stop(): void {
    controller?.abort();
    streaming = '';
    busy = false;
  }

  function composerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }
</script>

<div class="app-shell">
  <aside class:open={mobileNav} aria-label="Chat navigation">
    <div class="sidebar-heading">
      <a class="brand" href={resolve('/')}>
        <img class="brand-logo" src="/kiwi.svg" alt="" aria-hidden="true" />
        <span>{appName}</span>
      </a>
      <button
        class="icon-button mobile-only"
        aria-label="Close navigation"
        onclick={() => (mobileNav = false)}>×</button
      >
    </div>
    <button class="new-chat" onclick={createChat}>＋ New chat</button>
    <nav class="chat-list" aria-label="Conversations">
      {#each chats as chat (chat.id)}
        <div class:active={initialChat?.id === chat.id} class="chat-row">
          <a href={resolve(`/c/${chat.id}`)} onclick={() => (mobileNav = false)}>{chat.title}</a>
          <div class="chat-actions">
            <button aria-label={`Rename ${chat.title}`} onclick={() => renameChat(chat)}>✎</button>
            <button aria-label={`Delete ${chat.title}`} onclick={() => deleteChat(chat)}>×</button>
          </div>
        </div>
      {/each}
      {#if chats.length === 0}<p class="sidebar-empty">No conversations yet</p>{/if}
    </nav>
    <div class="account">
      <div><strong>{user.displayName ?? user.username}</strong><span>@{user.username}</span></div>
      <form method="POST" action={resolve('/auth/logout')}>
        <button type="submit">Sign out</button>
      </form>
    </div>
  </aside>

  {#if mobileNav}<button
      class="nav-scrim"
      aria-label="Close navigation"
      onclick={() => (mobileNav = false)}
    ></button>{/if}

  <main class="conversation">
    <header class="conversation-header">
      <button
        class="icon-button mobile-only"
        aria-label="Open navigation"
        onclick={() => (mobileNav = true)}>☰</button
      >
      <h1>{initialChat?.title ?? 'New conversation'}</h1>
    </header>

    <section class="messages" aria-live="polite">
      {#if !initialChat}
        <div class="empty-state">
          <img class="brand-mark" src="/kiwi.svg" alt="" aria-hidden="true" />
          <h2>What can I help with?</h2>
          <button class="primary-button" onclick={createChat}>Start a conversation</button>
        </div>
      {:else if messages.length === 0 && !busy}
        <div class="empty-state">
          <img class="brand-mark" src="/kiwi.svg" alt="" aria-hidden="true" />
          <h2>What can I help with?</h2>
          <p>Send a message to begin.</p>
        </div>
      {/if}
      {#each messages as message (message.id)}
        <article
          class:assistant={message.role === 'assistant'}
          class:user-message={message.role === 'user'}
          class="message"
        >
          <div class="message-label">{message.role === 'assistant' ? appName : 'You'}</div>
          {#if message.role === 'assistant'}<Markdown content={message.content} />{:else}<p>
              {message.content}
            </p>{/if}
        </article>
      {/each}
      {#if streaming}
        <article class="message assistant streaming">
          <div class="message-label">{appName}</div>
          <Markdown content={streaming} /><span class="cursor">▋</span>
        </article>
      {:else if busy}
        <article class="message assistant thinking">
          <div class="message-label">{appName}</div>
          <span></span><span></span><span></span>
        </article>
      {/if}
      {#if failure}<div class="notice error" role="alert">{failure}</div>{/if}
    </section>

    {#if initialChat}
      <div class="composer-wrap">
        <div class="composer">
          <label class="sr-only" for="prompt">Message</label>
          <textarea
            id="prompt"
            bind:value={prompt}
            onkeydown={composerKeydown}
            rows="1"
            maxlength="32000"
            placeholder="Message {appName}"
            disabled={busy}
          ></textarea>
          {#if busy}
            <button class="send-button stop" aria-label="Stop generation" onclick={stop}>■</button>
          {:else}
            <button
              class="send-button"
              aria-label="Send message"
              onclick={send}
              disabled={!prompt.trim()}>↑</button
            >
          {/if}
        </div>
        <p class="disclaimer">AI can make mistakes. Check important information.</p>
      </div>
    {/if}
  </main>
</div>
