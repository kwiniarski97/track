<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import IconStar from './icons/IconStar.svelte';

	let { voteAverage, voteCount }: { voteAverage: number; voteCount: number } = $props();

	// TMDB's own site treats sub-10-vote titles as "not enough ratings yet" and hides the
	// score rather than showing a potentially wild swing from one or two votes.
	const MIN_VOTES_FOR_SCORE = 10;
	const score = $derived(voteCount >= MIN_VOTES_FOR_SCORE ? Math.round(voteAverage * 10) : null);

	function scoreColor(value: number): string {
		if (value >= 70) return 'text-success';
		if (value >= 40) return 'text-warning';
		return 'text-danger';
	}
</script>

{#if score !== null}
	<span
		title={m.audience_score_label()}
		class="flex items-center gap-1 rounded-pill bg-surface-2 px-3 py-1.5 text-xs font-medium {scoreColor(
			score
		)}"
	>
		<IconStar size={13} />
		{score}%
	</span>
{/if}
