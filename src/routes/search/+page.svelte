<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import PosterGrid from '$lib/components/PosterGrid.svelte';
	import PosterCard from '$lib/components/PosterCard.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import IconSearch from '$lib/components/icons/IconSearch.svelte';

	let { data } = $props();
</script>

<svelte:head><title>{m.search_title()} · {m.app_name()}</title></svelte:head>

<h1 class="mb-5 text-2xl font-bold tracking-tight text-text sm:text-3xl">{m.search_title()}</h1>

<form method="GET" class="mb-8 flex gap-2">
	<div class="relative flex-1">
		<span class="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-text-faint">
			<IconSearch size={18} />
		</span>
		<input
			type="search"
			name="q"
			value={data.query}
			placeholder={m.search_placeholder()}
			class="w-full rounded-pill border border-border bg-surface py-3 pr-4 pl-10 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
		/>
	</div>
	<button
		type="submit"
		class="rounded-pill bg-accent px-5 py-3 text-sm font-semibold text-accent-fg transition-transform hover:scale-[1.03]"
	>
		{m.search_button()}
	</button>
</form>

{#if data.query.length === 0}
	<EmptyState Icon={IconSearch} heading={m.search_start_heading()} body={m.search_start_body()} />
{:else if data.results.length === 0}
	<EmptyState Icon={IconSearch} heading={m.search_empty_heading()} body={m.search_empty_body()} />
{:else}
	<PosterGrid>
		{#each data.results as result, i (result.mediaType + result.tmdbId)}
			<PosterCard
				href={result.mediaType === 'tv'
					? resolve('/show/[tmdbId]', { tmdbId: String(result.tmdbId) })
					: resolve('/movie/[tmdbId]', { tmdbId: String(result.tmdbId) })}
				title={result.title}
				posterPath={result.posterPath}
				subtitle={`${result.mediaType === 'tv' ? m.media_type_tv() : m.media_type_movie()}${result.date ? ` · ${result.date.slice(0, 4)}` : ''}`}
				index={i}
			/>
		{/each}
	</PosterGrid>
{/if}
