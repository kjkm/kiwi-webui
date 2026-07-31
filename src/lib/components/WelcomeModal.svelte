<script lang="ts">
  import { base } from '$app/paths';
  import { onMount, tick } from 'svelte';
  import Markdown from './Markdown.svelte';

  let { userId }: { userId: string } = $props();

  let dialog = $state<HTMLDialogElement>();
  let actionButton = $state<HTMLButtonElement>();
  let content = $state('');
  let acknowledgementKey = $derived(`kiwi_welcome_ack:${userId}`);

  onMount(() => {
    const reopen = () => void loadWelcomeMessage();
    window.addEventListener('kiwi:show-welcome', reopen);

    let acknowledged = false;
    try {
      acknowledged = localStorage.getItem(acknowledgementKey) === '1';
    } catch {
      // Browser storage policy must not prevent the message from being shown or dismissed.
    }
    if (!acknowledged) void loadWelcomeMessage();

    return () => window.removeEventListener('kiwi:show-welcome', reopen);
  });

  async function loadWelcomeMessage(): Promise<void> {
    try {
      const response = await fetch(`${base}/welcome.md`, { cache: 'no-store' });
      if (!response.ok) return;
      const markdown = (await response.text()).trim();
      if (!markdown) return;
      content = markdown;
      await tick();
      dialog?.showModal();
      actionButton?.focus();
    } catch {
      // Welcome content is optional and must never block the authenticated application.
    }
  }

  function acknowledge(): void {
    try {
      localStorage.setItem(acknowledgementKey, '1');
    } catch {
      // Dismiss for this page session even when persistence is unavailable.
    }
    dialog?.close();
    content = '';
  }

  function containFocus(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !dialog) return;
    const focusable = [
      ...dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (!focusable.includes(document.activeElement as HTMLElement)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function preventCancellation(event: Event): void {
    event.preventDefault();
  }
</script>

<dialog
  bind:this={dialog}
  class="welcome-dialog"
  aria-label="Welcome message"
  onkeydown={containFocus}
  oncancel={preventCancellation}
>
  {#if content}
    <div class="welcome-dialog-panel">
      <div class="welcome-dialog-content">
        <Markdown {content} />
      </div>
      <div class="welcome-dialog-actions">
        <button bind:this={actionButton} class="primary-button" type="button" onclick={acknowledge}
          >Cool, thanks.</button
        >
      </div>
    </div>
  {/if}
</dialog>
