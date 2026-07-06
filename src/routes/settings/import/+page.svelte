<script lang="ts">
	import { m } from '$lib/paraglide/messages';
	import FormCard from '$lib/components/FormCard.svelte';

	let { data, form } = $props();

	let fileName = $state<string | null>(null);
</script>

<svelte:head><title>{m.import_title()} · {m.app_name()}</title></svelte:head>

<h1 class="mb-6 text-2xl font-bold tracking-tight text-text sm:text-3xl">{m.import_title()}</h1>

{#if form?.error}
	<p class="mb-4 rounded-card border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
		{form.error}
	</p>
{/if}

{#if form?.success}
	<p class="mb-4 rounded-card border border-accent/30 bg-accent/10 px-4 py-3 text-sm text-accent">
		{m.import_success({ shows: form.importedShows, episodes: form.importedEpisodes })}
	</p>
{/if}

{#if !data.review}
	<FormCard>
		<p class="mb-4 text-sm text-text-muted">{m.import_instructions()}</p>
		<form
			method="POST"
			action="?/upload"
			enctype="multipart/form-data"
			class="flex flex-col items-start gap-4"
		>
			<label
				class="flex w-full cursor-pointer flex-col items-center justify-center gap-1 rounded-card border-2 border-dashed border-border px-6 py-10 text-center transition-colors hover:border-accent"
			>
				<input
					type="file"
					name="file"
					accept=".zip,.csv"
					required
					class="hidden"
					onchange={(e) => (fileName = e.currentTarget.files?.[0]?.name ?? null)}
				/>
				<span class="text-sm font-medium text-text">
					{fileName ?? m.import_upload_button()}
				</span>
				<span class="text-xs text-text-faint">.zip / .csv</span>
			</label>
			<button
				type="submit"
				class="rounded-pill bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition-transform hover:scale-[1.03]"
			>
				{m.import_upload_button()}
			</button>
		</form>
	</FormCard>
{:else}
	<FormCard>
		<form method="POST" action="?/confirm" class="flex flex-col gap-4">
			<input type="hidden" name="importId" value={data.review.importId} />
			<p class="text-sm text-text-muted">
				{m.import_found_shows({ count: data.review.shows.length })}
			</p>
			<ul class="flex flex-col gap-2">
				{#each data.review.shows as show, index (show.showName)}
					<li
						class="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface-2 px-4 py-3"
					>
						<div class="min-w-0">
							<p class="truncate text-sm font-medium text-text">{show.showName}</p>
							<p class="text-xs text-text-muted">
								{m.import_episode_count({ count: show.episodeCount })}
							</p>
						</div>
						{#if show.confidence === 'auto'}
							<span class="rounded-pill bg-accent/15 px-3 py-1 text-xs font-medium text-accent">
								{m.import_matched_auto()}
							</span>
						{:else if show.confidence === 'ambiguous'}
							<div class="flex items-center gap-2">
								<span class="rounded-pill bg-surface px-3 py-1 text-xs font-medium text-text-muted">
									{m.import_needs_review()}
								</span>
								<select
									name="pick_{index}"
									class="rounded-pill border border-border bg-surface px-3 py-1.5 text-xs text-text focus:border-accent focus:outline-none"
								>
									<option value="skip">{m.import_skip_option()}</option>
									{#each show.candidates as candidate (candidate.tmdbId)}
										<option value={candidate.tmdbId}>
											{candidate.title}{candidate.year ? ` (${candidate.year})` : ''}
										</option>
									{/each}
								</select>
							</div>
						{:else}
							<span class="rounded-pill bg-danger/15 px-3 py-1 text-xs font-medium text-danger">
								{m.import_not_found()}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
			<button
				type="submit"
				class="self-start rounded-pill bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition-transform hover:scale-[1.03]"
			>
				{m.import_confirm_button()}
			</button>
		</form>
	</FormCard>
{/if}
