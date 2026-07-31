<script lang="ts">
  import { browser } from '$app/environment';
  import DOMPurify from 'dompurify';
  import { renderMarkdownSource } from '$lib/markdown';

  let { content, enableMath = false }: { content: string; enableMath?: boolean } = $props();

  function escapeHtml(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }

  function render(value: string): string {
    if (!browser) return escapeHtml(value);
    const html = renderMarkdownSource(value, enableMath);
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true, mathMl: true } });
  }

  let rendered = $derived(render(content));
</script>

<!-- Output is produced by marked with raw HTML escaped, then DOMPurify. -->
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
<div class="markdown">{@html rendered}</div>
