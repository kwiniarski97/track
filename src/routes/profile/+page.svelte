<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { m } from '$lib/paraglide/messages';
	import PosterGrid from '$lib/components/PosterGrid.svelte';
	import PosterCard from '$lib/components/PosterCard.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import IconFilm from '$lib/components/icons/IconFilm.svelte';
	import type { CompletedItem } from './+page.server';

	let { data } = $props();

	function hrefFor(item: CompletedItem): ResolvedPathname {
		return item.mediaType === 'tv'
			? resolve('/show/[tmdbId]', { tmdbId: String(item.tmdbId) })
			: resolve('/movie/[tmdbId]', { tmdbId: String(item.tmdbId) });
	}

	// Renders as "3d 4h", "4h 12m", or "12m" -- whichever units are non-zero, coarsest first.
	function formatDuration(totalMinutes: number): string {
		const days = Math.floor(totalMinutes / (24 * 60));
		const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
		const minutes = totalMinutes % 60;
		const parts: string[] = [];
		if (days > 0) parts.push(`${days}d`);
		if (days > 0 || hours > 0) parts.push(`${hours}h`);
		parts.push(`${minutes}m`);
		return parts.join(' ');
	}

	const stats = $derived([
		{ label: m.profile_stat_time_watched(), value: formatDuration(data.stats.totalMinutes) },
		{ label: m.profile_stat_episodes_watched(), value: String(data.stats.episodesWatched) },
		{ label: m.profile_stat_movies_watched(), value: String(data.stats.moviesWatched) },
		{ label: m.profile_stat_shows_completed(), value: String(data.stats.showsCompleted) }
	]);

	const isEmpty = $derived(
		data.stats.episodesWatched === 0 &&
			data.stats.moviesWatched === 0 &&
			data.watchingShows.length === 0 &&
			data.completedShows.length === 0 &&
			data.droppedShows.length === 0 &&
			data.completedMovies.length === 0
	);
</script>

<svelte:head><title>{m.profile_title()} · {m.app_name()}</title></svelte:head>

<h1 class="mb-6 text-2xl font-bold tracking-tight text-text sm:text-3xl">{m.profile_title()}</h1>

{#if isEmpty}
	<EmptyState Icon={IconFilm} heading={m.profile_empty_heading()} body={m.profile_empty_body()} />
{:else}
	<div class="mb-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
		{#each stats as stat (stat.label)}
			<div class="rounded-panel border border-border bg-surface p-4 text-center sm:p-5">
				<p class="text-gradient-accent text-2xl font-bold tracking-tight sm:text-3xl">
					{stat.value}
				</p>
				<p class="mt-1 text-xs font-medium text-text-muted">{stat.label}</p>
			</div>
		{/each}
	</div>

	{#if data.watchingShows.length > 0}
		<section class="mb-10">
			<h2 class="mb-3 text-lg font-semibold text-text">{m.profile_watching_heading()}</h2>
			<PosterGrid>
				{#each data.watchingShows as item, i (item.mediaType + item.tmdbId)}
					<PosterCard href={hrefFor(item)} title={item.title} posterPath={item.posterPath} index={i} />
				{/each}
			</PosterGrid>
		</section>
	{/if}

	{#if data.completedShows.length > 0}
		<section class="mb-10">
			<h2 class="mb-3 text-lg font-semibold text-text">{m.profile_completed_heading()}</h2>
			<PosterGrid>
				{#each data.completedShows as item, i (item.mediaType + item.tmdbId)}
					<PosterCard href={hrefFor(item)} title={item.title} posterPath={item.posterPath} index={i} />
				{/each}
			</PosterGrid>
		</section>
	{/if}

	{#if data.droppedShows.length > 0}
		<section class="mb-10">
			<h2 class="mb-3 text-lg font-semibold text-text">{m.profile_dropped_heading()}</h2>
			<PosterGrid>
				{#each data.droppedShows as item, i (item.mediaType + item.tmdbId)}
					<PosterCard href={hrefFor(item)} title={item.title} posterPath={item.posterPath} index={i} />
				{/each}
			</PosterGrid>
		</section>
	{/if}

	{#if data.completedMovies.length > 0}
		<section class="mb-10">
			<h2 class="mb-3 text-lg font-semibold text-text">{m.profile_completed_movies_heading()}</h2>
			<PosterGrid>
				{#each data.completedMovies as item, i (item.mediaType + item.tmdbId)}
					<PosterCard href={hrefFor(item)} title={item.title} posterPath={item.posterPath} index={i} />
				{/each}
			</PosterGrid>
		</section>
	{/if}
{/if}
