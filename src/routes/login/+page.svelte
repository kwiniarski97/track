<script lang="ts">
	import { m } from '$lib/paraglide/messages';
</script>

<svelte:head><title>{m.app_name()}</title></svelte:head>

<div class="relative flex min-h-dvh items-center justify-center overflow-hidden bg-bg px-6">
	<div
		class="pointer-events-none absolute inset-0"
		style="background: radial-gradient(60% 50% at 50% 20%, color-mix(in srgb, var(--color-accent) 18%, transparent), transparent 70%);"
	></div>

	<div class="relative z-10 flex flex-col items-center gap-6 text-center">
		<h1 class="text-4xl font-bold tracking-tight text-text sm:text-5xl">{m.app_name()}</h1>
		<p class="max-w-sm text-balance text-base text-text-muted">{m.login_tagline()}</p>
		<form method="POST">
			<button
				type="submit"
				class="rounded-pill bg-accent px-7 py-3.5 text-sm font-semibold text-accent-fg shadow-glow transition-transform hover:scale-[1.04]"
			>
				{m.login_with_pocket_id()}
			</button>
		</form>
	</div>
</div>
