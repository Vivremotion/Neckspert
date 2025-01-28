<script lang="ts">
	import { gameStore } from '../stores/game.store';
</script>

<div class="game-overlay flex flex-col items-center justify-center gap-y-10 text-5xl font-mono">
	<div class="timer">{$gameStore.timer.toFixed(1)}s</div>
	<div class="score">{$gameStore.score}pts</div>
</div>

<style>
	.game-overlay {
		padding: 1rem;
		color: white;
		border-radius: 8px;
	}
</style>
