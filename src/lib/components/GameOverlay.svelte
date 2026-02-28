<script lang="ts">
	import { gameStore } from '$lib/stores/game.store';
</script>

<div class="game-overlay flex flex-col items-center justify-center gap-y-6 text-5xl font-mono text-slate-800 dark:text-white">
	<div class="score">{$gameStore.score}pts</div>

	{#if $gameStore.totalBeatsInChord > 0 && $gameStore.countdown === 0}
		<div class="beat-indicator flex gap-2">
			{#each Array($gameStore.totalBeatsInChord) as _, i}
				<div
					class="beat-dot"
					class:active={i < $gameStore.currentBeat}
					class:current={i === $gameStore.currentBeat}
				></div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.game-overlay {
		padding: 1rem;
		border-radius: 8px;
	}

	.beat-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		background: rgba(148, 163, 184, 0.3);
		transition: all 0.1s ease;
	}

	.beat-dot.active {
		background: rgb(148, 163, 184);
	}

	.beat-dot.current {
		background: rgb(226, 232, 240);
		box-shadow: 0 0 8px rgba(226, 232, 240, 0.6);
		transform: scale(1.2);
	}
</style>
