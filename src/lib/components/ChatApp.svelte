<script lang="ts">
  import { goto, replaceState } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { onMount, tick, untrack } from 'svelte';
  import Markdown from './Markdown.svelte';
  import ModelSelector from './ModelSelector.svelte';
  import ArrowUp from './icons/ArrowUp.svelte';
  import ChatBubbleDotted from './icons/ChatBubbleDotted.svelte';
  import ChatBubbleDottedChecked from './icons/ChatBubbleDottedChecked.svelte';
  import ChatCheck from './icons/ChatCheck.svelte';
  import ChevronUpDown from './icons/ChevronUpDown.svelte';
  import EllipsisHorizontal from './icons/EllipsisHorizontal.svelte';
  import GarbageBin from './icons/GarbageBin.svelte';
  import Pencil from './icons/Pencil.svelte';
  import PencilSquare from './icons/PencilSquare.svelte';
  import SidebarIcon from './icons/Sidebar.svelte';
  import SignOut from './icons/SignOut.svelte';
  import StopCircle from './icons/StopCircle.svelte';
  import type { ModelInfo } from '$lib/models';
  import type { ChatSummary, Message } from '$lib/chat';
  import { LocalChatRepository } from '$lib/client/chats';
  import { parseGenerationEvent } from '$lib/generation-events';
  import type { User } from '$lib/server/db/types';

  let {
    appName,
    defaultModel,
    user,
    requestedChatId
  }: {
    appName: string;
    defaultModel: string;
    user: User;
    requestedChatId: string | null;
  } = $props();

  let chats = $state<ChatSummary[]>([]);
  let messages = $state<Message[]>([]);
  let activeChatId = $state<string | null>(null);
  let loadedRequestedId = $state<string | null | undefined>(undefined);
  let storageStatus = $state<'loading' | 'ready' | 'error'>('loading');
  let storageError = $state('');
  let missingChat = $state(false);
  let repository: LocalChatRepository | null = null;
  let prompt = $state('');
  let streaming = $state('');
  let busy = $state(false);
  let generationStatus = $state<'loading_model' | 'generating' | 'reconnecting' | null>(null);
  let failure = $state('');
  let mobileNav = $state(false);
  let controller: AbortController | null = null;
  let activeGenerationId: string | null = null;
  let generationCursor = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let wakeReconnect: (() => void) | null = null;
  const initialModel = untrack(() => defaultModel);
  let modelOptions = $state<ModelInfo[]>(
    initialModel ? [{ id: initialModel, name: initialModel, ownedBy: null }] : []
  );
  let selectedModel = $state(initialModel);
  let sidebarOpen = $state(true);
  let chatMenuId = $state<string | null>(null);
  let temporaryMode = $state(false);
  let temporaryConversationId = $state<string | null>(null);
  let composerElement: HTMLTextAreaElement | null = null;

  $effect(() => {
    const id = requestedChatId;
    const loadedId = untrack(() => loadedRequestedId);
    if (storageStatus === 'ready' && id !== loadedId) void loadRequestedChat(id);
  });

  onMount(() => {
    sidebarOpen = localStorage.getItem('kiwi_sidebar') !== 'closed';
    void hydrateLocalChats();
    void loadModels();
    const resume = () => {
      if (!busy || !activeGenerationId) return;
      if (generationStatus === 'reconnecting') wakeReconnect?.();
      else controller?.abort();
    };
    const foreground = () => {
      if (document.visibilityState === 'visible') resume();
    };
    window.addEventListener('online', resume);
    window.addEventListener('offline', resume);
    document.addEventListener('visibilitychange', foreground);
    return () => {
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', resume);
      document.removeEventListener('visibilitychange', foreground);
      controller?.abort();
      clearReconnectWait();
    };
  });

  async function hydrateLocalChats(): Promise<void> {
    storageStatus = 'loading';
    storageError = '';
    try {
      repository = new LocalChatRepository();
      chats = await repository.list(user.id);
      storageStatus = 'ready';
    } catch {
      failStorage('Local chat storage is unavailable. Check your browser storage settings.');
    }
  }

  async function loadModels(): Promise<void> {
    const response = await fetch('/api/models').catch(() => null);
    if (!response?.ok) return;
    const payload = (await response.json()) as { models: ModelInfo[]; defaultModel: string };
    modelOptions = payload.models;
    const saved = localStorage.getItem('kiwi_model');
    selectedModel = modelOptions.some((model) => model.id === saved)
      ? saved!
      : payload.defaultModel;
  }

  async function loadRequestedChat(chatId: string | null): Promise<void> {
    if (!repository) return;
    cancelActiveGeneration();
    streaming = '';
    generationStatus = null;
    busy = false;
    if (chatId && temporaryMode) discardTemporaryChat();
    loadedRequestedId = chatId;
    activeChatId = chatId;
    missingChat = false;
    if (!chatId) {
      messages = [];
      return;
    }
    try {
      const chat = await repository.get(user.id, chatId);
      if (!chat) {
        messages = [];
        missingChat = true;
        return;
      }
      messages = chat.messages;
    } catch {
      failStorage('Unable to read chats from local browser storage.');
    }
  }

  function failStorage(message: string): void {
    storageStatus = 'error';
    storageError = message;
    generationStatus = null;
    busy = false;
  }

  function selectModel(model: string): void {
    selectedModel = model;
    localStorage.setItem('kiwi_model', model);
  }

  function toggleSidebar(): void {
    sidebarOpen = !sidebarOpen;
    localStorage.setItem('kiwi_sidebar', sidebarOpen ? 'open' : 'closed');
  }

  async function refreshChats(): Promise<void> {
    if (repository) chats = await repository.list(user.id);
  }

  async function createChatRecord(): Promise<ChatSummary | null> {
    if (!repository || storageStatus !== 'ready') return null;
    try {
      const chat = await repository.create(user.id);
      await refreshChats();
      return chat;
    } catch {
      failStorage('Unable to save chats in local browser storage.');
      return null;
    }
  }

  async function createChat(): Promise<void> {
    if (temporaryMode) {
      discardTemporaryChat();
    } else {
      cancelActiveGeneration();
      activeChatId = null;
      loadedRequestedId = null;
      messages = [];
      streaming = '';
      generationStatus = null;
      prompt = '';
      failure = '';
      missingChat = false;
      busy = false;
    }
    await goto(resolve('/'));
  }

  function toggleTemporaryChat(): void {
    if (activeChatId || messages.length > 0 || busy) return;
    temporaryMode = !temporaryMode;
    temporaryConversationId = temporaryMode ? crypto.randomUUID() : null;
    failure = '';
  }

  function discardTemporaryChat(): void {
    if (!temporaryMode) return;
    cancelActiveGeneration();
    temporaryMode = false;
    temporaryConversationId = null;
    messages = [];
    streaming = '';
    generationStatus = null;
    prompt = '';
    failure = '';
    busy = false;
  }

  async function saveTemporaryChat(): Promise<void> {
    if (!temporaryMode || messages.length === 0 || busy || !repository) return;
    const firstPrompt = messages.find((item) => item.role === 'user')?.content.trim();
    const title = (firstPrompt?.split(/\r?\n/, 1)[0] || 'New chat').slice(0, 120);
    try {
      const chat = await repository.createWithMessages(user.id, title, messages);
      const saved = await repository.get(user.id, chat.id);
      if (!saved) throw new Error('Unable to load saved chat');
      temporaryMode = false;
      temporaryConversationId = null;
      activeChatId = chat.id;
      loadedRequestedId = chat.id;
      messages = saved.messages;
      await refreshChats();
      replaceState(resolve(`/c/${chat.id}`), {});
    } catch {
      failure = 'Unable to save this temporary chat in local browser storage.';
    }
  }

  async function renameChat(chat: ChatSummary): Promise<void> {
    chatMenuId = null;
    const title = window.prompt('Rename chat', chat.title)?.trim();
    if (!title || title === chat.title || !repository) return;
    try {
      if (await repository.rename(user.id, chat.id, title)) await refreshChats();
    } catch {
      failStorage('Unable to rename this local chat.');
    }
  }

  async function deleteChat(chat: ChatSummary): Promise<void> {
    chatMenuId = null;
    if (!window.confirm(`Delete “${chat.title}”?`) || !repository) return;
    if (activeChatId === chat.id) cancelActiveGeneration();
    try {
      if (!(await repository.delete(user.id, chat.id))) return;
      await refreshChats();
      if (activeChatId === chat.id) await goto(resolve('/'));
    } catch {
      failStorage('Unable to delete this local chat.');
    }
  }

  class TerminalGenerationError extends Error {}

  function clearReconnectWait(): void {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = null;
    wakeReconnect = null;
  }

  function waitForReconnect(attempt: number): Promise<void> {
    clearReconnectWait();
    return new Promise((resolve) => {
      const finish = () => {
        clearReconnectWait();
        resolve();
      };
      wakeReconnect = finish;
      reconnectTimer = setTimeout(finish, Math.min(300 * 2 ** attempt, 5000));
    });
  }

  function removeGeneration(generationId: string): Promise<Response | null> {
    return fetch(`/api/generate/${generationId}`, { method: 'DELETE', keepalive: true }).catch(
      () => null
    );
  }

  function cancelActiveGeneration(): void {
    const generationId = activeGenerationId;
    activeGenerationId = null;
    generationCursor = 0;
    controller?.abort();
    controller = null;
    clearReconnectWait();
    if (generationId) {
      void removeGeneration(generationId);
      setTimeout(() => void removeGeneration(generationId), 500);
    }
  }

  function leaveActiveConversation(): void {
    cancelActiveGeneration();
    discardTemporaryChat();
    mobileNav = false;
  }

  function finishGeneration(generationId: string): void {
    if (activeGenerationId !== generationId) return;
    activeGenerationId = null;
    generationCursor = 0;
    controller = null;
    clearReconnectWait();
    generationStatus = null;
    busy = false;
  }

  async function consumeGenerationStream(response: Response, generationId: string): Promise<void> {
    if (!response.body) throw new Error('Generation stream is unavailable');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    while (activeGenerationId === generationId) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? '';
      if (done && buffer) events.push(buffer);
      for (const item of events) {
        const event = parseGenerationEvent(item);
        if (!event) {
          if (item.includes('data:')) throw new Error('Generation event was invalid');
          continue;
        }
        if (event.sequence <= generationCursor) continue;
        if (event.sequence !== generationCursor + 1)
          throw new Error('Generation events were interrupted');
        generationCursor = event.sequence;
        if (event.data.type === 'status') generationStatus = event.data.status;
        if (event.data.type === 'delta') {
          generationStatus = null;
          streaming += event.data.content;
        }
        if (event.data.type === 'done') {
          generationStatus = null;
          return;
        }
        if (event.data.type === 'error') throw new TerminalGenerationError(event.data.error);
      }
      if (done) throw new Error('Generation stream disconnected');
    }
  }

  async function send(): Promise<void> {
    const content = prompt.trim();
    if (!content || busy || !repository || storageStatus !== 'ready') return;

    busy = true;
    generationStatus = null;
    const isTemporary = temporaryMode;
    let chatId = isTemporary ? temporaryConversationId : activeChatId;
    if (isTemporary) {
      chatId ??= crypto.randomUUID();
      temporaryConversationId = chatId;
    } else if (!chatId) {
      const chat = await createChatRecord();
      if (!chat) {
        busy = false;
        return;
      }
      chatId = chat.id;
      activeChatId = chat.id;
      loadedRequestedId = chat.id;
      replaceState(resolve(`/c/${chat.id}`), {});
    }
    if (!chatId) {
      busy = false;
      return;
    }

    prompt = '';
    failure = '';
    streaming = '';
    if (isTemporary) {
      messages = [
        ...messages,
        {
          id: crypto.randomUUID(),
          chatId,
          position: messages.length,
          role: 'user',
          content,
          createdAt: Date.now()
        }
      ];
    } else {
      try {
        const userMessage = await repository.append(user.id, chatId, 'user', content);
        if (!userMessage) throw new Error('Unable to save the message');
        messages = [...messages, userMessage];
        await refreshChats();
      } catch {
        failStorage('Unable to save your message in local browser storage.');
        return;
      }
    }

    await tick();
    resizeComposer();
    composerElement?.focus();

    const generationId = crypto.randomUUID();
    activeGenerationId = generationId;
    generationCursor = 0;
    const history = messages.map(({ role, content: messageContent }) => ({
      role,
      content: messageContent
    }));
    const startedAt = Date.now();
    let created = false;
    let attempt = 0;

    try {
      while (activeGenerationId === generationId) {
        controller = new AbortController();
        try {
          const response = await fetch(
            created ? `/api/generate/${generationId}?after=${generationCursor}` : '/api/generate',
            {
              method: created ? 'GET' : 'POST',
              headers: created ? undefined : { 'content-type': 'application/json' },
              body: created
                ? undefined
                : JSON.stringify({
                    generationId,
                    conversationId: chatId,
                    model: selectedModel,
                    messages: history
                  }),
              signal: controller.signal
            }
          );
          if (!response.ok) {
            const body = (await response.json().catch(() => ({}))) as { error?: string };
            if (created && response.status === 404) {
              throw new TerminalGenerationError('The response is no longer available.');
            }
            throw new TerminalGenerationError(body.error ?? 'Unable to generate a response.');
          }
          created = true;
          if (generationStatus === 'reconnecting') generationStatus = null;
          await consumeGenerationStream(response, generationId);
          break;
        } catch (error) {
          if (activeGenerationId !== generationId) return;
          if (error instanceof TerminalGenerationError) throw error;
          if (Date.now() - startedAt >= 10 * 60 * 1000) {
            throw new TerminalGenerationError('The response is no longer available.');
          }
          generationStatus = 'reconnecting';
          await waitForReconnect(attempt++);
        }
      }

      if (activeGenerationId !== generationId) return;
      if (!streaming.trim()) throw new TerminalGenerationError('The response was interrupted.');
      const completedContent = streaming;
      if (isTemporary) {
        if (!temporaryMode || temporaryConversationId !== chatId) return;
        messages = [
          ...messages,
          {
            id: crypto.randomUUID(),
            chatId,
            position: messages.length,
            role: 'assistant',
            content: completedContent,
            createdAt: Date.now()
          }
        ];
        streaming = '';
      } else {
        const assistant = await repository.append(user.id, chatId, 'assistant', completedContent);
        if (!assistant) throw new Error('Unable to save the response');
        messages = [...messages, assistant];
        streaming = '';
        await refreshChats();
      }
      await removeGeneration(generationId);
      finishGeneration(generationId);
    } catch (error) {
      if (activeGenerationId !== generationId) return;
      streaming = '';
      generationStatus = null;
      if (!isTemporary || temporaryMode) {
        failure =
          error instanceof TerminalGenerationError
            ? error.message
            : 'Unable to save the response in local browser storage.';
      }
      finishGeneration(generationId);
    }
  }

  function stop(): void {
    cancelActiveGeneration();
    streaming = '';
    generationStatus = null;
    busy = false;
  }

  function resizeComposer(event?: Event): void {
    const textarea = (event?.currentTarget as HTMLTextAreaElement | null) ?? composerElement;
    if (!textarea) return;
    textarea.style.height = 'auto';
    const maximumHeight = Number.parseFloat(getComputedStyle(textarea).maxHeight);
    const contentHeight = textarea.scrollHeight;
    textarea.style.height = `${Math.min(contentHeight, maximumHeight)}px`;
    textarea.style.overflowY = contentHeight > maximumHeight ? 'auto' : 'hidden';
  }

  function composerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter') return;
    const mobile = window.matchMedia('(max-width: 760px)').matches;
    if (!mobile && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }
