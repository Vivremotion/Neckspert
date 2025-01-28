<!-- src/lib/components/PlayCommands.svelte -->
<script lang="ts">
	import { trainerManager } from '$lib/services/TrainerManager';

	let mouseoverPlayButton = false;
	let isPlayClicked = false;

	async function handleClickOnPlay() {
		isPlayClicked ? trainerManager.pause() : trainerManager.start();
		isPlayClicked = !isPlayClicked;
	}
</script>

<div class="play-commands" role="listitem">
	<button
		class="play-button text-5xl font-light hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
		on:mouseenter={() => (mouseoverPlayButton = true)}
		on:mouseleave={() => (mouseoverPlayButton = false)}
		on:click={handleClickOnPlay}
		>{#if isPlayClicked}
			| |
		{:else}
			{mouseoverPlayButton ? '▶' : '▷'}
		{/if}
	</button>
</div>

<style>
	.play-commands {
		position: relative;
		width: 100px;
		height: 100px;
		display: flex;
		align-items: center;
		justify-content: center;
		user-select: none;
		transition:
			transform 0.2s,
			box-shadow 0.2s;
	}

	.play-button {
		width: 100%;
		height: 100%;
		transition: color 0.2s;
	}
</style>
