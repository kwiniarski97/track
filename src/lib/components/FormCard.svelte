<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, children }: { title?: string; children: Snippet } = $props();
</script>

<section class="rounded-panel border border-border bg-surface p-5 sm:p-6">
	{#if title}
		<h2 class="mb-4 text-base font-semibold text-text">{title}</h2>
	{/if}
	{@render children()}
</section>
