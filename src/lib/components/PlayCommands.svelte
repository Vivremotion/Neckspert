<!-- src/lib/components/PlayCommands.svelte -->
<script lang="ts">
	import { trainerManager } from '$lib/services/TrainerManager';

	let isPlayClicked = false;
	let isRandomClicked = false;
	let isHideClicked = false;

	async function handleClickOnPlay() {
		isPlayClicked ? trainerManager.pause() : trainerManager.start();
		isPlayClicked = !isPlayClicked;
	}

	async function handleClickOnRandom() {
		isRandomClicked = !isRandomClicked;
		trainerManager.setRandomMode(isRandomClicked);
	}

	async function handleClickOnHide() {
		isHideClicked = !isHideClicked;
		trainerManager.setHideDiagram(isHideClicked);
	}
</script>

<div class="play-commands" role="listitem">
	<button
		class="play-button text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
		on:click={handleClickOnPlay}
		aria-label={isPlayClicked ? 'Pause' : 'Play'}
	>
		{#if isPlayClicked}
			<i class="fa-solid fa-pause" aria-hidden="true"></i>
		{:else}
			<i class="fa-solid fa-play" aria-hidden="true"></i>
		{/if}
	</button>
	<button
		class="play-button text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
		on:click={handleClickOnRandom}
		aria-label={isRandomClicked ? 'Loop mode' : 'Random mode'}
	>
		{#if isRandomClicked}
			<i class="fa-solid fa-repeat" aria-hidden="true"></i>
		{:else}
			<i class="fa-solid fa-shuffle" aria-hidden="true"></i>
		{/if}
	</button>
	<button
		class="play-button text-slate-600 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
		on:click={handleClickOnHide}
		aria-label={isHideClicked ? 'Show diagram' : 'Hide diagram'}
	>
		{#if isHideClicked}
			<i class="fa-solid fa-eye-slash" aria-hidden="true"></i>
		{:else}
			<i class="fa-solid fa-eye" aria-hidden="true"></i>
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
		gap: 20px;
		margin: 20px;
		user-select: none;
		transition:
			transform 0.2s,
			box-shadow 0.2s;
	}

	.play-button {
		width: 100%;
		height: 100%;
		font-size: 1.5rem;
		transition: color 0.2s;
	}
	
	/* Responsive design for small screens */
	@media (max-width: 768px) {
		.play-commands {
			width: 80px;
			height: 80px;
			margin-top: 16px;
		}
		
		.play-button {
			font-size: 1.25rem;
		}
	}
	
	/* Extra small screens */
	@media (max-width: 480px) {
		.play-commands {
			width: 70px;
			height: 70px;
			margin-top: 12px;
		}
		
		.play-button {
			font-size: 1.125rem;
		}
	}
</style>
