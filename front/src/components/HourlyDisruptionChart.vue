<script setup>
import { computed } from "vue";
import { Line } from "vue-chartjs";
import { useTheme } from "../composables/useTheme.js";

const props = defineProps({ data: Array });
const { palette } = useTheme();

const ALL_SLOTS = Array.from({ length: 96 }, (_, i) => i);

function slotToLabel(s) {
  const h = Math.floor(s * 15 / 60);
  const m = (s * 15) % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

const lookup = computed(() => {
  const canceled = {}, delayed = {};
  props.data.forEach((r) => {
    canceled[r.slot] = r.n_canceled;
    delayed[r.slot]  = r.n_delayed;
  });
  return { canceled, delayed };
});

const series = computed(() => [
  { key: "canceled", label: "supprimés",       color: palette.value.canceled },
  { key: "delayed",  label: "en retard ≥ 3 min", color: palette.value.delayed  },
]);

const chartData = computed(() => ({
  labels: ALL_SLOTS.map(slotToLabel),
  datasets: series.value.map((s) => ({
    label:               s.label,
    data:                ALL_SLOTS.map((slot) => lookup.value[s.key][slot] || 0),
    borderColor:         s.color,
    backgroundColor:     s.color,
    borderWidth:         2,
    tension:             0.3,
    pointRadius:         0,
    pointHoverRadius:    5,
    pointBackgroundColor: palette.value.panel,
    pointBorderColor:    s.color,
    pointBorderWidth:    2,
    fill:                false,
  })),
}));

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: { callbacks: { label: (c) => ` ${c.dataset.label} : ${c.raw} trains` } },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        color: palette.value.faint,
        font: { family: "IBM Plex Mono" },
        autoSkip: false,
        maxRotation: 0,
        callback: (_, idx) => idx % 4 === 0 ? slotToLabel(idx) : "",
      },
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
      <span v-for="s in series" :key="s.key" class="db-lr is-line">
        <i :style="{ background: s.color }"></i>{{ s.label }}
      </span>
      <span class="db-lr" style="margin-left:auto;color:var(--faint)">par tranche de 15 min · heure de départ</span>
    </div>
  </div>
</template>
