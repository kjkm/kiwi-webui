<script lang="ts">
  import { browser } from '$app/environment';
  import DOMPurify from 'dompurify';
  import { marked } from 'marked';

  let { content }: { content: string } = $props();

  function escapeHtml(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  }

  function render(value: string): string {
    if (!browser) return escapeHtml(value);
    const renderer = new marked.Renderer();
    renderer.html = ({ text }: { text: string }) => escapeHtml(text);
    const html = marked.parse(value, { async: false, gfm: true, breaks: true, renderer });
    return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
  }

  let rendered = $derived(render(content));
</script>

<!-- Output is produced by marked with raw HTML escaped, then DOMPurify. -->
<!-- eslint-disable-next-line svelte/no-at-html-tags -->
<div class="markdown">{@html rendered}</div>
