<script lang="ts">
	import '../app.css';
	import { i18n } from '$lib/i18n/index.svelte';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		i18n.init();
	});
</script>

{@render children()}
