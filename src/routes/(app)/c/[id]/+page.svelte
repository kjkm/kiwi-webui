<script lang="ts">
  import type { PageData } from './$types';
  import ChatApp from '$lib/components/ChatApp.svelte';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{data.chat.title} · {data.appName}</title></svelte:head>
<ChatApp
  appName={data.appName}
  defaultModel={data.defaultModel}
  user={data.user}
  initialChats={data.chats}
  initialChat={data.chat}
/>
