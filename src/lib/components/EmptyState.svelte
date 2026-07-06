<script lang="ts">
	import type { Component } from 'svelte';
	import type { ResolvedPathname } from '$app/types';

	let {
		Icon,
		heading,
		body,
		cta
	}: {
		Icon: Component<{ size?: number; class?: string }>;
		heading: string;
		body: string;
		cta?: { label: string; href: ResolvedPathname };
	} = $props();
</script>

<div
	class="flex flex-col items-center gap-3 rounded-panel border border-border bg-surface px-6 py-14 text-center"
>
	<div class="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 text-text-muted">
		<Icon size={26} />
	</div>
	<h2 class="text-base font-semibold text-text">{heading}</h2>
	<p class="max-w-sm text-sm text-text-muted">{body}</p>
	{#if cta}
		<a
			href={cta.href}
			class="mt-2 rounded-pill bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition-transform hover:scale-[1.03]"
		>
			{cta.label}
		</a>
	{/if}
</div>
