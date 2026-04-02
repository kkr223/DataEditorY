<script lang="ts">
  export let coverImageSrc = '';
  export let coverTitle = '';
  export let coverDescription = '';
  export let coverPickLabel = '';
  export let coverResetLabel = '';
  export let errorLogTitle = '';
  export let errorLogDescription = '';
  export let errorLogPath = '';
  export let errorLogOpenLabel = '';
  export let onPickCover: () => void | Promise<void> = () => {};
  export let onClearCover: () => void | Promise<void> = () => {};
  export let onOpenErrorLog: () => void | Promise<void> = () => {};
</script>

<div class="sp-row-top">
  <div class="sp-card sp-cover">
    <img src={coverImageSrc} alt={coverTitle} class="sp-cover-img" />
    <div class="sp-cover-body">
      <div class="sp-card-head">
        <h3>{coverTitle}</h3>
        <p>{coverDescription}</p>
      </div>
      <div class="sp-btns">
        <button class="sp-btn" type="button" onclick={onPickCover}>{coverPickLabel}</button>
        <button class="sp-btn sp-btn-ghost" type="button" onclick={onClearCover}>{coverResetLabel}</button>
      </div>
    </div>
  </div>

  <div class="sp-card sp-log">
    <div class="sp-card-head">
      <h3>{errorLogTitle}</h3>
      <p>{errorLogDescription}</p>
    </div>
    <code class="sp-log-path">{errorLogPath || '-'}</code>
    <button class="sp-btn" type="button" onclick={onOpenErrorLog}>{errorLogOpenLabel}</button>
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
  .sp-row-top {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    align-items: start;
  }
  .sp-cover {
    flex-direction: row;
    align-items: stretch;
    gap: 12px;
  }
  .sp-cover-img {
    width: 90px;
    aspect-ratio: 0.69;
    object-fit: cover;
    border-radius: 6px;
    background: #111827;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
    flex-shrink: 0;
  }
  .sp-cover-body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 6px;
  }
  .sp-log {
    justify-content: space-between;
  }
  .sp-log-path {
    font-family: 'Cascadia Code', Consolas, 'Courier New', monospace;
    font-size: 0.72rem;
    line-height: 1.45;
    padding: 6px 8px;
    border-radius: 6px;
    background: var(--bg-base);
    border: 1px solid var(--border-color);
    color: var(--text-secondary);
    word-break: break-all;
    display: block;
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
    .sp-row-top {
      grid-template-columns: 1fr;
    }
  }
</style>
