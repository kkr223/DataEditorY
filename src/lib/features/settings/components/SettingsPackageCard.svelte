<script lang="ts">
  import { disableAutofill } from '$lib/actions/disableAutofill';

  export let title = '';
  export let description = '';
  export let hint = '';
  export let patternsText = '';
  export let onPatternsInput: (value: string) => void = () => {};
</script>

<div class="sp-card sp-package" use:disableAutofill>
  <div class="sp-card-head">
    <h3>{title}</h3>
    <p>{description}</p>
  </div>
  <textarea
    class="sp-textarea"
    rows="5"
    spellcheck="false"
    value={patternsText}
    oninput={(event) => onPatternsInput((event.currentTarget as HTMLTextAreaElement).value)}
  ></textarea>
  <small class="sp-hint">{hint}</small>
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
  .sp-textarea {
    width: 100%;
    min-height: 92px;
    max-height: 220px;
    resize: vertical;
    font-family: 'Cascadia Code', Consolas, 'Courier New', monospace;
    font-size: 0.82rem;
    line-height: 1.5;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-base);
    color: var(--text-primary);
    padding: 8px 10px;
    transition: border-color 0.15s;
  }
  .sp-textarea:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary) 16%, transparent);
  }
  .sp-hint {
    font-size: 0.72rem;
    color: var(--text-disabled);
    line-height: 1.35;
  }
</style>
