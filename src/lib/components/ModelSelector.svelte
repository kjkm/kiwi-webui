<script lang="ts">
  import { tick } from 'svelte';
  import type { ModelInfo } from '$lib/models';

  let {
    models,
    value,
    disabled = false,
    onSelect
  }: {
    models: ModelInfo[];
    value: string;
    disabled?: boolean;
    onSelect: (model: string) => void;
  } = $props();

  let open = $state(false);
  let search = $state('');
  let root = $state<HTMLDivElement>();
  let searchInput = $state<HTMLInputElement>();
  let activeIndex = $state(0);
  let filtered = $derived(
    models.filter((model) =>
      `${model.name} ${model.id} ${model.ownedBy ?? ''}`
        .toLowerCase()
        .includes(search.toLowerCase())
    )
  );
  let selected = $derived(models.find((model) => model.id === value) ?? models[0]);

  async function show(): Promise<void> {
    if (disabled) return;
    open = true;
    search = '';
    activeIndex = Math.max(
      0,
      models.findIndex((model) => model.id === value)
    );
    await tick();
    searchInput?.focus();
  }

  function choose(model: ModelInfo): void {
    onSelect(model.id);
    open = false;
  }

  function windowPointerDown(event: PointerEvent): void {
    if (open && !root?.contains(event.target as Node)) open = false;
  }

  function windowKeydown(event: KeyboardEvent): void {
    if (!open || event.key !== 'Escape') return;
    event.preventDefault();
    open = false;
  }

  function searchKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
    } else if (event.key === 'Enter' && filtered[activeIndex]) {
      event.preventDefault();
      choose(filtered[activeIndex]);
    }
  }
</script>

<svelte:window onpointerdown={windowPointerDown} onkeydown={windowKeydown} />

<div class="model-selector" bind:this={root}>
  <button
    class="model-trigger"
    type="button"
    aria-haspopup="listbox"
    aria-expanded={open}
    disabled={disabled || models.length === 0}
    onclick={() => (open ? (open = false) : show())}
  >
    <span>{selected?.name ?? 'Select a model'}</span>
    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 7.5 5 5 5-5" /></svg>
  </button>

  {#if open}
    <div class="model-menu">
      <label class="sr-only" for="model-search">Search models</label>
      <div class="model-search-wrap">
        <svg viewBox="0 0 20 20" aria-hidden="true"
          ><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg
        >
        <input
          id="model-search"
          bind:this={searchInput}
          bind:value={search}
          onkeydown={searchKeydown}
          placeholder="Search models"
          autocomplete="off"
        />
      </div>
      <div class="model-options" role="listbox" aria-label="Models">
        {#each filtered as model, index (model.id)}
          <button
            type="button"
            role="option"
            aria-selected={model.id === value}
            class:highlighted={index === activeIndex}
            onmouseenter={() => (activeIndex = index)}
            onclick={() => choose(model)}
          >
            <img src="/kiwi.svg" alt="" aria-hidden="true" />
            <span class="model-option-label">
              <strong>{model.name}</strong>
              {#if model.name !== model.id || model.ownedBy}<small
                  >{model.id}{model.ownedBy ? ` · ${model.ownedBy}` : ''}</small
                >{/if}
            </span>
            {#if model.id === value}<span class="model-check" aria-hidden="true">✓</span>{/if}
          </button>
        {:else}
          <p class="model-empty">No models found</p>
        {/each}
      </div>
    </div>
  {/if}
</div>
