<script setup>
import { computed } from "vue";
import { Line } from "vue-chartjs";
import { fmtShort } from "../utils.js";
import { useTheme } from "../composables/useTheme.js";

// Reçoit /api/stats/evolution : [{ date, pctRERNG, pctNAT, pctMI2N, pctCoupled }]
const props = defineProps({ evolution: Array });
const { palette } = useTheme();

// RER NG et NAT sont climatisés, contrairement au MI2N — % calculé côté front,
// pas besoin de remonter cette donnée depuis l'API (déjà dispo via pctRERNG/pctNAT).
const evolutionWithClim = computed(() =>
  props.evolution.map((d) => ({ ...d, pctClim: d.pctRERNG + d.pctNAT }))
);

const series = computed(() => [
  { key: "pctRERNG", label: "% RER NG", color: palette.value.rerng },
  { key: "pctNAT", label: "% NAT", color: palette.value.nat },
  { key: "pctMI2N", label: "% MI2N", color: palette.value.mi2n },
  { key: "pctClim", label: "% rames climatisées (RER NG + NAT)", color: palette.value.clim, dashed: true },
  { key: "pctCoupled", label: "% compositions couplées (UM)", color: palette.value.um, dashed: true },
]);

const dense = computed(() => props.evolution.length > 16);

const chartData = computed(() => ({
  labels: evolutionWithClim.value.map((d) => fmtShort(d.date)),
  datasets: series.value.map((s) => ({
    label: s.label,
    data: evolutionWithClim.value.map((d) => d[s.key]),
    borderColor: s.color,
    backgroundColor: s.color,
    borderWidth: 2.5,
    borderDash: s.dashed ? [6, 5] : [],
    tension: 0.3,
    pointRadius: dense.value ? 0 : 3,
    pointHoverRadius: 5,
    pointBackgroundColor: palette.value.panel,
    pointBorderColor: s.color,
    pointBorderWidth: 2,
  })),
}));

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: { callbacks: { label: (c) => ` ${c.dataset.label} : ${c.raw}%` } },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        color: palette.value.faint, font: { family: "IBM Plex Mono" },
        maxRotation: 0, autoSkip: true, maxTicksLimit: 9,
      },
    },
    y: {
      grid: { color: palette.value.grid },
      ticks: { color: palette.value.faint, font: { family: "IBM Plex Mono" }, callback: (v) => v + "%" },
    },
  },
}));
</script>

<template>
  <div>
    <div class="db-chartbox"><Line :data="chartData" :options="options" /></div>
    <div class="db-legendrow">
      <span v-for="s in series" :key="s.key" class="db-lr is-line"><i :style="{ background: s.color }"></i>{{ s.label }}</span>
    </div>
  </div>
</template>
