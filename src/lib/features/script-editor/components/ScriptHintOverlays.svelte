<script lang="ts">
  export let currentFunctionHintTitle = '';
  export let currentFunctionHintDescription = '';
  export let isCurrentFunctionHintSuppressed = false;
  export let currentFunctionHintPlacement: 'top' | 'bottom' = 'top';
  export let currentFunctionHintAnchorTop = 12;
  export let suggestHintText = '';
  export let suggestHintPlacement: 'top' | 'bottom' = 'top';
  export let suggestHintAnchorTop = 12;
</script>

{#if currentFunctionHintTitle && !isCurrentFunctionHintSuppressed}
  <div
    class="current-function-hint"
    class:top={currentFunctionHintPlacement === 'top'}
    class:bottom={currentFunctionHintPlacement === 'bottom'}
    style={`top:${currentFunctionHintAnchorTop}px;`}
  >
    <div class="current-function-hint-title">{currentFunctionHintTitle}</div>
    {#if currentFunctionHintDescription}
      <div class="current-function-hint-description">{currentFunctionHintDescription}</div>
    {/if}
  </div>
{/if}

{#if suggestHintText}
  <div
    class="suggest-inline-hint"
    class:top={suggestHintPlacement === 'top'}
    class:bottom={suggestHintPlacement === 'bottom'}
    style={`top:${suggestHintAnchorTop}px;`}
  >{suggestHintText}</div>
{/if}

<style>
  .suggest-inline-hint {
    position: absolute;
    left: 16px;
    right: 16px;
    max-width: min(56vw, 920px);
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    background: rgba(26, 34, 32, 0.82);
    color: rgba(221, 235, 226, 0.72);
    font-size: 0.86rem;
    line-height: 1.5;
    font-style: italic;
    pointer-events: none;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: min(24vh, 220px);
    overflow-y: auto;
    backdrop-filter: blur(2px);
    z-index: 6;
  }

  .current-function-hint {
    position: absolute;
    left: 14px;
    max-width: min(44vw, 680px);
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.5rem 0.7rem;
    border: 1px solid rgba(146, 185, 159, 0.24);
    border-radius: 10px;
    background: rgba(34, 43, 39, 0.92);
    color: rgba(230, 242, 235, 0.9);
    backdrop-filter: blur(3px);
    pointer-events: none;
    z-index: 6;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.2);
  }

  .current-function-hint.top,
  .suggest-inline-hint.top {
    transform: translateY(calc(-100% - 10px));
  }

  .current-function-hint.bottom,
  .suggest-inline-hint.bottom {
    transform: translateY(10px);
  }

  .current-function-hint-title {
    font-family: 'Consolas', 'SFMono-Regular', 'Courier New', monospace;
    font-size: 0.9rem;
    line-height: 1.4;
    color: #e1f3e5;
    white-space: normal;
    word-break: break-word;
  }

  .current-function-hint-description {
    font-size: 0.84rem;
    line-height: 1.45;
    color: rgba(218, 233, 223, 0.76);
    white-space: pre-wrap;
    word-break: break-word;
  }

  :global([data-theme='light']) .suggest-inline-hint {
    background: rgba(255, 255, 255, 0.9);
    color: rgba(52, 76, 62, 0.72);
  }

  :global([data-theme='light']) .current-function-hint {
    border-color: rgba(109, 150, 119, 0.22);
    background: rgba(255, 255, 255, 0.92);
    color: rgba(36, 60, 46, 0.88);
    box-shadow: 0 10px 22px rgba(67, 96, 77, 0.08);
  }

  :global([data-theme='light']) .current-function-hint-title {
    color: #234432;
  }

  :global([data-theme='light']) .current-function-hint-description {
    color: rgba(48, 77, 60, 0.72);
  }
</style>
