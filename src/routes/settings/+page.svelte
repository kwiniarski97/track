<script lang="ts">
	import { resolve } from '$app/paths';
	import { m } from '$lib/paraglide/messages';
	import FormCard from '$lib/components/FormCard.svelte';
	import IconChevronLeft from '$lib/components/icons/IconChevronLeft.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>{m.settings_title()} · {m.app_name()}</title></svelte:head>

<h1 class="mb-6 text-2xl font-bold tracking-tight text-text sm:text-3xl">{m.settings_title()}</h1>

{#if form && 'error' in form}
	<p class="mb-4 rounded-card border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
		{form.error}
	</p>
{/if}

<div class="flex flex-col gap-4">
	<FormCard title={m.settings_locale_label()}>
		<form method="POST" action="?/updateLocale" class="flex flex-wrap items-center gap-3">
			<select
				name="locale"
				class="rounded-pill border border-border bg-surface-2 px-4 py-2 text-sm text-text focus:border-accent focus:outline-none"
			>
				<option value="pl" selected={data.locale === 'pl'}>Polski</option>
				<option value="en" selected={data.locale === 'en'}>English</option>
			</select>
			<button
				type="submit"
				class="sheen bg-gradient-accent rounded-pill px-5 py-2 text-sm font-semibold text-accent-fg shadow-glow transition-transform hover:scale-[1.03]"
			>
				{m.settings_locale_save()}
			</button>
		</form>
	</FormCard>

	<FormCard>
		<nav class="flex flex-col divide-y divide-border">
			<a
				href={resolve('/profile')}
				class="flex items-center justify-between py-3 text-sm font-medium text-text transition-colors hover:text-accent"
			>
				{m.profile_link()}
				<IconChevronLeft class="rotate-180 text-text-faint" size={16} />
			</a>
			<a
				href={resolve('/settings/import')}
				class="flex items-center justify-between py-3 text-sm font-medium text-text transition-colors hover:text-accent"
			>
				{m.settings_import_link()}
				<IconChevronLeft class="rotate-180 text-text-faint" size={16} />
			</a>
			<a
				href={resolve('/settings/jellyfin')}
				class="flex items-center justify-between py-3 text-sm font-medium text-text transition-colors hover:text-accent"
			>
				{m.settings_jellyfin_link()}
				<IconChevronLeft class="rotate-180 text-text-faint" size={16} />
			</a>
		</nav>
	</FormCard>
</div>
