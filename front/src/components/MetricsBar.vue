<script setup>
import { pct } from "../utils.js";
const props = defineProps({ daily: Object });
</script>

<template>
  <section class="db-panel db-metrics">
    <div>
      <div class="db-stat-v">{{ daily.collected }}</div>
      <div class="db-stat-l">circulations collectées</div>
    </div>
    <div class="db-divider"></div>
    <div>
      <div class="db-stat-v" style="color: var(--c-nat)">{{ daily.resolved }}</div>
      <div class="db-stat-l">résolues</div>
    </div>
    <div>
      <div class="db-stat-v" style="color: var(--c-mi2n)">{{ daily.unknown }}</div>
      <div class="db-stat-l">inconnues</div>
    </div>
    <div v-if="daily.pending > 0">
      <div class="db-stat-v" style="color: var(--c-dim)">{{ daily.pending }}</div>
      <div class="db-stat-l">en attente</div>
    </div>
    <div class="db-divider"></div>
    <div>
      <div class="db-stat-v">{{ pct(daily.resolved, daily.collected) }}%</div>
      <div class="db-stat-l">taux résolution</div>
    </div>
  </section>
</template>
