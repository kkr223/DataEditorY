<script lang="ts">
  import { disableAutofill } from '$lib/actions/disableAutofill';
  import { DEFAULT_SCRIPT_EDITOR_FONT_SIZE, SCRIPT_EDITOR_FONT_SIZE_MIN, SCRIPT_EDITOR_FONT_SIZE_MAX } from '$lib/features/script-editor/fontPreferences';

  export let title = '';
  export let description = '';
  export let templateHelp = '';
  export let externalEditorLabel = '';
  export let externalEditorHint = '';
  export let saveScriptImageToLocalLabel = '';
  export let saveScriptImageToLocalHint = '';
  export let autoCompleteFunctionParametersLabel = '';
  export let autoCompleteFunctionParametersHint = '';
  export let fontSizeLabel = '';
  export let fontSizeHint = '';
  export let scriptEditorFontSize = DEFAULT_SCRIPT_EDITOR_FONT_SIZE;
  export let onFontSizeChange: (value: number) => void = () => {};
  export let scriptDirectoryLabel = '';
  export let scriptDirectoryHint = '';
  export let scriptTemplate = '';
  export let scriptDirectory = '';
  export let onScriptTemplateInput: (value: string) => void = () => {};
  export let onScriptDirectoryInput: (value: string) => void = () => {};
  export let useExternalScriptEditor = false;
  export let saveScriptImageToLocal = false;
  export let autoCompleteFunctionParameters = true;
  export let onExternalEditorChange: (value: boolean) => void = () => {};
  export let onSaveScriptImageToLocalChange: (value: boolean) => void = () => {};
  export let onAutoCompleteFunctionParametersChange: (value: boolean) => void = () => {};
</script>

<div class="sp-card sp-tpl" use:disableAutofill>
  <div class="sp-card-head">
    <div class="sp-title-row">
      <h3>{title}</h3>
      <button type="button" class="sp-template-help" title={templateHelp} aria-label={templateHelp}>?</button>
    </div>
    <p>{description}</p>
  </div>
  <label class="sp-switch">
    <input
      type="checkbox"
      checked={useExternalScriptEditor}
      onchange={(event) => onExternalEditorChange((event.currentTarget as HTMLInputElement).checked)}
    />
    <span class="sp-switch-track" aria-hidden="true"></span>
    <span>{externalEditorLabel}</span>
  </label>
  <small class="sp-hint sp-switch-hint">{externalEditorHint}</small>
  <label class="sp-switch">
    <input
      type="checkbox"
      checked={saveScriptImageToLocal}
      onchange={(event) => onSaveScriptImageToLocalChange((event.currentTarget as HTMLInputElement).checked)}
    />
    <span class="sp-switch-track" aria-hidden="true"></span>
    <span>{saveScriptImageToLocalLabel}</span>
  </label>
  <small class="sp-hint sp-switch-hint">{saveScriptImageToLocalHint}</small>
  <label class="sp-switch">
    <input
      type="checkbox"
      checked={autoCompleteFunctionParameters}
      onchange={(event) => onAutoCompleteFunctionParametersChange((event.currentTarget as HTMLInputElement).checked)}
    />
    <span class="sp-switch-track" aria-hidden="true"></span>
    <span>{autoCompleteFunctionParametersLabel}</span>
  </label>
  <small class="sp-hint sp-switch-hint">{autoCompleteFunctionParametersHint}</small>
  <label class="sp-field">
    <span>{fontSizeLabel}</span>
    <input type="number" min={SCRIPT_EDITOR_FONT_SIZE_MIN} max={SCRIPT_EDITOR_FONT_SIZE_MAX} step="1"
      value={scriptEditorFontSize}
      oninput={(event) => onFontSizeChange(event.currentTarget.valueAsNumber)} />
  </label>
  <small class="sp-hint">{fontSizeHint}</small>
  <label class="sp-field">
    <span>{scriptDirectoryLabel}</span>
    <input
      type="text"
      value={scriptDirectory}
      placeholder="(CDB)/script"
      oninput={(event) => onScriptDirectoryInput((event.currentTarget as HTMLInputElement).value)}
    />
  </label>
  <small class="sp-hint">{scriptDirectoryHint}</small>
  <textarea
    class="sp-textarea"
    rows="5"
    value={scriptTemplate}
    oninput={(event) => onScriptTemplateInput((event.currentTarget as HTMLTextAreaElement).value)}
  ></textarea>
</div>

<style>
  .sp-card {
    background: color-mix(in srgb, var(--bg-surface) 92%, transparent);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-card);
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .sp-card-head {
    min-width: 0;
  }
  .sp-card-head h3 {
    margin: 0;
    font-size: var(--text-base);
    font-weight: 700;
    color: var(--text-primary);
  }
  .sp-card-head p {
    margin: 2px 0 0;
    font-size: var(--text-xs);
    color: var(--text-secondary);
    line-height: 1.4;
  }
  .sp-switch {
    display: flex;
    align-items: center;
    align-self: flex-start;
    gap: 8px;
    cursor: pointer;
    user-select: none;
  }
  .sp-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .sp-template-help {
    display: inline-grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border: 1px solid var(--border-color);
    border-radius: 50%;
    padding: 0;
    background: transparent;
    color: var(--text-secondary);
    font-size: var(--text-2xs);
    cursor: help;
  }
  .sp-switch input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
  .sp-switch-track {
    width: 32px;
    height: 18px;
    flex: 0 0 auto;
    border-radius: var(--control-radius-pill);
    background: var(--bg-surface-active);
    box-shadow: inset 0 0 0 1px var(--border-color);
    transition: background 0.15s, box-shadow 0.15s;
  }
  .sp-switch-track::after {
    content: '';
    display: block;
    width: 14px;
    height: 14px;
    margin: 2px;
    border-radius: 50%;
    background: var(--text-disabled);
    transition: transform 0.15s, background 0.15s;
  }
  .sp-switch input:checked + .sp-switch-track {
    background: var(--accent-primary);
    box-shadow: none;
  }
  .sp-switch input:checked + .sp-switch-track::after {
    transform: translateX(14px);
    background: var(--text-on-accent);
  }
  .sp-switch input:focus-visible + .sp-switch-track {
    outline: 2px solid color-mix(in srgb, var(--accent-primary) 52%, transparent);
    outline-offset: 2px;
  }
  .sp-switch > span:last-child {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--text-primary);
  }
  .sp-textarea {
    width: 100%;
    min-height: 90px;
    max-height: 200px;
    resize: vertical;
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    line-height: 1.5;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius);
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
  .sp-field {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .sp-field > span {
    font-size: var(--text-xs);
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  input {
    width: 100%;
    border: 1px solid var(--border-color);
    border-radius: var(--control-radius);
    background: var(--bg-base);
    color: var(--text-primary);
    padding: 6px 9px;
    font-size: var(--text-sm);
  }
  input:focus {
    outline: none;
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-primary) 16%, transparent);
  }
  .sp-hint {
    font-size: var(--text-2xs);
    color: var(--text-disabled);
    line-height: 1.35;
  }
  .sp-switch-hint {
    margin-left: 40px;
  }
</style>
