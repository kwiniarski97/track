<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { m } from '$lib/paraglide/messages';
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

	const isEmpty = $derived(data.watching.length === 0 && data.planToWatch.length === 0);
</script>

<svelte:head><title>{m.app_name()}</title></svelte:head>

<div class="mb-8">
	<h1 class="text-2xl font-bold tracking-tight text-text sm:text-3xl">{m.app_name()}</h1>
	<p class="mt-1 text-sm text-text-muted">
		{m.home_signed_in_as({ name: data.user?.name ?? '', email: data.user?.email ?? '' })}
	</p>
</div>

{#if isEmpty}
	<EmptyState
		Icon={IconFilm}
		heading={m.home_empty_heading()}
		body={m.home_empty_body()}
		cta={{ label: m.home_empty_cta(), href: resolve('/search') }}
	/>
{:else}
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
