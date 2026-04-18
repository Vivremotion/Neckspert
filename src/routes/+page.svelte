<script lang="ts">
  import {
    ChordCombobox,
    ChordProgressionContainer,
    ChordDisplayer,
    CountdownDisplay,
    PlayCommands,
    GameOverlay,
    RhythmDisplay,
    Modal,
    Calibration
  } from '$lib/components';
  import { get } from 'svelte/store';
  import { progressionStore } from '$lib/stores/chords.store';
  import { gameStore, type GameState } from '$lib/stores/game.store';
  import { calibrationModalOpen } from '$lib/stores/calibration.store';
  import { trainerManager } from '$lib/composition/trainerComposition';

  function openCalibrationModal() {
    if ((get(gameStore) as GameState).isPlaying) {
      trainerManager.pause();
    }
    calibrationModalOpen.set(true);
  }
</script>

<div class="app dark:bg-slate-800">
  <header>
    <h1 class="title prose font-serif text-4xl dark:prose-invert">Neckspert</h1>
  </header>
  <div class="app-body">
    <ChordCombobox />
    <div class="chord-section">
      <ChordProgressionContainer />
      {#if $progressionStore?.instances?.length}
        <PlayCommands />
      {/if}
    </div>
    <div class="bottom-item flex flex-col items-center">
      {#if $gameStore.isPlaying && $gameStore.countdown > 0}
        <CountdownDisplay />
      {/if}
      {#if $gameStore.isPlaying}
        <RhythmDisplay />
      {:else if $progressionStore?.currentInstance}
        <ChordDisplayer instance={$progressionStore?.currentInstance} />
      {/if}
    </div>
    {#if ($gameStore.score > 0 || $gameStore.isPlaying) && $gameStore.countdown <= 0}
      <div class="bottom-item relative flex flex-col items-center justify-center gap-2">
        <GameOverlay class="bottom-item" />
      </div>
    {/if}
  </div>
  <button
    class="calibration-button"
    type="button"
    aria-label="Calibrate timing"
    on:click={openCalibrationModal}
  >
    <i class="fa-solid fa-sliders" aria-hidden="true"></i>
  </button>

  {#if $calibrationModalOpen}
    <Modal ariaLabel="Timing calibration" onclose={() => calibrationModalOpen.set(false)}>
      <Calibration oncomplete={() => calibrationModalOpen.set(false)} />
    </Modal>
  {/if}
</div>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 48px;
    padding: 48px;
  }
  .app-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    width: 100%;
  }
  .chord-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
    width: 100%;
  }
  .bottom-item {
    flex: 1 1 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  /* Responsive design for small screens */
  @media (max-width: 768px) {
    .app {
      padding: 24px;
      gap: 24px;
    }
    .app-body {
      gap: 16px;
    }
  }

  .calibration-button {
    position: fixed;
    bottom: 0.5rem;
    left: 0.5rem;
    z-index: 30;
    width: 2.25rem;
    height: 2.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: rgba(148, 163, 184, 0.2);
    color: rgb(148 163 184);
    border-radius: 8px;
    cursor: pointer;
    transition:
      color 0.15s,
      background 0.15s;
  }
  .calibration-button:hover {
    background: rgba(148, 163, 184, 0.3);
    color: rgb(226 232 240);
  }

  /* Extra small screens */
  @media (max-width: 480px) {
    .app {
      padding: 16px;
      gap: 16px;
    }
  }
</style>
