<script setup>
import { computed } from "vue";
import { Line } from "vue-chartjs";
import { useTheme } from "../composables/useTheme.js";

// Reçoit /api/stats/hourly-branches : [{ heure, branche, total }]
const props = defineProps({ hourlyBranches: Array });
const { palette } = useTheme();

const BRANCHES = [
  { key: "Chelles",  label: "Chelles–Gournay",    paletteKey: "chelles"  },
  { key: "Tournan",  label: "Tournan",             paletteKey: "tournan"  },
  { key: "Villiers", label: "Villiers-sur-Marne",  paletteKey: "villiers" },
  { key: "Central",  label: "Tronçon central",     paletteKey: "central"  },
];

const hours = computed(() =>
  [...new Set(props.hourlyBranches.map((r) => r.heure))].sort((a, b) => a - b)
);

const lookup = computed(() => {
  const m = {};
  props.hourlyBranches.forEach((r) => { m[`${r.heure}|${r.branche}`] = r.total; });
  return m;
});

const dense = computed(() => hours.value.length > 16);

const chartData = computed(() => ({
  labels: hours.value.map((h) => `${h}h`),
  datasets: BRANCHES.map((b) => {
    const color = palette.value[b.paletteKey];
    return {
      label: b.label,
      data: hours.value.map((h) => lookup.value[`${h}|${b.key}`] || 0),
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
      <span v-for="b in BRANCHES" :key="b.key" class="db-lr is-line">
        <i :style="{ background: palette[b.paletteKey] }"></i>{{ b.label }}
      </span>
    </div>
  </div>
</template>
