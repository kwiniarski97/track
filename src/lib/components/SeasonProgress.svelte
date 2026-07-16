<script lang="ts">
	import { m } from '$lib/paraglide/messages';

	let {
		watched,
		total
	}: {
		/** Episodes watched out of the season's *released* episodes. */
		watched: number;
		/** Released episodes only -- matches what "mark season watched" acts on, so a
		 * filled bar and a filled season circle always agree for a still-airing season. */
		total: number;
	} = $props();

	const complete = $derived(total > 0 && watched >= total);
	const percent = $derived(total === 0 ? 0 : Math.round((watched / total) * 100));
</script>

<span
	class="flex flex-none items-center gap-2"
	aria-label={m.season_progress_label({ watched, total })}
>
	<span
		class="h-1 w-14 overflow-hidden rounded-pill bg-surface-2 sm:w-20"
		role="progressbar"
		aria-valuenow={watched}
		aria-valuemin={0}
		aria-valuemax={total}
	>
		<span
			class="block h-full rounded-pill transition-[width] duration-300 ease-out {complete
				? 'bg-gradient-accent'
				: 'bg-accent/70'}"
			style="width: {percent}%"
		></span>
	</span>
	<span class="text-xs tabular-nums {complete ? 'text-text-muted' : 'text-text-faint'}">
		{m.season_progress_count({ watched, total })}
	</span>
</span>
