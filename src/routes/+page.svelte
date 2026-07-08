<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { m } from '$lib/paraglide/messages';
	import { tmdbPosterUrl } from '$lib/tmdb-client';
	import PosterGrid from '$lib/components/PosterGrid.svelte';
	import PosterCard from '$lib/components/PosterCard.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import IconFilm from '$lib/components/icons/IconFilm.svelte';
	import type { TrackedItem } from './+page.server';

	let { data } = $props();

	function hrefFor(item: TrackedItem): ResolvedPathname {
		return item.mediaType === 'tv'
			? resolve('/show/[tmdbId]', { tmdbId: String(item.tmdbId) })
			: resolve('/movie/[tmdbId]', { tmdbId: String(item.tmdbId) });
	}

	const isEmpty = $derived(
		data.watchNext.length === 0 &&
			data.watching.length === 0 &&
			data.notWatchedForAWhile.length === 0 &&
			data.upToDate.length === 0 &&
			data.planToWatch.length === 0 &&
			data.recentlyWatched.length === 0
	);
	// A blurred backdrop of the user's own posters, most-recently-tracked first --
	// gives the dashboard a personal, cinematic feel instead of a flat header.
	const heroPosters = $derived(
		[
			...data.watchNext,
			...data.watching,
			...data.notWatchedForAWhile,
			...data.upToDate,
			...data.planToWatch
		]
			.map((item) => tmdbPosterUrl(item.posterPath, 'w342'))
			.filter((url) => url !== null)
			.slice(0, 10)
	);
</script>

<svelte:head><title>{m.app_name()}</title></svelte:head>

{#if heroPosters.length > 0}
	<div class="relative -mx-4 -mt-6 mb-8 overflow-hidden md:-mx-6 md:-mt-10">
		<div class="relative flex h-36 sm:h-48">
			{#each heroPosters as poster (poster)}
				<img
					src={poster}
					alt=""
					class="h-full flex-1 scale-110 object-cover opacity-50 blur-[2px] saturate-125"
				/>
			{/each}
		</div>
		<div class="absolute inset-0 bg-gradient-to-t from-bg via-bg/85 to-bg/10"></div>
		<div
			class="pointer-events-none absolute inset-0"
			style="background: radial-gradient(60% 90% at 10% 100%, color-mix(in srgb, var(--color-accent) 16%, transparent), transparent 70%);"
		></div>
		<div class="relative z-10 -mt-8 px-4 pb-5 md:px-6">
			<h1 class="text-gradient-accent text-2xl font-bold tracking-tight sm:text-3xl">
				{m.app_name()}
			</h1>
			<p class="mt-1 text-sm text-text-muted">
				{m.home_signed_in_as({ name: data.user?.name ?? '', email: data.user?.email ?? '' })}
			</p>
		</div>
	</div>
{:else}
	<div class="mb-8">
		<h1 class="text-2xl font-bold tracking-tight text-text sm:text-3xl">{m.app_name()}</h1>
		<p class="mt-1 text-sm text-text-muted">
			{m.home_signed_in_as({ name: data.user?.name ?? '', email: data.user?.email ?? '' })}
		</p>
	</div>
{/if}

{#if isEmpty}
	<EmptyState
		Icon={IconFilm}
		heading={m.home_empty_heading()}
		body={m.home_empty_body()}
		cta={{ label: m.home_empty_cta(), href: resolve('/search') }}
	/>
{:else}
	{#if data.recentlyWatched.length > 0}
		<section class="mb-10">
			<h2 class="mb-3 text-lg font-semibold text-text">{m.home_recently_watched_heading()}</h2>
			<PosterGrid>
				{#each data.recentlyWatched as item, i (item.mediaType + item.tmdbId)}
					<PosterCard
						href={hrefFor(item)}
						title={item.title}
						posterPath={item.posterPath}
						index={i}
					/>
				{/each}
			</PosterGrid>
		</section>
	{/if}

	{#if data.watchNext.length > 0}
		<section class="mb-10">
			<h2 class="mb-3 text-lg font-semibold text-text">{m.home_watch_next_heading()}</h2>
			<PosterGrid>
				{#each data.watchNext as item, i (item.mediaType + item.tmdbId)}
					<PosterCard
						href={hrefFor(item)}
						title={item.title}
						posterPath={item.posterPath}
						badge={m.home_new_episode_badge()}
						index={i}
					/>
				{/each}
			</PosterGrid>
		</section>
	{/if}

	{#if data.watching.length > 0}
		<section class="mb-10">
			<h2 class="mb-3 text-lg font-semibold text-text">{m.home_watching_heading()}</h2>
			<PosterGrid>
				{#each data.watching as item, i (item.mediaType + item.tmdbId)}
					<PosterCard
						href={hrefFor(item)}
						title={item.title}
						posterPath={item.posterPath}
						index={i}
					/>
				{/each}
			</PosterGrid>
		</section>
	{/if}

	{#if data.notWatchedForAWhile.length > 0}
		<section class="mb-10">
			<h2 class="mb-3 text-lg font-semibold text-text">
				{m.home_not_watched_for_a_while_heading()}
			</h2>
			<PosterGrid>
				{#each data.notWatchedForAWhile as item, i (item.mediaType + item.tmdbId)}
					<PosterCard
						href={hrefFor(item)}
						title={item.title}
						posterPath={item.posterPath}
						index={i}
					/>
				{/each}
			</PosterGrid>
		</section>
	{/if}

	{#if data.upToDate.length > 0}
		<section class="mb-10">
			<h2 class="mb-3 text-lg font-semibold text-text">{m.home_up_to_date_heading()}</h2>
			<PosterGrid>
				{#each data.upToDate as item, i (item.mediaType + item.tmdbId)}
					<PosterCard
						href={hrefFor(item)}
						title={item.title}
						posterPath={item.posterPath}
						index={i}
					/>
				{/each}
			</PosterGrid>
		</section>
	{/if}

	{#if data.planToWatch.length > 0}
		<section class="mb-10">
			<h2 class="mb-3 text-lg font-semibold text-text">{m.home_plan_to_watch_heading()}</h2>
			<PosterGrid>
				{#each data.planToWatch as item, i (item.mediaType + item.tmdbId)}
					<PosterCard
						href={hrefFor(item)}
						title={item.title}
						posterPath={item.posterPath}
						index={i}
					/>
				{/each}
			</PosterGrid>
		</section>
	{/if}
{/if}
