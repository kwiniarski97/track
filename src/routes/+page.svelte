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

	// The four watching categories ride along on each card instead of splitting the list
	// into four one-poster sections. Only the urgent one gets the loud accent badge; the
	// rest stay quiet, and the progress bar already colours caught-up vs behind.
	function badgeFor(item: TrackedItem): string | null {
		return item.category === 'watch_next' ? m.home_new_episode_badge() : null;
	}

	function subtitleFor(item: TrackedItem): string | null {
		if (item.category === 'not_watched_for_a_while') return m.home_stale_subtitle();
		if (item.category === 'up_to_date') return m.home_up_to_date_subtitle();
		return null;
	}

	const sections = $derived([
		{ heading: m.home_continue_watching_heading(), items: data.continueWatching, active: true },
		{ heading: m.home_to_watch_heading(), items: data.toWatch, active: false }
	]);

	const isEmpty = $derived(data.continueWatching.length === 0 && data.toWatch.length === 0);

	// A blurred backdrop of the user's own posters -- gives the dashboard a personal,
	// cinematic feel instead of a flat header.
	const heroPosters = $derived(
		[...data.continueWatching, ...data.toWatch]
			.map((item) => tmdbPosterUrl(item.posterPath, 'w185'))
			.filter((url) => url !== null)
			.slice(0, 10)
	);

	// The headline answers the only question this page exists to answer, so it says what
	// is waiting rather than repeating the app's own name (already in the nav above it).
	const headline = $derived(
		data.newEpisodeCount > 0
			? m.home_new_episodes_count({ count: data.newEpisodeCount })
			: m.home_all_caught_up()
	);
</script>

<svelte:head><title>{m.app_name()}</title></svelte:head>

{#if heroPosters.length > 0}
	<div class="relative -mx-4 -mt-6 mb-8 overflow-hidden md:-mx-6 md:-mt-10">
		<div class="relative flex h-32 sm:h-40">
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
				{headline}
			</h1>
		</div>
	</div>
{:else}
	<div class="mb-8">
		<h1 class="text-2xl font-bold tracking-tight text-text sm:text-3xl">{headline}</h1>
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
	{#each sections as section (section.heading)}
		{#if section.items.length > 0}
			<section class="mb-10">
				<h2 class="mb-3 text-lg font-semibold text-text">{section.heading}</h2>
				<PosterGrid>
					{#each section.items as item, i (item.mediaType + item.tmdbId)}
						<PosterCard
							href={hrefFor(item)}
							title={item.title}
							posterPath={item.posterPath}
							badge={section.active ? badgeFor(item) : null}
							subtitle={section.active ? subtitleFor(item) : null}
							progress={item.progress}
							index={i}
						/>
					{/each}
				</PosterGrid>
			</section>
		{/if}
	{/each}
{/if}
