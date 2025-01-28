<script lang="ts">
  import { gameStore } from '$lib/stores/game.store';
  import { scale } from 'svelte/transition';
  import { expoOut } from 'svelte/easing';
</script>

{#if $gameStore.countdown > 0}
  <div class="countdown-container flex items-center justify-center">
    {#key $gameStore.countdown}
      <span 
        class="countdown-number text-slate-800 dark:text-slate-300 font-mono font-medium text-9xl"
        in:scale={{
          duration: 300,
          delay: 0,
          opacity: 0.5,
          start: 0.4,
          easing: expoOut
        }}
      >
        {$gameStore.countdown}
      </span>
    {/key}
  </div>
{/if}

<style>
  .countdown-container {
    height: 300px;
    width: 300px;
  }
</style> 