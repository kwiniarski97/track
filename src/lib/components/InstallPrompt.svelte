<script lang="ts">
	import { onMount } from 'svelte';
	import { fly } from 'svelte/transition';
	import { m } from '$lib/paraglide/messages';
	import { reducedMotion } from '$lib/motion';
	import {
		type BeforeInstallPromptEvent,
		dismissInstallPrompt,
		isDismissed,
		isIosSafari,
		isMobile,
		isStandalone
	} from '$lib/client/install-prompt';
	import IconDownload from './icons/IconDownload.svelte';
	import IconShare from './icons/IconShare.svelte';
	import IconX from './icons/IconX.svelte';

	let variant = $state<'android' | 'ios' | null>(null);
	let deferredPrompt: BeforeInstallPromptEvent | null = null;

	onMount(() => {
		if (isStandalone() || isDismissed() || !isMobile()) return;

		// iOS never fires beforeinstallprompt -- the only path is manual Share sheet
		// instructions, shown immediately rather than waiting for an event that won't come.
		if (isIosSafari()) {
			variant = 'ios';
			return;
		}

		const onBeforeInstallPrompt = (event: Event) => {
			event.preventDefault();
			deferredPrompt = event as BeforeInstallPromptEvent;
			variant = 'android';
		};
		window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
		return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
	});

	function close() {
		dismissInstallPrompt();
		variant = null;
	}

	async function install() {
		if (!deferredPrompt) return;
		await deferredPrompt.prompt();
		await deferredPrompt.userChoice;
		deferredPrompt = null;
		dismissInstallPrompt();
		variant = null;
	}
</script>

{#if variant}
	<div
		transition:fly={{ y: 24, duration: reducedMotion() ? 0 : 220 }}
		data-testid="install-prompt"
		class="glass fixed inset-x-3 z-30 flex items-center gap-3 rounded-panel border border-border p-3 shadow-elevated md:hidden"
		style="bottom: calc(4.5rem + env(safe-area-inset-bottom));"
	>
		<div
			class="bg-gradient-accent flex h-10 w-10 shrink-0 items-center justify-center rounded-card text-accent-fg"
		>
			{#if variant === 'android'}
				<IconDownload size={18} />
			{:else}
				<IconShare size={18} />
			{/if}
		</div>

		<p class="min-w-0 flex-1 text-sm text-text-muted">
			{variant === 'android' ? m.install_prompt_android_body() : m.install_prompt_ios_body()}
		</p>

		{#if variant === 'android'}
			<button
				type="button"
				onclick={install}
				class="bg-gradient-accent shrink-0 rounded-pill px-3 py-1.5 text-sm font-medium text-accent-fg"
			>
				{m.install_prompt_install_button()}
			</button>
		{/if}

		<button
			type="button"
			onclick={close}
			aria-label={m.install_prompt_dismiss()}
			class="shrink-0 rounded-pill p-1.5 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
		>
			<IconX size={16} />
		</button>
	</div>
{/if}
