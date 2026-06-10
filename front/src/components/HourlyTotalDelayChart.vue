<script setup>
import { computed } from "vue";
import { Line } from "vue-chartjs";
import { useTheme } from "../composables/useTheme.js";

const props = defineProps({ data: Array });
const { palette } = useTheme();

const ALL_SLOTS = Array.from({ length: 96 }, (_, i) => i);

function slotToLabel(s) {
  const h = Math.floor((s * 15) / 60);
  const m = (s * 15) % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

const delayLookup = computed(() => {
  const map = {};
  props.data.forEach((r) => { map[r.slot] = r.total_delay; });
  return map;
});

const color = computed(() => palette.value.delayed);

const chartData = computed(() => ({
  labels: ALL_SLOTS.map(slotToLabel),
  datasets: [
    {
      label:               "minutes de retard cumulées",
      data:                ALL_SLOTS.map((s) => delayLookup.value[s] || 0),
      borderColor:         color.value,
      backgroundColor:     color.value + "30",
      borderWidth:         2,
      tension:             0.3,
      pointRadius:         0,
      pointHoverRadius:    5,
      pointBackgroundColor: palette.value.panel,
      pointBorderColor:    color.value,
      pointBorderWidth:    2,
      fill:                true,
    },
  ],
}));

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (c) => ` retard cumulé : ${c.raw} min`,
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: {
        color: palette.value.faint,
        font: { family: "IBM Plex Mono" },
        autoSkip: false,
        maxRotation: 0,
        callback: (_, idx) => (idx % 4 === 0 ? slotToLabel(idx) : ""),
      },
    },
    y: {
      beginAtZero: true,
      grid: { color: palette.value.grid },
      ticks: {
        color: palette.value.faint,
        font: { family: "IBM Plex Mono" },
        precision: 0,
        callback: (v) => v + " min",
      },
    },
  },
}));
</script>

<template>
  <div>
    <div class="db-chartbox"><Line :data="chartData" :options="options" /></div>
    <div class="db-legendrow">
      <span class="db-lr is-line">
        <i :style="{ background: color }"></i>retard cumulé (min)
      </span>
      <span class="db-lr" style="margin-left:auto;color:var(--faint)">par tranche de 15 min · heure de départ</span>
    </div>
  </div>
</template>