</script>

{#snippet composer()}
  <div class:temporary={temporaryMode} class="composer">
    <label class="sr-only" for="prompt">Message</label>
    <textarea
      id="prompt"
      bind:this={composerElement}
      bind:value={prompt}
      oninput={resizeComposer}
      onkeydown={composerKeydown}
      rows="1"
      maxlength="32000"
      placeholder="What can I help with?"
    ></textarea>
    {#if busy}
      <button class="send-button stop" aria-label="Stop generation" onclick={stop}>
        <StopCircle />
      </button>
    {:else}
      <button
        class="send-button"
        aria-label="Send message"
        onclick={send}
        disabled={!prompt.trim()}
      >
        <ArrowUp />
      </button>
    {/if}
  </div>
  <p class="disclaimer">AI can make mistakes. Check important information.</p>
{/snippet}

<svelte:window onclick={() => (chatMenuId = null)} />

<div class:sidebar-collapsed={!sidebarOpen} class="app-shell">
  <div class="sidebar-stage">
    <nav class="sidebar-rail desktop-only" aria-label="Collapsed chat navigation">
      <button class="rail-brand sidebar-control" aria-label="Open Sidebar" onclick={toggleSidebar}>
        <img src="/kiwi.svg" alt="" aria-hidden="true" />
        <span class="rail-sidebar-icon"><SidebarIcon /></span>
      </button>
      <button class="sidebar-control" aria-label="New Chat" onclick={createChat}>
        <PencilSquare strokeWidth="2" />
      </button>
    </nav>

    <aside class:desktop-hidden={!sidebarOpen} class:open={mobileNav} aria-label="Chat navigation">
      <div class="sidebar-heading">
        <a class="brand" href={resolve('/')} onclick={leaveActiveConversation}>
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
            <div class:active={activeChatId === chat.id} class="chat-row">
              <a href={resolve(`/c/${chat.id}`)} onclick={leaveActiveConversation}>{chat.title}</a>
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
          {#if storageStatus === 'loading'}
            <p class="sidebar-empty">Loading chats…</p>
          {:else if storageStatus === 'error'}
            <p class="sidebar-empty">Local storage unavailable</p>
          {:else if chats.length === 0}
            <p class="sidebar-empty">No conversations yet</p>
          {/if}
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
            <form method="POST" action={resolve('/auth/logout')} onsubmit={leaveActiveConversation}>
              <button type="submit"><SignOut /><span>Sign out</span></button>
            </form>
          </div>
        </details>
      </div>
    </aside>
  </div>

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
      {#if !activeChatId}
        <div class="conversation-header-actions">
          {#if temporaryMode && messages.length > 0}
            <button
              class="temporary-chat-control"
              aria-label="Save temporary chat"
              title="Save Chat"
              disabled={busy}
              onclick={saveTemporaryChat}
            >
              <ChatCheck />
            </button>
          {:else}
            <button
              class:active={temporaryMode}
              class="temporary-chat-control"
              aria-label="Temporary Chat"
              aria-pressed={temporaryMode}
              title="Temporary Chat"
              disabled={busy}
              onclick={toggleTemporaryChat}
            >
              {#if temporaryMode}<ChatBubbleDottedChecked />{:else}<ChatBubbleDotted />{/if}
            </button>
          {/if}
        </div>
      {/if}
    </header>

    {#if storageStatus === 'loading'}
      <section class="storage-state" aria-live="polite">
        <p>Loading local chats…</p>
      </section>
    {:else if storageStatus === 'error'}
      <section class="storage-state" role="alert">
        <h2>Local storage unavailable</h2>
        <p>{storageError}</p>
        <button class="primary-button" onclick={hydrateLocalChats}>Try again</button>
      </section>
    {:else if missingChat}
      <section class="storage-state">
        <h2>Chat not found</h2>
        <p>This conversation is not stored in this browser.</p>
        <a class="primary-button" href={resolve('/')}>Start a new chat</a>
      </section>
    {:else if messages.length === 0 && !busy}
      <section class="new-chat-view" aria-live="polite">
        <div class="new-chat-content">
          <div class="new-chat-heading">
            {#if temporaryMode}
              <span class="brand-mark temporary-brand-mark" aria-hidden="true"></span>
            {:else}
              <img class="brand-mark" src="/kiwi.svg" alt="" aria-hidden="true" />
            {/if}
            <h2>{temporaryMode ? 'Incognito' : "Hi, I'm Kiwi!"}</h2>
          </div>
          <div class="new-chat-composer">{@render composer()}</div>
          {#if failure}<div class="notice error" role="alert">{failure}</div>{/if}
        </div>
      </section>
    {:else}
      <section class="messages" aria-live="polite">
        {#each messages as message (message.id)}
          <article
            class:assistant={message.role === 'assistant'}
            class:user-message={message.role === 'user'}
            class="message"
          >
            <div class="message-label">{message.role === 'assistant' ? 'Kiwi' : 'You'}</div>
            {#if message.role === 'assistant'}<Markdown content={message.content} />{:else}<p>
                {message.content}
              </p>{/if}
          </article>
        {/each}
        {#if streaming}
          <article class="message assistant streaming">
            <div class="message-label">Kiwi</div>
            <Markdown content={streaming} /><span class="cursor">▋</span>
            {#if generationStatus === 'reconnecting'}
              <p class="generation-reconnecting" role="status">Reconnecting…</p>
            {/if}
          </article>
        {:else if busy && generationStatus === 'reconnecting'}
          <article class="message assistant generation-reconnecting" role="status">
            <div class="message-label">Kiwi</div>
            <p>Reconnecting…</p>
          </article>
        {:else if busy && generationStatus === 'loading_model'}
          <article class="message assistant loading-model" role="status">
            <div class="message-label">Kiwi</div>
            <p>Loading model…</p>
          </article>
        {:else if busy}
          <article class="message assistant thinking" aria-label="Generating response">
            <div class="message-label">Kiwi</div>
            <span></span><span></span><span></span>
          </article>
        {/if}
        {#if failure}<div class="notice error" role="alert">{failure}</div>{/if}
      </section>

      <div class="composer-wrap">{@render composer()}</div>
    {/if}
  </main>
</div>
