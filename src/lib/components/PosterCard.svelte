<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { tmdbPosterUrl } from '$lib/tmdb-client';
	import { reveal } from '$lib/motion';
	import IconCheck from './icons/IconCheck.svelte';

	let {
		href,
		title,
		posterPath,
		subtitle = null,
		watched = false,
		index = 0
	}: {
		href: ResolvedPathname;
		title: string;
		posterPath: string | null;
		subtitle?: string | null;
		watched?: boolean;
		index?: number;
	} = $props();

	const poster = $derived(tmdbPosterUrl(posterPath));
</script>

<a {href} use:reveal={{ index }} class="group block">
	<div
		class="relative aspect-[2/3] overflow-hidden rounded-card bg-surface shadow-card transition-transform duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-elevated"
	>
		{#if poster}
			<img
				src={poster}
				alt=""
				loading="lazy"
				class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
			/>
		{:else}
			<div
				class="flex h-full w-full items-center justify-center px-2 text-center text-xs text-text-faint"
			>
				{title}
			</div>
		{/if}
		{#if watched}
			<span
				class="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-accent-fg shadow-elevated"
			>
				<IconCheck size={14} />
			</span>
		{/if}
	</div>
	<p class="mt-2 line-clamp-2 text-sm font-medium text-text">{title}</p>
	{#if subtitle}
		<p class="text-xs text-text-muted">{subtitle}</p>
	{/if}
</a>
