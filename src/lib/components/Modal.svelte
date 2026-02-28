<!-- Reusable modal: dimmed backdrop, closable via X or click outside. -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Optional aria-label for the modal dialog. */
		ariaLabel?: string;
		/** Called when the user closes the modal (X, backdrop, or Escape). */
		onclose?: () => void;
		children?: Snippet;
	}

	let { ariaLabel = 'Dialog', onclose, children }: Props = $props();

	function close() {
		onclose?.();
	}

	function handleBackdropClick(e: MouseEvent) {
		if ((e.target as HTMLElement).getAttribute('data-modal-backdrop') === 'true') {
			close();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div
	data-modal-backdrop="true"
	class="modal-backdrop"
	onclick={handleBackdropClick}
	role="presentation"
>
	<div
		class="modal-panel
		bg-slate-200 text-slate-800
        dark:bg-slate-800 dark:text-slate-200"
		role="dialog"
		aria-modal="true"
		aria-label={ariaLabel}
	>
		<button
			class="modal-close text-xl font-thin dark:text-slate-200 dark:hover:text-slate-400"
			type="button"
			aria-label="Close"
			onclick={close}
		>
			<i class="fa-solid fa-times" aria-hidden="true"></i>
		</button>
		<div class="modal-content">
			{#if children}
				{@render children()}
			{/if}
		</div>
	</div>
</div>

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
		/* Semi-transparent backdrop; rgba so the panel stays opaque */
		background-color: rgba(226, 232, 240, 0.6); /* slate-200 @ 60% */
	}
	@media (prefers-color-scheme: dark) {
		.modal-backdrop {
			background-color: rgba(51, 65, 85, 0.6); /* slate-700 @ 60% */
		}
	}

	.modal-panel {
		position: relative;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
		max-width: min(90vw, 420px);
		width: 100%;
		max-height: 90vh;
		overflow: auto;
		opacity: 1;
	}

	.modal-close {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		width: 1rem;
		height: 1rem;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	.modal-content {
		padding: 1.5rem 2rem 2rem;
	}
</style>
