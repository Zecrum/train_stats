<script setup>
import { computed } from "vue";
import { Line } from "vue-chartjs";
import { fmtShort } from "../utils.js";
import { useTheme } from "../composables/useTheme.js";

const props = defineProps({ evolution: Array });
const { palette } = useTheme();

const dense = computed(() => props.evolution.length > 16);

const pctData = computed(() =>
  props.evolution.map((d) => ({
    date:        d.date,
    pctCanceled: d.total > 0 ? Math.round(100 * d.canceled  / d.total) : 0,
    pctDelayed:  d.total > 0 ? Math.round(100 * d.delayed   / d.total) : 0,
    pctModified: d.total > 0 ? Math.round(100 * d.modified  / d.total) : 0,
    avg_delay:   d.avg_delay ?? null,
  }))
);

const series = computed(() => [
  { key: "pctCanceled", label: "% supprimés",          color: palette.value.canceled, axis: "y",      fmt: (v) => v + "%" },
  { key: "pctDelayed",  label: "% en retard ≥ 3 min",  color: palette.value.delayed,  axis: "y",      fmt: (v) => v + "%" },
  { key: "pctModified", label: "% parcours modifiés",   color: palette.value.modified, axis: "y",      fmt: (v) => v + "%" },
  { key: "avg_delay",   label: "retard moyen",          color: palette.value.dim,      axis: "yRight", fmt: (v) => v != null ? v + " min" : "–", dashed: true },
]);

const chartData = computed(() => ({
  labels: pctData.value.map((d) => fmtShort(d.date)),
  datasets: series.value.map((s) => ({
    label:               s.label,
    data:                pctData.value.map((d) => d[s.key]),
    borderColor:         s.color,
    backgroundColor:     s.color,
    borderWidth:         s.dashed ? 1.5 : 2.5,
    borderDash:          s.dashed ? [5, 4] : undefined,
    tension:             0.3,
    spanGaps:            true,
    pointRadius:         dense.value ? 0 : 3,
    pointHoverRadius:    5,
    pointBackgroundColor: palette.value.panel,
    pointBorderColor:    s.color,
    pointBorderWidth:    2,
    fill:                false,
    yAxisID:             s.axis,
  })),
}));

const options = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: "index", intersect: false },
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        label: (c) => {
          const s = series.value[c.datasetIndex];
          return ` ${s.label} : ${s.fmt(c.raw)}`;
        },
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: palette.value.faint, font: { family: "IBM Plex Mono" }, maxRotation: 0, autoSkip: true, maxTicksLimit: 9 },
    },
    y: {
      position: "left",
      beginAtZero: true,
      grid: { color: palette.value.grid },
      ticks: { color: palette.value.faint, font: { family: "IBM Plex Mono" }, callback: (v) => v + "%" },
    },
    yRight: {
      position: "right",
      beginAtZero: true,
      grid: { drawOnChartArea: false },
      ticks: { color: palette.value.dim, font: { family: "IBM Plex Mono" }, callback: (v) => v + " min" },
    },
  },
}));
</script>

<template>
  <div>
    <div class="db-chartbox"><Line :data="chartData" :options="options" /></div>
    <div class="db-legendrow">
      <span v-for="s in series" :key="s.key" class="db-lr is-line" :class="{ 'is-dashed': s.dashed }">
        <i :style="{ background: s.dashed ? 'transparent' : s.color, borderColor: s.color }"></i>{{ s.label }}
      </span>
    </div>
  </div>
</template>
