<script lang="ts">
	import { gameStore } from '../stores/game.store';
</script>

<div class="game-overlay flex flex-col items-center justify-center gap-y-10 text-5xl font-mono">
	<div class="timer">{$gameStore.timer.toFixed(1)}s</div>
	<div class="score">{$gameStore.score}pts</div>
	{#if $gameStore.rhythmMode && $gameStore.lastRhythmFeedback}
		<div
			class="rhythm-feedback"
			class:early={$gameStore.lastRhythmFeedback === 'early'}
			class:late={$gameStore.lastRhythmFeedback === 'late'}
			class:on-time={$gameStore.lastRhythmFeedback === 'on-time'}
		>
			{$gameStore.lastRhythmFeedback === 'early'
				? 'Too early'
				: $gameStore.lastRhythmFeedback === 'late'
					? 'Too late'
					: 'On time!'}
		</div>
	{/if}
</div>

<style>
	.game-overlay {
		padding: 1rem;
		color: white;
		border-radius: 8px;
	}
	.rhythm-feedback {
		font-size: 1.5rem;
		transition: color 0.2s;
	}
	.rhythm-feedback.early {
		color: #fbbf24;
	}
	.rhythm-feedback.late {
		color: #f87171;
	}
	.rhythm-feedback.on-time {
		color: #34d399;
	}
</style>
