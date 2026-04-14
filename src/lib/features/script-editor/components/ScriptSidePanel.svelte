<script lang="ts">
  import { disableAutofill } from '$lib/actions/disableAutofill';

  export let descriptionTitle = '';
  export let stringsTitle = '';
  export let effectText = '';
  export let effectEmptyText = '';
  export let stringPlaceholder = '';
  export let scriptStrings: string[] = [];
  export let onInsertStringId: (index: number) => void = () => {};
  export let onStringInput: (index: number, value: string) => void = () => {};
  export let onStringBlur: (index: number) => void | Promise<void> = () => {};
</script>

<aside class="script-side-panel" use:disableAutofill>
  <section class="script-side-card">
    <h3>{descriptionTitle}</h3>
    <div class="effect-text">{effectText || effectEmptyText}</div>
  </section>

  <section class="script-side-card">
    <h3>{stringsTitle}</h3>
    <div class="string-list">
      {#each scriptStrings as value, index}
        <div class="string-row">
          <button class="string-label" type="button" onclick={() => onInsertStringId(index)}>
            aux.Stringid(id, {index})
          </button>
          <input
            class="string-input"
            type="text"
            value={value}
            placeholder={stringPlaceholder}
            oninput={(event) => onStringInput(index, (event.currentTarget as HTMLInputElement).value)}
            onblur={() => void onStringBlur(index)}
          />
        </div>
      {/each}
    </div>
  </section>
</aside>

<style>
  .script-side-panel {
    height: 100%;
    min-height: 0;
    border-left: 1px solid var(--border-color);
    padding: 6px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: color-mix(in srgb, var(--bg-surface) 76%, transparent);
  }

  .script-side-card {
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: color-mix(in srgb, var(--bg-surface) 94%, transparent);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .script-side-card h3 {
    margin: 0;
    font-size: 0.8rem;
  }

  .effect-text,
  .string-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .effect-text {
    color: var(--text-secondary);
    font-size: 0.77rem;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    padding: 0;
  }

  .string-list {
    color: var(--text-secondary);
  }

  .string-row {
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 5px 0;
    border-bottom: 1px solid var(--border-color);
  }

  .string-row:last-child {
    border-bottom: none;
  }

  .string-label {
    color: var(--accent-primary);
    font-size: 0.7rem;
    font-family: Consolas, 'Courier New', monospace;
    align-self: flex-start;
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .string-label:hover {
    filter: brightness(1.1);
  }

  .string-label:focus-visible {
    outline: 1px solid var(--accent-primary);
    outline-offset: 2px;
    border-radius: 4px;
  }

  .string-input {
    width: 100%;
    height: 1.8rem;
    min-height: 1.8rem;
    resize: none;
    border-radius: 7px;
    border: 1px solid color-mix(in srgb, var(--border-color) 88%, transparent);
    background: color-mix(in srgb, var(--bg-base) 90%, transparent);
    color: var(--text-secondary);
    font-size: 0.76rem;
    line-height: 1.2;
    padding: 0.24rem 0.48rem;
  }

  .string-input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent-primary) 45%, transparent);
  }
</style>
