<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { onMount, untrack } from 'svelte';
  import Markdown from './Markdown.svelte';
  import ModelSelector from './ModelSelector.svelte';
  import ChevronUpDown from './icons/ChevronUpDown.svelte';
  import EllipsisHorizontal from './icons/EllipsisHorizontal.svelte';
  import GarbageBin from './icons/GarbageBin.svelte';
  import Pencil from './icons/Pencil.svelte';
  import PencilSquare from './icons/PencilSquare.svelte';
  import SidebarIcon from './icons/Sidebar.svelte';
  import SignOut from './icons/SignOut.svelte';
  import type { ModelInfo } from '$lib/models';
  import type { Chat, ChatSummary, Message, User } from '$lib/server/db/types';

  let {
    appName,
    defaultModel,
    user,
    initialChats,
    initialChat
  }: {
    appName: string;
    defaultModel: string;
    user: User;
    initialChats: ChatSummary[];
    initialChat: Chat | null;
  } = $props();

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
  const initialModel = untrack(() => defaultModel);
  let modelOptions = $state<ModelInfo[]>(
    initialModel ? [{ id: initialModel, name: initialModel, ownedBy: null }] : []
  );
  let selectedModel = $state(initialModel);
  let sidebarOpen = $state(true);
  let chatMenuId = $state<string | null>(null);

  onMount(async () => {
    sidebarOpen = localStorage.getItem('kiwi_sidebar') !== 'closed';
    const response = await fetch('/api/models').catch(() => null);
    if (!response?.ok) return;
    const payload = (await response.json()) as { models: ModelInfo[]; defaultModel: string };
    modelOptions = payload.models;
    const saved = localStorage.getItem('kiwi_model');
    selectedModel = modelOptions.some((model) => model.id === saved)
      ? saved!
      : payload.defaultModel;
  });

  function selectModel(model: string): void {
    selectedModel = model;
    localStorage.setItem('kiwi_model', model);
  }

  function toggleSidebar(): void {
    sidebarOpen = !sidebarOpen;
    localStorage.setItem('kiwi_sidebar', sidebarOpen ? 'open' : 'closed');
  }

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
    chatMenuId = null;
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
    chatMenuId = null;
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
        body: JSON.stringify({ content, model: selectedModel }),
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

<svelte:window onclick={() => (chatMenuId = null)} />

<div class:sidebar-collapsed={!sidebarOpen} class="app-shell">
  {#if !sidebarOpen}
    <nav class="sidebar-rail desktop-only" aria-label="Collapsed chat navigation">
      <button class="rail-brand sidebar-control" aria-label="Open Sidebar" onclick={toggleSidebar}>
        <img src="/kiwi.svg" alt="" aria-hidden="true" />
        <span class="rail-sidebar-icon"><SidebarIcon /></span>
      </button>
      <button class="sidebar-control" aria-label="New Chat" onclick={createChat}>
        <PencilSquare strokeWidth="2" />
      </button>
    </nav>
  {/if}

  <aside class:desktop-hidden={!sidebarOpen} class:open={mobileNav} aria-label="Chat navigation">
    <div class="sidebar-heading">
      <a class="brand" href={resolve('/')}>
        <img class="brand-logo" src="/kiwi.svg" alt="" aria-hidden="true" />
        <span>{appName}</span>
      </a>
      <button
        class="sidebar-control desktop-only"
        aria-label="Close Sidebar"
        onclick={toggleSidebar}
      >
        <SidebarIcon />
      </button>
      <button
        class="sidebar-control mobile-only"
        aria-label="Close Sidebar"
        onclick={() => (mobileNav = false)}
      >
        <SidebarIcon />
      </button>
    </div>

    <div class="sidebar-scroll">
      <div class="sidebar-primary-actions">
        <button class="new-chat" aria-label="New Chat" onclick={createChat}>
          <PencilSquare strokeWidth="2" />
          <span>New Chat</span>
        </button>
      </div>

      <nav class="chat-list" aria-label="Conversations">
        {#each chats as chat (chat.id)}
          <div class:active={initialChat?.id === chat.id} class="chat-row">
            <a href={resolve(`/c/${chat.id}`)} onclick={() => (mobileNav = false)}>{chat.title}</a>
            <button
              class="chat-menu-trigger"
              class:visible={chatMenuId === chat.id}
              aria-label={`More options for ${chat.title}`}
              aria-expanded={chatMenuId === chat.id}
              onclick={(event) => {
                event.stopPropagation();
                chatMenuId = chatMenuId === chat.id ? null : chat.id;
              }}
            >
              <EllipsisHorizontal />
            </button>
            {#if chatMenuId === chat.id}
              <div class="chat-menu">
                <button onclick={() => renameChat(chat)}><Pencil /><span>Rename</span></button>
                <button class="danger" onclick={() => deleteChat(chat)}
                  ><GarbageBin /><span>Delete</span></button
                >
              </div>
            {/if}
          </div>
        {/each}
        {#if chats.length === 0}<p class="sidebar-empty">No conversations yet</p>{/if}
      </nav>
    </div>

    <div class="sidebar-footer">
      <details class="account-menu">
        <summary class="account-row" aria-label="User menu">
          <span class="account-avatar"
            >{(user.displayName ?? user.username).slice(0, 1).toUpperCase()}</span
          >
          <span class="account-name">{user.displayName ?? user.username}</span>
          <ChevronUpDown />
        </summary>
        <div class="account-popover">
          <div class="account-identity">
            <strong>{user.displayName ?? user.username}</strong><span>@{user.username}</span>
          </div>
          <form method="POST" action={resolve('/auth/logout')}>
            <button type="submit"><SignOut /><span>Sign out</span></button>
          </form>
        </div>
      </details>
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
        class="sidebar-control mobile-only"
        aria-label="Open Sidebar"
        onclick={() => (mobileNav = true)}
      >
        <SidebarIcon />
      </button>
      <ModelSelector
        models={modelOptions}
        value={selectedModel}
        disabled={busy}
        onSelect={selectModel}
      />
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
