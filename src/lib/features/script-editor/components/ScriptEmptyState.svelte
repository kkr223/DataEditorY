<script lang="ts">
  export let title = '';
  export let description = '';
</script>

<section class="script-empty">
  <h2>{title}</h2>
  <p>{description}</p>
</section>

<style>
  .script-empty {
    height: 100%;
    display: grid;
    place-items: center;
    text-align: center;
    color: var(--text-secondary);
    gap: 10px;
  }
</style>
