<script lang="ts">
  import type { SetcodeOption } from "$lib/utils/setcode";

  let {
    index,
    hexValue = "",
    options = [],
    knownValues = new Set<string>(),
    customLabel = "Custom",
    onSelectChange = () => {},
    onHexChange = () => {},
  }: {
    index: number;
    hexValue?: string;
    options?: SetcodeOption[];
    knownValues?: ReadonlySet<string>;
    customLabel?: string;
    onSelectChange?: (index: number, value: string) => void;
    onHexChange?: (index: number, value: string) => void;
  } = $props();

  let normalizedHex = $derived(hexValue ? `0x${hexValue.padStart(4, "0").toUpperCase()}` : "");
  let dropdownValue = $derived(
    normalizedHex === ""
      ? ""
      : knownValues.has(normalizedHex)
        ? normalizedHex
        : "__custom__",
  );
</script>

<div class="setcode-row">
  <select
    value={dropdownValue}
    onchange={(event) => {
      onSelectChange(index, (event.currentTarget as HTMLSelectElement).value);
    }}
  >
    <option value="">—</option>
    {#each options as option (option.value)}
      <option value={option.value}>{option.label}</option>
    {/each}
    {#if dropdownValue === "__custom__"}
      <option value="__custom__" selected>{customLabel} ({normalizedHex})</option>
    {/if}
  </select>
  <div class="hex-input">
    <span class="hex-prefix">0x</span>
    <input
      type="text"
      value={hexValue}
      oninput={(event) => {
        onHexChange(index, (event.currentTarget as HTMLInputElement).value);
      }}
      maxlength="4"
      placeholder="0000"
    />
  </div>
</div>

<style>
  .setcode-row {
    display: flex;
    gap: 4px;
  }

  .setcode-row select {
    flex: 2;
    padding: 2px 4px;
    font-size: 0.84rem;
    width: 100%;
    background: var(--bg-base);
    color: var(--text-primary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
  }

  .hex-input {
    flex: 1;
    display: flex;
    align-items: center;
    background: var(--bg-base);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    overflow: hidden;
  }

  .hex-input:focus-within {
    border-color: var(--accent-primary);
    box-shadow: 0 0 0 1px var(--accent-primary);
  }

  .hex-prefix {
    padding: 0 4px;
    color: var(--text-secondary);
    font-size: 0.82rem;
    font-family: monospace;
    background: var(--bg-surface);
    border-right: 1px solid var(--border-color);
    height: 100%;
    display: flex;
    align-items: center;
  }

  .hex-input input {
    width: 100%;
    border: none;
    border-radius: 0;
    padding: 2px 4px;
    font-family: monospace;
    font-size: 0.88rem;
    background: var(--bg-base);
    color: var(--text-primary);
  }

  .hex-input input:focus {
    box-shadow: none;
    outline: none;
  }
</style>
