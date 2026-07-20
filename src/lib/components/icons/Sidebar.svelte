<script lang="ts">
  let { className = 'icon-20', strokeWidth = '1.5' } = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  fill="none"
  viewBox="0 0 24 24"
  stroke-width={strokeWidth}
  stroke="currentColor"
  class={className}
  aria-hidden="true"
>
  <rect
    x="3"
    y="3"
    width="18"
    height="18"
    rx="5"
    ry="5"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path d="M9.5 21V3" stroke-linecap="round" stroke-linejoin="round" />
</svg>
