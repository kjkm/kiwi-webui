<script lang="ts">
  import { resolve } from '$app/paths';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Sign in · {data.appName}</title></svelte:head>

<main class="signin-page">
  <section class="signin-card" aria-labelledby="signin-title">
    <div class="brand-mark" aria-hidden="true">K</div>
    <p class="eyebrow">{data.appName}</p>
    <h1 id="signin-title">Welcome back</h1>
    <p class="muted">Sign in with your organization account to continue.</p>
    {#if data.failed}
      <div class="notice error" role="alert">Sign-in failed. Please try again.</div>
    {/if}
    <a class="primary-button wide" href={resolve('/auth/login')}>Continue with SSO</a>
  </section>
</main>
