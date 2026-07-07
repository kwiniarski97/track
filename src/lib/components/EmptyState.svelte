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
	class="relative flex flex-col items-center gap-3 overflow-hidden rounded-panel border border-border bg-surface px-6 py-14 text-center"
>
	<div
		class="pointer-events-none absolute inset-0"
		style="background: radial-gradient(60% 60% at 50% 0%, color-mix(in srgb, var(--color-accent) 8%, transparent), transparent 70%);"
	></div>
	<div
		class="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-surface-2 to-surface text-text-muted ring-1 ring-inset ring-border-strong"
	>
		<Icon size={26} />
	</div>
	<h2 class="relative text-base font-semibold text-text">{heading}</h2>
	<p class="relative max-w-sm text-sm text-text-muted">{body}</p>
	{#if cta}
		<a
			href={cta.href}
			class="sheen bg-gradient-accent relative mt-2 rounded-pill px-5 py-2.5 text-sm font-semibold text-accent-fg shadow-glow transition-transform hover:scale-[1.03]"
		>
			{cta.label}
		</a>
	{/if}
</div>
