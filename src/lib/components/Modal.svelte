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
		class="modal-panel"
		role="dialog"
		aria-modal="true"
		aria-label={ariaLabel}
	>
		<button
			class="modal-close"
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
		background: rgba(15, 23, 42, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
	}

	.modal-panel {
		position: relative;
		background: var(--modal-bg, rgb(30 41 59));
		border-radius: 12px;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
		max-width: min(90vw, 420px);
		width: 100%;
		max-height: 90vh;
		overflow: auto;
	}

	.modal-close {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border: none;
		background: transparent;
		color: rgb(148 163 184);
		cursor: pointer;
		border-radius: 6px;
		transition: color 0.15s, background 0.15s;
	}
	.modal-close:hover {
		color: rgb(226 232 240);
		background: rgba(148, 163, 184, 0.15);
	}

	.modal-content {
		padding: 1.5rem 2rem 2rem;
	}
</style>
