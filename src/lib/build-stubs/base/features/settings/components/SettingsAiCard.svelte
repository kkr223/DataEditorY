<script lang="ts">
  export let title = "";
  export let description = "";
  export let badgeLabel = "";
  export let hasSecretKey = false;
  export let baseUrlLabel = "";
  export let secretKeyLabel = "";
  export let modelLabel = "";
  export let temperatureLabel = "";
  export let temperatureHint = "";
  export let connectHint = "";
  export let connectHintError = false;
  export let connectLabel = "";
  export let connectingLabel = "";
  export let secretClearLabel = "";
  export let modelPlaceholder = "";
  export let apiBaseUrl = "";
  export let secretKey = "";
  export let model = "";
  export let temperature: number | string = 1;
  export let modelOptions: string[] = [];
  export let connecting = false;
  export let secretPlaceholder = "";
  export let onApiBaseUrlInput: (value: string) => void = () => {};
  export let onSecretKeyInput: (value: string) => void = () => {};
  export let onModelInput: (value: string) => void = () => {};
  export let onModelChange: () => void | Promise<void> = () => {};
  export let onTemperatureInput: (value: number) => void = () => {};
  export let onConnect: () => void | Promise<void> = () => {};
  export let onClearSecretKey: () => void | Promise<void> = () => {};

  $: void [
    title,
    description,
    badgeLabel,
    hasSecretKey,
    baseUrlLabel,
    secretKeyLabel,
    modelLabel,
    temperatureLabel,
    temperatureHint,
    connectHint,
    connectHintError,
    connectLabel,
    connectingLabel,
    secretClearLabel,
    modelPlaceholder,
    apiBaseUrl,
    secretKey,
    model,
    temperature,
    modelOptions,
    connecting,
    secretPlaceholder,
    onApiBaseUrlInput,
    onSecretKeyInput,
    onModelInput,
    onModelChange,
    onTemperatureInput,
    onConnect,
    onClearSecretKey,
  ];
</script>
