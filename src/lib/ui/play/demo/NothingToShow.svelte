<script lang="ts">
	/** What a demonstration page says when the registry holds nothing for it to show. */
	let { text }: { text: string } = $props();
</script>

<p class="nothing">{text}</p>

<style>
	.nothing {
		margin: 0;
		padding: var(--np-step-4);
		font-size: var(--np-size-body);
		color: var(--np-text);
	}
</style>
