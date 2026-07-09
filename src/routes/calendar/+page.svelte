<script lang="ts">
	import { resolve } from '$app/paths';
	import { navigating } from '$app/state';
	import { getLocale } from '$lib/paraglide/runtime';
	import { m } from '$lib/paraglide/messages';
	import { tmdbPosterUrl } from '$lib/tmdb-client';
	import { reveal } from '$lib/motion';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import IconCalendar from '$lib/components/icons/IconCalendar.svelte';
	import type { CalendarEntry } from './+page.server';

	let { data } = $props();

	const dateFormatter = new Intl.DateTimeFormat(getLocale(), {
		day: 'numeric',
		month: 'long',
		year: 'numeric'
	});

	function formatDate(isoDate: string): string {
		// new Date('YYYY-MM-DD') parses as UTC midnight; format in UTC too so the
		// displayed date doesn't shift a day off in timezones behind UTC.
		return dateFormatter.format(new Date(`${isoDate}T00:00:00Z`));
	}

	const MS_PER_DAY = 24 * 60 * 60 * 1000;
	const today = new Date().toISOString().slice(0, 10);

	// Both sides parsed as UTC midnight, so this is a whole-day count unaffected by the
	// viewer's own timezone. Entries are always today-or-later (the cache only keeps
	// upcoming dates), so this is never negative.
	function daysUntil(isoDate: string): number {
		return Math.round(
			(new Date(`${isoDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
				MS_PER_DAY
		);
	}

	function dayCountFor(isoDate: string): string | null {
		const days = daysUntil(isoDate);
		return days <= 30 ? m.calendar_in_days({ days }) : null;
	}

	// Built here rather than cached, so it always renders in the viewer's current
	// locale instead of whatever locale happened to be active when the cron job ran.
	function detailFor(entry: CalendarEntry): string {
		return entry.mediaType === 'tv'
			? `S${entry.seasonNumber}E${entry.episodeNumber} — ${entry.episodeName}`
			: m.calendar_release_label();
	}

	interface DateGroup {
		date: string;
		entries: CalendarEntry[];
	}

	// Entries arrive pre-sorted by date, so matching entries always land in the
	// most-recently-pushed group -- no need for a map keyed by date.
	function groupByDate(entries: CalendarEntry[]): DateGroup[] {
		const groups: DateGroup[] = [];
		for (const entry of entries) {
			const last = groups.at(-1);
			if (last && last.date === entry.date) last.entries.push(entry);
			else groups.push({ date: entry.date, entries: [entry] });
		}
		return groups;
	}

	const groups = $derived(groupByDate(data.entries));
</script>

<svelte:head><title>{m.calendar_title()} · {m.app_name()}</title></svelte:head>

<h1 class="mb-6 text-2xl font-bold tracking-tight text-text sm:text-3xl">{m.calendar_title()}</h1>

{#if data.entries.length === 0}
	<EmptyState Icon={IconCalendar} heading={m.calendar_title()} body={m.calendar_empty()} />
{:else}
	<div class="flex flex-col gap-8">
		{#each groups as { date, entries }, gi (date)}
			{@const dayCount = dayCountFor(date)}
			<section>
				<h2
					class="sticky top-0 z-10 -mx-4 mb-3 bg-bg/95 px-4 py-2 text-sm font-semibold text-text-muted backdrop-blur-sm md:top-14 md:-mx-6 md:px-6"
				>
					{formatDate(date)}
					{#if dayCount}
						<span class="font-normal text-text-faint">· {dayCount}</span>
					{/if}
				</h2>
				<div class="flex flex-col gap-2">
					{#each entries as entry, i (entry.mediaType + entry.tmdbId + entry.date)}
						{@const poster = tmdbPosterUrl(entry.posterPath)}
						{@const entryHref =
							entry.mediaType === 'tv'
								? resolve('/show/[tmdbId]', { tmdbId: String(entry.tmdbId) })
								: resolve('/movie/[tmdbId]', { tmdbId: String(entry.tmdbId) })}
						<a
							use:reveal={{ index: gi * 3 + i }}
							href={entryHref}
							class="group flex items-center gap-3 rounded-card border border-border bg-surface p-3 transition-colors hover:border-border-strong"
						>
							<div
								class="sheen relative h-16 w-11 flex-none overflow-hidden rounded-md {navigating.to
									?.url.pathname === entryHref
									? 'shimmer-loading'
									: ''}"
							>
								{#if poster}
									<img
										src={poster}
										alt=""
										loading="lazy"
										class="h-16 w-11 rounded-md object-cover"
									/>
								{:else}
									<div class="h-16 w-11 rounded-md bg-surface-2"></div>
								{/if}
							</div>
							<div class="min-w-0">
								<p class="truncate text-sm font-medium text-text">{entry.title}</p>
								<p class="text-xs text-text-muted">{detailFor(entry)}</p>
							</div>
						</a>
					{/each}
				</div>
			</section>
		{/each}
	</div>
{/if}
