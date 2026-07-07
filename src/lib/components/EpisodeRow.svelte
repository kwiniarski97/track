<script lang="ts">
	import { checkPop } from '$lib/motion';
	import IconCheck from './icons/IconCheck.svelte';

	let {
		number,
		title,
		watched,
		unreleasedNote = null,
		onToggle
	}: {
		number: number;
		title: string;
		watched: boolean;
		// Set (to e.g. "Airs Mar 4, 2026") when the episode hasn't aired yet -- disables
		// the row instead of letting someone mark an episode watched before it exists.
		unreleasedNote?: string | null;
		onToggle: (watched: boolean) => void;
	} = $props();

	let checkEl = $state<HTMLElement>();

	$effect(() => {
		if (watched && checkEl) checkPop(checkEl);
	});
</script>

<button
	type="button"
	disabled={!!unreleasedNote}
	onclick={() => onToggle(!watched)}
	class="flex w-full items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border"
>
	<span class="min-w-0 flex-1 text-sm {watched ? 'text-text-muted line-through' : 'text-text'}">
		<span class="font-medium">E{number}</span> — {title}
		{#if unreleasedNote}
			<span class="mt-0.5 block text-xs text-text-faint no-underline">{unreleasedNote}</span>
		{/if}
	</span>
	<span
		class="flex h-6 w-6 flex-none items-center justify-center rounded-full border transition-colors {watched
			? 'bg-gradient-accent border-accent text-accent-fg shadow-glow'
			: 'border-border-strong text-transparent'}"
	>
		{#if watched}
			<span bind:this={checkEl} class="flex items-center justify-center">
				<IconCheck size={13} />
			</span>
		{/if}
	</span>
</button>
