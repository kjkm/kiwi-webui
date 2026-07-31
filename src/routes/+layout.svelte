<script lang="ts">
  import type { Snippet } from 'svelte';
  import 'katex/dist/katex.min.css';
  import '../app.css';

  let { children }: { children: Snippet } = $props();
</script>

{@render children()}
