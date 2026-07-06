<script lang="ts">
	import { enhance } from '$app/forms';
	import { pulse } from '$lib/motion';
	import IconCheck from './icons/IconCheck.svelte';
	import IconPlus from './icons/IconPlus.svelte';

	let {
		trackingStatus,
		trackLabel,
		trackingLabel,
		stopLabel
	}: {
		trackingStatus: string | null;
		trackLabel: string;
		trackingLabel: string;
		stopLabel: string;
	} = $props();

	let buttonEl = $state<HTMLButtonElement>();
	let pending = $state(false);

	function submitEnhance() {
		pending = true;
		return async ({ update }: { update: (opts?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			pending = false;
			if (buttonEl) pulse(buttonEl);
		};
	}
</script>

<div class="flex flex-wrap items-center gap-2">
	{#if trackingStatus}
		<span
			class="flex items-center gap-1.5 rounded-pill bg-surface-2 px-4 py-2 text-sm font-medium text-text"
		>
			<IconCheck size={15} class="text-accent" />
			{trackingLabel}
		</span>
		<form method="POST" action="?/untrack" use:enhance={submitEnhance}>
			<button
				bind:this={buttonEl}
				type="submit"
				disabled={pending}
				class="rounded-pill border border-border px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-60"
			>
				{stopLabel}
			</button>
		</form>
	{:else}
		<form method="POST" action="?/track" use:enhance={submitEnhance}>
			<button
				bind:this={buttonEl}
				type="submit"
				disabled={pending}
				class="flex items-center gap-1.5 rounded-pill bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg shadow-glow transition-transform hover:scale-[1.03] disabled:opacity-70"
			>
				<IconPlus size={15} />
				{trackLabel}
			</button>
		</form>
	{/if}
</div>
