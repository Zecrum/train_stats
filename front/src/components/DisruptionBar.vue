<script setup>
import { pct } from "../utils.js";

const props = defineProps({ disruptions: Object });
</script>

<template>
  <section class="db-panel db-metrics db-disrupt-bar" v-if="disruptions?.detail_total > 0">
    <div>
      <div class="db-stat-v">{{ disruptions.detail_total }}</div>
      <div class="db-stat-l">trajets analysés</div>
    </div>
    <div class="db-divider"></div>
    <div>
      <div class="db-stat-v" :class="{ 'v-canceled': disruptions.canceled > 0 }">{{ disruptions.canceled }}</div>
      <div class="db-stat-l">supprimés · {{ pct(disruptions.canceled, disruptions.detail_total) }}%</div>
    </div>
    <div>
      <div class="db-stat-v" :class="{ 'v-delayed': disruptions.delayed > 0 }">{{ disruptions.delayed }}</div>
      <div class="db-stat-l">en retard (≥ 3 min) · {{ pct(disruptions.delayed, disruptions.detail_total) }}%</div>
    </div>
    <div>
      <div class="db-stat-v" :class="{ 'v-modified': disruptions.modified > 0 }">{{ disruptions.modified }}</div>
      <div class="db-stat-l">parcours modifiés · {{ pct(disruptions.modified, disruptions.detail_total) }}%</div>
    </div>
    <div class="db-divider"></div>
    <div>
      <div class="db-stat-v">{{ disruptions.avg_delay ? disruptions.avg_delay + ' min' : '–' }}</div>
      <div class="db-stat-l">retard moyen (trains retardés)</div>
    </div>
  </section>
</template>

<style scoped>
.db-disrupt-bar { margin-bottom: 16px; }
.v-canceled  { color: var(--c-canceled); }
.v-delayed   { color: var(--c-delayed); }
.v-modified  { color: var(--c-modified); }
</style>
