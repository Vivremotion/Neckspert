<!-- src/lib/components/ChordVerifier.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import type { Chord } from '../models';
	import { ChordDetector } from '../services/HPCPDetector/HPCPDetector';

	export let targetChord: Chord;

	let detector: ChordDetector;
	let isListening = false;
	let feedback = '';
	let matchPercentage = 0;

	// State for visual feedback
	let detectedNotes: string[] = [];
	let correctNotes: string[] = [];
	let missingNotes: string[] = [];

	onMount(() => {
		detector = new ChordDetector();
	});

	onDestroy(() => {
		if (detector) {
			detector.stop();
		}
	});

	async function startListening() {
		try {
			await detector.start();
			isListening = true;
			checkChord();
		} catch (error) {
			feedback = 'Error accessing microphone';
		}
	}

	function stopListening() {
		detector.stop();
		isListening = false;
		feedback = '';
	}

	function checkChord() {
		detector.startChordDetection((notes) => {
			detectedNotes = notes;

			// Convert both arrays to Sets for easier comparison
			const detectedSet = new Set(notes);
			const targetSet = new Set(targetChord.notes.map((n) => n.name));

			// Find correct and missing notes
			correctNotes = notes.filter((note) => targetSet.has(note));
			missingNotes = Array.from(targetSet).filter((note) => !detectedSet.has(note));

			// Calculate match percentage
			matchPercentage = (correctNotes.length / targetChord.notes.length) * 100;

			// Update feedback
			if (matchPercentage === 100) {
				feedback = 'Perfect! All notes are correct!';
			} else if (matchPercentage > 70) {
				feedback = 'Almost there! Keep trying!';
			} else {
				feedback = 'Keep practicing!';
			}

			// Continue checking if still listening
			if (isListening) {
				checkChord();
			}
		});
	}
</script>

<div class="verifier">
	<button class="verify-button" on:click={isListening ? stopListening : startListening}>
		{isListening ? 'Stop' : 'Start'} Verification
	</button>

	{#if isListening}
		<div class="feedback">
			<div class="progress-bar">
				<div class="progress" style="width: {matchPercentage}%" />
			</div>
			<p>{feedback}</p>

			<div class="notes-feedback">
				<div class="correct">
					<h4>Detected Notes:</h4>
					{#each correctNotes as note}
						<span class="note correct">{note}</span>
					{/each}
				</div>
s
				<div class="missing">
					<h4>Missing Notes:</h4>
					{#each missingNotes as note}
						<span class="note missing">{note}</span>
					{/each}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.verifier {
		margin-top: 20px;
	}

	.verify-button {
		padding: 10px 20px;
		background: #4caf50;
		color: white;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	.verify-button:hover {
		background: #45a049;
	}

	.feedback {
		margin-top: 20px;
	}

	.progress-bar {
		width: 100%;
		height: 20px;
		background: #f0f0f0;
		border-radius: 10px;
		overflow: hidden;
	}

	.progress {
		height: 100%;
		background: #4caf50;
		transition: width 0.3s ease;
	}

	.notes-feedback {
		margin-top: 10px;
	}

	.note {
		display: inline-block;
		padding: 4px 8px;
		margin: 2px;
		border-radius: 4px;
	}

	.note.correct {
		background: #4caf50;
		color: white;
	}

	.note.missing {
		background: #ff9800;
		color: white;
	}
</style>
