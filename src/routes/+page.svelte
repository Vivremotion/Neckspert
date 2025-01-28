<script lang="ts">
	import {
		ChordCombobox,
		ChordProgressionContainer,
		ChordDisplayer,
		CountdownDisplay,
		PlayCommands,
		GameOverlay
	} from '$lib/components';
	import { chordStore } from '$lib/stores/chords.store';
	import { gameStore } from '$lib/stores/game.store';
</script>

<div class="app dark:bg-slate-800">
	<header>
		<h1 class="title prose font-serif text-4xl dark:prose-invert">Neckspert</h1>
	</header>
	<div class="top">
		<ChordCombobox items={['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']} />
		<div class="flex items-center">
			<ChordProgressionContainer />
			{#if $chordStore?.chords?.length}
				<PlayCommands />
			{/if}
		</div>
	</div>

	<div class="bottom w-full h-full flex flex-row items-center">
		<div class="bottom-item">
			{#if $gameStore.score > 0 || $gameStore.isPlaying}
				<GameOverlay class="bottom-item" />
			{/if}
		</div>
		<div class="bottom-item">
			{#if $gameStore.countdown > 0}
				<CountdownDisplay />
			{:else if $chordStore?.currentChord}
				<ChordDisplayer chord={$chordStore?.currentChord} />
			{/if}
		</div>
		<div class="bottom-item"></div>
	</div>
</div>

<style>
	.app {
		height: 100vh;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 48px;
		padding: 48px;
	}
	.top {
		display: flex;
		flex-direction: column;
		gap: 10px;
		align-items: center;
	}
	.bottom-item {
		flex: 1 1 0;
    display: flex;
    align-items: center;
    justify-content: center;
	}
</style>
