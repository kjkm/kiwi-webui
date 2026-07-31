<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { LayoutData } from './$types';
  import WelcomeModal from '$lib/components/WelcomeModal.svelte';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<WelcomeModal userId={data.user.id} />
{@render children()}
