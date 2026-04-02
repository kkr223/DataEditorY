<script lang="ts">
  export let title = '';
  export let description = '';
  export let externalEditorLabel = '';
  export let externalEditorHint = '';
  export let scriptTemplate = '';
  export let onScriptTemplateInput: (value: string) => void = () => {};
  export let useExternalScriptEditor = false;
  export let onExternalEditorChange: (value: boolean) => void = () => {};
</script>

<div class="sp-card sp-tpl">
  <div class="sp-tpl-head">
    <div class="sp-card-head">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
    <label class="sp-check">
      <input
        type="checkbox"
        checked={useExternalScriptEditor}
        onchange={(event) => onExternalEditorChange((event.currentTarget as HTMLInputElement).checked)}
      />
      <span>{externalEditorLabel}</span>
    </label>
  </div>
  <small class="sp-hint">{externalEditorHint}</small>
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
  .sp-tpl-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }
  .sp-textarea {
    width: 100%;
    min-height: 90px;
    max-height: 200px;
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
  .sp-check {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .sp-check input { width: auto; accent-color: var(--accent-primary); }
  .sp-check span { font-size: 0.8rem; font-weight: 500; color: var(--text-primary); }
  .sp-hint {
    font-size: 0.72rem;
    color: var(--text-disabled);
    line-height: 1.35;
  }
</style>
