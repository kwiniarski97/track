<script lang="ts">
	let { size = 20, class: className = '' }: { size?: number; class?: string } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.8"
	stroke-linecap="round"
	stroke-linejoin="round"
	class={className}
	aria-hidden="true"
>
	<path d="M12 14.5V4M8.3 7.6 12 4l3.7 3.6" />
	<path
		d="M6 10.5H5A1.5 1.5 0 0 0 3.5 12v6A1.5 1.5 0 0 0 5 19.5h14a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5h-1"
	/>
</svg>
