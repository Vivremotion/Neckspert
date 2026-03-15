<script lang="ts">
	import { rhythmDisplayStore } from '$lib/stores/rhythmDisplay.store';
	import NoteSymbol from './NoteSymbol.svelte';
	import type { Bar } from '$lib/utils/barUtils';

	$: currentBar = $rhythmDisplayStore.currentBar;
	$: nextBar = $rhythmDisplayStore.nextBar;
	$: activeChordId = $rhythmDisplayStore.activeChordId;
	$: transitioning = $rhythmDisplayStore.transitioning;

	function isActive(chordId: string): boolean {
		return chordId === activeChordId;
	}

	function isPast(bar: Bar, chordId: string): boolean {
		if (!activeChordId || !bar) return false;
		const activeIdx = bar.chords.findIndex((c: { id: string }) => c.id === activeChordId);
		const thisIdx = bar.chords.findIndex((c: { id: string }) => c.id === chordId);
		if (activeIdx === -1) return true;
		return thisIdx < activeIdx;
	}
</script>

{#if currentBar || nextBar}
	<div class="rhythm-display" aria-label="Rhythm display">
		<div class="rhythm-lines">
			<!-- Next bar (top, preview) -->
			<div
				class="rhythm-line next-line"
				class:slide-down={transitioning}
			>
				{#if nextBar}
					{#each nextBar.chords as chord (chord.id)}
						<span class="rhythm-chord preview">
							<NoteSymbol value={chord.duration.value} dotted={chord.duration.dotted} size={20} />
							<span class="chord-name text-2xl">{chord.name}</span>
						</span>
					{/each}
				{/if}
			</div>

			<!-- Current bar (bottom, active) -->
			<div
				class="rhythm-line current-line"
				class:slide-up={transitioning}
			>
				{#if currentBar}
					{#each currentBar.chords as chord (chord.id)}
						<span
							class="rhythm-chord"
							class:active={isActive(chord.id)}
							class:past={isPast(currentBar, chord.id)}
						>
							<NoteSymbol value={chord.duration.value} dotted={chord.duration.dotted} size={20} />
							<span class="chord-name text-2xl">{chord.name}</span>
						</span>
					{/each}
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.rhythm-display {
		width: 100%;
		max-width: 500px;
		overflow: hidden;
	}

	.rhythm-lines {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 12px;
	}

	.rhythm-line {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		min-height: 28px;
		transition: all 0.4s ease;
	}

	.next-line {
		opacity: 0.35;
	}

	.next-line.slide-down {
		animation: slideToActive 0.4s ease forwards;
	}

	.current-line.slide-up {
		animation: slideOutUp 0.4s ease forwards;
	}

	@keyframes slideToActive {
		from {
			opacity: 0.35;
			transform: translateY(0);
		}
		to {
			opacity: 1;
			transform: translateY(34px);
		}
	}

	@keyframes slideOutUp {
		from {
			opacity: 1;
			transform: translateY(0);
		}
		to {
			opacity: 0;
			transform: translateY(-34px);
		}
	}

	.rhythm-chord {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		font-family: ui-monospace, SFMono-Regular, monospace;
		font-size: 0.85rem;
		color: rgb(51, 65, 85);
		transition: all 0.2s ease;
		white-space: nowrap;
	}

	.rhythm-chord.preview {
		color: rgb(100, 116, 139);
	}

	.rhythm-chord.active {
		color: rgb(15, 23, 42);
		font-weight: 700;
		transform: scale(1.08);
	}

	.rhythm-chord.past {
		color: rgb(148, 163, 184);
	}

	.chord-name {
		line-height: 1;
	}

	@media (prefers-color-scheme: dark) {
		.rhythm-chord {
			color: rgb(203, 213, 225);
		}

		.rhythm-chord.preview {
			color: rgb(100, 116, 139);
		}

		.rhythm-chord.active {
			color: rgb(241, 245, 249);
		}

		.rhythm-chord.past {
			color: rgb(100, 116, 139);
		}
	}

	@media (max-width: 480px) {
		.rhythm-chord {
			font-size: 0.75rem;
			gap: 2px;
		}

		.rhythm-line {
			gap: 8px;
		}
	}
</style>
