<script lang="ts">
  import { disableAutofill } from '$lib/actions/disableAutofill';

  export let title = '';
  export let description = '';
  export let badgeLabel = '';
  export let hasSecretKey = false;
  export let baseUrlLabel = '';
  export let secretKeyLabel = '';
  export let modelLabel = '';
  export let temperatureLabel = '';
  export let temperatureHint = '';
  export let connectHint = '';
  export let connectHintError = false;
  export let connectLabel = '';
  export let connectingLabel = '';
  export let secretClearLabel = '';
  export let modelPlaceholder = '';
  export let apiBaseUrl = '';
  export let secretKey = '';
  export let model = '';
  export let temperature: number | string = 1;
  export let modelOptions: string[] = [];
  export let connecting = false;
  export let secretPlaceholder = '';
  export let onApiBaseUrlInput: (value: string) => void = () => {};
  export let onSecretKeyInput: (value: string) => void = () => {};
  export let onModelInput: (value: string) => void = () => {};
  export let onModelChange: () => void | Promise<void> = () => {};
  export let onTemperatureInput: (value: number) => void = () => {};
  export let onConnect: () => void | Promise<void> = () => {};
  export let onClearSecretKey: () => void | Promise<void> = () => {};
</script>

<div class="sp-card sp-ai" use:disableAutofill>
  <div class="sp-ai-head">
    <div class="sp-card-head">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
    <span class="sp-badge" class:ok={hasSecretKey}>{badgeLabel}</span>
  </div>

  <div class="sp-ai-grid">
    <label class="sp-field">
      <span>{baseUrlLabel}</span>
      <input
        type="text"
        value={apiBaseUrl}
        placeholder="https://api.openai.com/v1"
        oninput={(event) => onApiBaseUrlInput((event.currentTarget as HTMLInputElement).value)}
      />
    </label>

    <label class="sp-field">
      <span>{secretKeyLabel}</span>
      <input
        type="password"
        value={secretKey}
        placeholder={secretPlaceholder}
        oninput={(event) => onSecretKeyInput((event.currentTarget as HTMLInputElement).value)}
      />
    </label>

    <label class="sp-field">
      <span>{modelLabel}</span>
      <select
        value={model}
        onchange={(event) => {
          onModelInput((event.currentTarget as HTMLSelectElement).value);
          void onModelChange();
        }}
        disabled={connecting || modelOptions.length === 0}
      >
        {#if modelOptions.length === 0}
          <option value="">{modelPlaceholder}</option>
        {/if}
        {#each modelOptions as item}
          <option value={item}>{item}</option>
        {/each}
      </select>
    </label>

    <label class="sp-field">
      <span>{temperatureLabel}</span>
      <input
        type="number"
        min="0"
        max="2"
        step="0.1"
        value={temperature}
        oninput={(event) => onTemperatureInput(Number((event.currentTarget as HTMLInputElement).value))}
      />
      <small class="sp-hint">{temperatureHint}</small>
    </label>
  </div>

  <div class="sp-ai-foot">
    <p class="sp-ai-hint" class:err={connectHintError}>{connectHint}</p>
    <div class="sp-btns">
      <button class="sp-btn" type="button" onclick={onConnect} disabled={connecting}>
        {connecting ? connectingLabel : connectLabel}
      </button>
      <button class="sp-btn sp-btn-ghost" type="button" onclick={onClearSecretKey}>
        {secretClearLabel}
      </button>
    </div>
  </div>
</div>

<style>
  .sp-card {
    background: color-mix(in srgb, var(--bg-surface) 92%, transparent);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sp-card-head h3 {
    margin: 0;
    font-size: 0.88rem;
    font-weight: 700;
    color: var(--text-primary);
  }
  .sp-card-head p {
    margin: 2px 0 0;
    font-size: 0.76rem;
    color: var(--text-secondary);
    line-height: 1.4;
  }
  .sp-ai-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
  }
  .sp-badge {
    flex-shrink: 0;
    font-size: 0.7rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 9px;
    background: color-mix(in srgb, var(--text-disabled) 14%, transparent);
    color: var(--text-disabled);
    white-space: nowrap;
    margin-top: 1px;
  }
  .sp-badge.ok {
    background: rgba(22, 163, 74, 0.12);
    color: #22c55e;
  }
  .sp-ai-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 12px;
  }
  .sp-ai-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .sp-ai-hint {
    margin: 0;
    font-size: 0.76rem;
    color: var(--text-secondary);
    line-height: 1.35;
    min-width: 0;
  }
  .sp-ai-hint.err { color: #ef4444; }
  .sp-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .sp-field > span {
    font-size: 0.74rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  input, select {
    width: 100%;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-base);
    color: var(--text-primary);
    padding: 6px 9px;
    font-size: 0.84rem;
    transition: border-color 0.15s;
  }
  input:focus, select:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary) 16%, transparent);
  }
  .sp-hint {
    font-size: 0.72rem;
    color: var(--text-disabled);
    line-height: 1.35;
  }
  .sp-btns {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sp-btn {
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 5px 10px;
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    background: var(--bg-surface-active);
    color: var(--text-primary);
    transition: background 0.12s, border-color 0.12s;
    white-space: nowrap;
  }
  .sp-btn:hover:not(:disabled) { background: var(--bg-surface-hover); border-color: var(--accent-primary); }
  .sp-btn-ghost {
    background: transparent;
  }
  @media (max-width: 980px) {
    .sp-ai-grid {
      grid-template-columns: 1fr;
    }
    .sp-ai-foot {
      flex-direction: column;
      align-items: stretch;
    }
  }
</style>
