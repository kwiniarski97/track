<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import FormCard from '$lib/components/FormCard.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>{m.settings_jellyfin_link()} · {m.app_name()}</title></svelte:head>

<h1 class="mb-6 text-2xl font-bold tracking-tight text-text sm:text-3xl">
	{m.settings_jellyfin_link()}
</h1>

{#if form?.error}
	<p class="mb-4 rounded-card border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
		{form.error}
	</p>
{/if}
{#if form?.synced}
	<p class="mb-4 rounded-card border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
		{m.jellyfin_synced()}
	</p>
{/if}
{#if data.listError}
	<p class="mb-4 rounded-card border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
		{data.listError}
	</p>
{/if}

<FormCard>
	{#if data.linkedJellyfinUserId}
		<p class="mb-4 text-sm text-text-muted">
			{m.jellyfin_linked({ id: data.linkedJellyfinUserId })}
		</p>
		<div class="flex flex-wrap gap-2">
			<form method="POST" action="?/sync">
				<button
					type="submit"
					class="rounded-pill bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-transform hover:scale-[1.03]"
				>
					{m.jellyfin_sync_now()}
				</button>
			</form>
			<form method="POST" action="?/unlink">
				<button
					type="submit"
					class="rounded-pill border border-border px-5 py-2 text-sm font-medium text-text-muted transition-colors hover:border-danger hover:text-danger"
				>
					{m.jellyfin_unlink()}
				</button>
			</form>
		</div>
	{:else}
		<form method="POST" action="?/link" class="flex flex-wrap items-center gap-3">
			<select
				name="jellyfinUserId"
				required
				class="rounded-pill border border-border bg-surface-2 px-4 py-2 text-sm text-text focus:border-accent focus:outline-none"
			>
				<option value="" disabled selected>{m.jellyfin_select_user()}</option>
				{#each data.jellyfinUsers as user (user.id)}
					<option value={user.id}>{user.name}</option>
				{/each}
			</select>
			<button
				type="submit"
				class="rounded-pill bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-transform hover:scale-[1.03]"
			>
				{m.jellyfin_link_button()}
			</button>
		</form>
	{/if}
</FormCard>
