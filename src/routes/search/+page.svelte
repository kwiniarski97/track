<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import PosterGrid from '$lib/components/PosterGrid.svelte';
	import PosterCard from '$lib/components/PosterCard.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import IconSearch from '$lib/components/icons/IconSearch.svelte';
	import IconChevronLeft from '$lib/components/icons/IconChevronLeft.svelte';

	let { data } = $props();

	function pageHref(pageNum: number): string {
		const params = new URLSearchParams();
		if (data.query) params.set('q', data.query);
		if (data.type !== 'tv') params.set('type', data.type);
		if (data.year) params.set('year', String(data.year));
		if (data.sort !== 'relevance') params.set('sort', data.sort);
		if (pageNum > 1) params.set('page', String(pageNum));
		const qs = params.toString();
		return qs ? `${resolve('/search')}?${qs}` : resolve('/search');
	}

	function pageNumbers(current: number, total: number): Array<number | 'ellipsis'> {
		const keep = new Set(
			[1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total)
		);
		const sorted = [...keep].sort((a, b) => a - b);
		const out: Array<number | 'ellipsis'> = [];
		let previous = 0;
		for (const p of sorted) {
			if (previous && p - previous > 1) out.push('ellipsis');
			out.push(p);
			previous = p;
		}
		return out;
	}
</script>

<svelte:head><title>{m.search_title()} · {m.app_name()}</title></svelte:head>

<h1 class="mb-5 text-2xl font-bold tracking-tight text-text sm:text-3xl">{m.search_title()}</h1>

<form method="GET" class="mb-8 flex flex-wrap gap-2">
	<div class="relative min-w-0 flex-1">
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
	<select
		name="type"
		value={data.type}
		onchange={(e) => e.currentTarget.form?.requestSubmit()}
		aria-label={m.search_type_label()}
		class="rounded-pill border border-border bg-surface px-4 py-3 text-sm text-text focus:border-accent focus:outline-none"
	>
		<option value="tv">{m.search_type_tv()}</option>
		<option value="movie">{m.search_type_movie()}</option>
	</select>
	<input
		type="number"
		name="year"
		inputmode="numeric"
		value={data.year ?? ''}
		placeholder={m.search_year_placeholder()}
		aria-label={m.search_year_placeholder()}
		min="1900"
		max={new Date().getFullYear() + 5}
		class="w-24 rounded-pill border border-border bg-surface px-4 py-3 text-sm text-text placeholder:text-text-faint focus:border-accent focus:outline-none"
	/>
	<select
		name="sort"
		value={data.sort}
		onchange={(e) => e.currentTarget.form?.requestSubmit()}
		aria-label={m.search_sort_label()}
		class="rounded-pill border border-border bg-surface px-4 py-3 text-sm text-text focus:border-accent focus:outline-none"
	>
		<option value="relevance">{m.search_sort_relevance()}</option>
		<option value="popularity">{m.search_sort_popularity()}</option>
		<option value="rating">{m.search_sort_rating()}</option>
		<option value="newest">{m.search_sort_newest()}</option>
		<option value="title">{m.search_sort_title()}</option>
	</select>
	<button
		type="submit"
		class="sheen bg-gradient-accent rounded-pill px-5 py-3 text-sm font-semibold text-accent-fg shadow-glow transition-transform hover:scale-[1.03]"
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

	{#if data.totalPages > 1}
		<nav class="mt-8 flex items-center justify-center gap-1.5">
			<a
				href={pageHref(data.page - 1)}
				aria-label={m.search_page_previous()}
				aria-disabled={data.page <= 1}
				class="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text {data.page <=
				1
					? 'pointer-events-none opacity-40'
					: ''}"
			>
				<IconChevronLeft size={16} />
			</a>
			{#each pageNumbers(data.page, data.totalPages) as p (p)}
				{#if p === 'ellipsis'}
					<span class="px-1 text-sm text-text-faint">…</span>
				{:else}
					<a
						href={pageHref(p)}
						aria-current={p === data.page ? 'page' : undefined}
						class="flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors {p ===
						data.page
							? 'bg-gradient-accent text-accent-fg shadow-glow'
							: 'text-text-muted hover:bg-surface-2 hover:text-text'}"
					>
						{p}
					</a>
				{/if}
			{/each}
			<a
				href={pageHref(data.page + 1)}
				aria-label={m.search_page_next()}
				aria-disabled={data.page >= data.totalPages}
				class="flex h-9 w-9 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-2 hover:text-text {data.page >=
				data.totalPages
					? 'pointer-events-none opacity-40'
					: ''}"
			>
				<IconChevronLeft size={16} class="rotate-180" />
			</a>
		</nav>
	{/if}
{/if}
