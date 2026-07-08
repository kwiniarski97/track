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
		badge = null,
		progress = null,
		index = 0
	}: {
		href: ResolvedPathname;
		title: string;
		posterPath: string | null;
		subtitle?: string | null;
		watched?: boolean;
		badge?: string | null;
		progress?: {
			watched: number;
			total: number;
			state: 'completed' | 'up_to_date' | 'behind';
		} | null;
		index?: number;
	} = $props();

	const poster = $derived(tmdbPosterUrl(posterPath));
	const progressPercent = $derived(
		progress ? Math.max(4, Math.min(100, (progress.watched / progress.total) * 100)) : 0
	);
	const progressColorClass = $derived(
		progress?.state === 'completed'
			? 'bg-rainbow-sweep'
			: progress?.state === 'up_to_date'
				? 'bg-success'
				: 'bg-warning'
	);
</script>

<a {href} use:reveal={{ index }} class="group block">
	<div
		class="sheen relative aspect-[2/3] overflow-hidden rounded-card bg-surface shadow-card ring-1 ring-white/5 transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-glow-lg group-hover:ring-accent/30"
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
		<div
			class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent"
		></div>
		{#if watched}
			<span
				class="bg-gradient-accent absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full text-accent-fg shadow-elevated"
			>
				<IconCheck size={14} />
			</span>
		{/if}
		{#if badge}
			<span
				class="bg-gradient-accent absolute top-2 left-2 rounded-pill px-2 py-0.5 text-[10px] font-semibold tracking-wide text-accent-fg uppercase shadow-elevated"
			>
				{badge}
			</span>
		{/if}
		{#if progress}
			<div
				class="absolute inset-x-0 bottom-0 h-1 bg-black/40"
				title={`${progress.watched}/${progress.total}`}
			>
				<div class={`h-full ${progressColorClass}`} style={`width: ${progressPercent}%`}></div>
			</div>
		{/if}
	</div>
	<p class="mt-2 line-clamp-2 text-sm font-medium text-text">{title}</p>
	{#if subtitle}
		<p class="text-xs text-text-muted">{subtitle}</p>
	{/if}
</a>
