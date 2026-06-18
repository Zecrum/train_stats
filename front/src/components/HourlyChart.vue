<script setup>
import { computed } from "vue";
import { Line } from "vue-chartjs";
import { MATERIALS } from "../utils.js";
import { useTheme } from "../composables/useTheme.js";
import { MAT_COLOR } from "../palette.js";

// Reçoit le tableau brut /api/stats/hourly : [{ heure, materiel, total }]
const props = defineProps({ hourly: Array });
const { palette } = useTheme();

const MAT_FROM_DB = { "RERNG": "RERNG", "NAT": "NAT", "MI2N": "MI2N" };

function slotToLabel(s) {
  const h = Math.floor(s * 15 / 60);
  const m = (s * 15) % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
}

const slots = computed(() =>
  [...new Set(props.hourly.map((r) => r.slot))].sort((a, b) => a - b)
);
const lookup = computed(() => {
  const m = {};
  props.hourly.forEach((r) => {
    const key = MAT_FROM_DB[r.materiel] || r.materiel;
    m[`${r.slot}|${key}`] = (m[`${r.slot}|${key}`] || 0) + r.total;
  });
  return m;
});

const colors = computed(() => MAT_COLOR(palette.value));

const chartData = computed(() => {
  const totalColor = palette.value.text;
  return {
    labels: slots.value.map(slotToLabel),
    datasets: [
      {
        label: "Total",
        data: slots.value.map((s) =>
          MATERIALS.reduce((sum, m) => sum + (lookup.value[`${s}|${m.key}`] || 0), 0)
        ),
        borderColor: totalColor,
        backgroundColor: totalColor,
        borderWidth: 2,
        borderDash: [5, 4],
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointBackgroundColor: palette.value.panel,
        pointBorderColor: totalColor,
        pointBorderWidth: 2,
        fill: false,
      },
      ...MATERIALS.map((m) => {
        const color = colors.value[m.key];
        return {
          label: m.name,
          data: slots.value.map((s) => lookup.value[`${s}|${m.key}`] || 0),
          borderColor: color,
          backgroundColor: color,
          borderWidth: 2.5,
          tension: 0.3,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointBackgroundColor: palette.value.panel,
          pointBorderColor: color,
          pointBorderWidth: 2,
          fill: false,
        };
      }),
    ],
  };
});

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
        callback: (_, idx) => {
          const s = slots.value[idx];
          return s !== undefined && s % 4 === 0 ? slotToLabel(s) : "";
        },
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
      <span class="db-lr is-line is-dashed">
        <i :style="{ borderTopColor: palette.text }"></i>Total
      </span>
      <span v-for="m in MATERIALS" :key="m.key" class="db-lr is-line">
        <i :style="{ background: colors[m.key] }"></i>{{ m.name }}
      </span>
      <span class="db-lr" style="margin-left:auto;color:var(--faint)">trains en circulation par tranche de 15 min</span>
    </div>
  </div>
</template>
