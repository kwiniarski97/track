<script lang="ts">
	import { checkPop } from '$lib/motion';
	import IconCheck from './icons/IconCheck.svelte';

	let {
		number,
		title,
		watched,
		onToggle
	}: {
		number: number;
		title: string;
		watched: boolean;
		onToggle: (watched: boolean) => void;
	} = $props();

	let checkEl = $state<HTMLElement>();

	$effect(() => {
		if (watched && checkEl) checkPop(checkEl);
	});
</script>

<button
	type="button"
	onclick={() => onToggle(!watched)}
	class="flex w-full items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-border-strong"
>
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
	<span class="flex-1 text-sm {watched ? 'text-text-muted line-through' : 'text-text'}">
		<span class="font-medium">E{number}</span> — {title}
	</span>
</button>
