<script setup>
import { computed } from "vue";
import { Line } from "vue-chartjs";
import { MATERIALS } from "../utils.js";
import { useTheme } from "../composables/useTheme.js";
import { MAT_COLOR } from "../palette.js";

// Reçoit le tableau brut /api/stats/hourly : [{ heure, materiel, total }]
const props = defineProps({ hourly: Array });
const { palette } = useTheme();

const MAT_FROM_DB = { "RER NG": "RERNG", "NAT": "NAT", "MI2N": "MI2N", "Francilien": "NAT" };

const hours = computed(() =>
  [...new Set(props.hourly.map((r) => r.heure))].sort((a, b) => a - b)
);
const lookup = computed(() => {
  const m = {};
  props.hourly.forEach((r) => {
    const key = MAT_FROM_DB[r.materiel] || r.materiel;
    m[`${r.heure}|${key}`] = (m[`${r.heure}|${key}`] || 0) + r.total;
  });
  return m;
});

const dense = computed(() => hours.value.length > 10);
const colors = computed(() => MAT_COLOR(palette.value));

const chartData = computed(() => ({
  labels: hours.value.map((h) => `${h}h`),
  datasets: MATERIALS.map((m) => {
    const color = colors.value[m.key];
    return {
      label: m.name,
      data: hours.value.map((h) => lookup.value[`${h}|${m.key}`] || 0),
      borderColor: color,
      backgroundColor: color,
      borderWidth: 2.5,
      tension: 0.3,
      pointRadius: dense.value ? 0 : 3,
      pointHoverRadius: 5,
      pointBackgroundColor: palette.value.panel,
      pointBorderColor: color,
      pointBorderWidth: 2,
      fill: false,
    };
  }),
}));

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: { callbacks: { label: (c) => ` ${c.dataset.label} : ${c.raw} circ.` } },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: palette.value.faint, font: { family: "IBM Plex Mono" } },
    },
    y: {
      beginAtZero: true,
      grid: { color: palette.value.grid },
      ticks: { color: palette.value.faint, font: { family: "IBM Plex Mono" }, precision: 0 },
    },
  },
}));
</script>

<template>
  <div>
    <div class="db-chartbox"><Line :data="chartData" :options="options" /></div>
    <div class="db-legendrow">
      <span v-for="m in MATERIALS" :key="m.key" class="db-lr is-line">
        <i :style="{ background: colors[m.key] }"></i>{{ m.name }}
      </span>
      <span class="db-lr" style="margin-left:auto;color:var(--faint)">circulations / heure (status = ok)</span>
    </div>
  </div>
</template>
