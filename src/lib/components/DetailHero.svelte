<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { ResolvedPathname } from '$app/types';
	import { tmdbBackdropUrl, tmdbPosterUrl } from '$lib/tmdb-client';
	import IconChevronLeft from './icons/IconChevronLeft.svelte';

	let {
		backdropPath,
		posterPath,
		title,
		overview,
		meta = null,
		backHref,
		backLabel,
		children
	}: {
		backdropPath: string | null;
		posterPath: string | null;
		title: string;
		overview: string;
		meta?: string | null;
		backHref: ResolvedPathname;
		backLabel: string;
		children?: Snippet;
	} = $props();

	const backdrop = $derived(tmdbBackdropUrl(backdropPath));
	const poster = $derived(tmdbPosterUrl(posterPath, 'w500'));
</script>

<div class="relative -mx-4 -mt-6 overflow-hidden rounded-b-panel md:-mx-6 md:-mt-10">
	<div class="relative aspect-video w-full sm:aspect-[21/9]">
		{#if backdrop}
			<img src={backdrop} alt="" class="h-full w-full object-cover" />
		{:else}
			<div class="h-full w-full bg-surface"></div>
		{/if}
		<div class="absolute inset-0 bg-gradient-to-t from-bg via-bg/70 to-transparent"></div>
		<div class="absolute inset-0 bg-gradient-to-r from-bg/80 via-transparent to-transparent"></div>
	</div>

	<a
		href={backHref}
		class="glass absolute top-4 left-4 z-10 flex items-center gap-1 rounded-pill px-3 py-1.5 text-sm font-medium text-text md:top-6 md:left-6"
	>
		<IconChevronLeft size={16} />
		{backLabel}
	</a>

	<div class="relative z-10 -mt-16 flex gap-4 px-4 pb-4 sm:-mt-24 sm:gap-6 md:px-6">
		{#if poster}
			<img
				src={poster}
				alt=""
				class="hidden w-28 flex-none rounded-card shadow-elevated sm:block sm:w-40"
			/>
		{/if}
		<div class="flex flex-1 flex-col justify-end gap-2 pb-1">
			<h1 class="text-2xl font-bold tracking-tight text-text sm:text-3xl">{title}</h1>
			{#if meta}
				<p class="text-sm text-text-muted">{meta}</p>
			{/if}
		</div>
	</div>
</div>

<p class="mt-5 max-w-3xl text-sm leading-relaxed text-text-muted">{overview}</p>

{#if children}
	<div class="mt-5">
		{@render children()}
	</div>
{/if}
