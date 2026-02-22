<!-- src/lib/components/PlayCommands.svelte -->
<script lang="ts">
	import { trainerManager } from '../services/TrainerManager';
	import { gameStore } from '../stores/game.store';

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

	function handleTempoInput(e: Event) {
		const val = parseInt((e.target as HTMLInputElement).value, 10);
		if (!Number.isNaN(val)) gameStore.setTempoBpm(val);
	}
</script>

<div class="play-commands-wrapper">
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
	<!-- Rhythm: tempo + mode -->
	<div class="rhythm-controls text-slate-600 dark:text-slate-400">
		<label class="rhythm-control">
			<span class="rhythm-label">Rhythm</span>
			<button
				class="rhythm-mode-btn"
				class:active={$gameStore.rhythmMode}
				on:click={() => gameStore.setRhythmMode(!$gameStore.rhythmMode)}
				aria-pressed={$gameStore.rhythmMode}
			>
				{$gameStore.rhythmMode ? 'On' : 'Off'}
			</button>
		</label>
		{#if $gameStore.rhythmMode}
			<label class="tempo-control">
				<span class="tempo-label">Tempo</span>
				<input
					type="number"
					min="40"
					max="240"
					value={$gameStore.tempoBpm}
					on:input={handleTempoInput}
					class="tempo-input"
					aria-label="Tempo BPM"
				/>
				<span class="tempo-unit">BPM</span>
			</label>
		{/if}
	</div>
</div>

<style>
	.play-commands-wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
	}
	.play-commands {
		position: relative;
		width: 100px;
		height: 100px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 20px;
		margin: 20px;
		-webkit-user-select: none;
		   -moz-user-select: none;
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

	.rhythm-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: center;
		gap: 16px;
		font-size: 0.875rem;
	}
	.rhythm-control,
	.tempo-control {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.rhythm-label,
	.tempo-label {
		font-weight: 500;
	}
	.rhythm-mode-btn {
		padding: 4px 10px;
		border-radius: 6px;
		border: 1px solid currentColor;
		background: transparent;
		cursor: pointer;
		transition: background 0.2s, color 0.2s;
	}
	.rhythm-mode-btn.active {
		background: #94a3b8;
		color: #0f172a;
		border-color: #94a3b8;
	}
	:global(.dark) .rhythm-mode-btn.active {
		background: #cbd5e1;
		color: #0f172a;
		border-color: #cbd5e1;
	}
	.tempo-input {
		width: 4ch;
		padding: 4px 6px;
		border-radius: 4px;
		border: 1px solid currentColor;
		background: transparent;
		color: inherit;
		font: inherit;
		text-align: right;
	}
	.tempo-unit {
		opacity: 0.8;
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
