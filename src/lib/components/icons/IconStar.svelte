<script lang="ts">
	let { size = 20, class: className = '' }: { size?: number; class?: string } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="currentColor"
	class={className}
	aria-hidden="true"
>
	<path
		d="M12 2.5l2.98 6.04 6.67.97-4.83 4.7 1.14 6.64L12 17.77l-5.96 3.13 1.14-6.64-4.83-4.7 6.67-.97L12 2.5z"
	/>
</svg>
