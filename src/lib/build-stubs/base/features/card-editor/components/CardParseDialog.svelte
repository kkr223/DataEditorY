<script lang="ts">
  export let open = false;
  export let mode: "parse" | "instruction" = "parse";
  export let manuscriptInput = "";
  export let isParsing = false;
  export let onModeChange: (mode: "parse" | "instruction") => void = () => {};
  export let onClose: () => void = () => {};
  export let onConfirm: () => void | Promise<void> = () => {};
  export let onBackdropKeydown: (event: KeyboardEvent) => void = () => {};
  export let closeAriaLabel = "";
  export let dialogAriaLabel = "";
  export let title = "";
  export let description = "";
  export let placeholder = "";
  export let cancelLabel = "";
  export let confirmLabel = "";
  export let parsingLabel = "";
  export let parseModeLabel = "";
  export let instructionModeLabel = "";
  export let resultTitle = "";
  export let resultText = "";

  $: void [
    open,
    mode,
    manuscriptInput,
    isParsing,
    onModeChange,
    onClose,
    onConfirm,
    onBackdropKeydown,
    closeAriaLabel,
    dialogAriaLabel,
    title,
    description,
    placeholder,
    cancelLabel,
    confirmLabel,
    parsingLabel,
    parseModeLabel,
    instructionModeLabel,
    resultTitle,
    resultText,
  ];
</script>
