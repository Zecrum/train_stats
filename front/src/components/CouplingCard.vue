<script setup>
import { computed } from "vue";
import { Doughnut } from "vue-chartjs";
import { pct } from "../utils.js";
import { useTheme } from "../composables/useTheme.js";

const props = defineProps({ coupling: Object });
const { palette } = useTheme();

const total = computed(() => props.coupling.um + props.coupling.us);

const chartData = computed(() => ({
  labels: ["UM · couplées", "US · simples"],
  datasets: [{
    data: [props.coupling.um, props.coupling.us],
    backgroundColor: [palette.value.um, palette.value.us],
    borderColor: palette.value.panel,
    borderWidth: 2,
    hoverOffset: 4,
  }],
}));

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: "70%",
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: { label: (c) => ` ${c.label} : ${c.raw} (${pct(c.raw, total.value)}%)` },
    },
  },
}));
</script>

<template>
  <div class="db-panel">
    <div class="db-panel-h">composition UM / US</div>
    <div class="db-donutwrap">
      <div class="db-donut-canvas">
        <Doughnut :data="chartData" :options="options" />
        <div class="db-donut-center">
          <div class="db-donut-big">{{ pct(coupling.um, total) }}%</div>
          <div class="db-donut-small">couplées</div>
        </div>
      </div>
      <div class="db-legend">
        <div class="db-leg">
          <i :style="{ background: 'var(--c-um)' }"></i>
          <div class="db-leg-txt"><span class="db-leg-n">UM · couplées</span><span class="db-leg-note">Unité multiple</span></div>
          <span class="db-leg-v">{{ coupling.um }}</span>
          <span class="db-leg-p">{{ pct(coupling.um, total) }}%</span>
        </div>
        <div class="db-leg">
          <i :style="{ background: 'var(--c-us)' }"></i>
          <div class="db-leg-txt"><span class="db-leg-n">US · simples</span><span class="db-leg-note">Unité simple</span></div>
          <span class="db-leg-v">{{ coupling.us }}</span>
          <span class="db-leg-p">{{ pct(coupling.us, total) }}%</span>
        </div>
        <div class="db-note">Un train couplé compte pour une seule circulation.</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.db-donut-canvas { position: relative; width: 150px; height: 150px; flex: none; }
.db-donut-center {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; pointer-events: none;
}
.db-donut-big { font-family: "IBM Plex Mono", monospace; font-size: 30px; font-weight: 600; color: var(--text); }
.db-donut-small { font-family: "IBM Plex Mono", monospace; font-size: 11px; letter-spacing: 1px; color: var(--faint); }
@media (max-width: 480px) {
  .db-donut-canvas { width: 120px; height: 120px; }
  .db-donut-big { font-size: 24px; }
}
</style>
