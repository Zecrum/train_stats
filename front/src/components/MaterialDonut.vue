<script setup>
import { computed } from "vue";
import { Doughnut } from "vue-chartjs";
import { pct, MATERIALS } from "../utils.js";
import { useTheme } from "../composables/useTheme.js";
import { MAT_COLOR } from "../palette.js";

const props = defineProps({ material: Object });
const { palette } = useTheme();

const matTotal = computed(() => props.material.RERNG + props.material.NAT + props.material.MI2N);
const colors = computed(() => MAT_COLOR(palette.value));

const chartData = computed(() => ({
  labels: ["RER NG", "NAT", "MI2N"],
  datasets: [{
    data: [props.material.RERNG, props.material.NAT, props.material.MI2N],
    backgroundColor: [colors.value.RERNG, colors.value.NAT, colors.value.MI2N],
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
      callbacks: {
        label: (c) => ` ${c.label} : ${c.raw} (${pct(c.raw, matTotal.value)}%)`,
      },
    },
  },
}));
</script>

<template>
  <div class="db-panel">
    <div class="db-panel-h">// répartition matériel</div>
    <div class="db-donutwrap">
      <div class="db-donut-canvas">
        <Doughnut :data="chartData" :options="options" />
        <div class="db-donut-center">
          <div class="db-donut-big">{{ pct(material.RERNG, matTotal) }}%</div>
          <div class="db-donut-small">RER&nbsp;NG</div>
        </div>
      </div>
      <div class="db-legend">
        <div v-for="m in MATERIALS" :key="m.key" class="db-leg">
          <i :style="{ background: colors[m.key] }"></i>
          <div class="db-leg-txt">
            <span class="db-leg-n">{{ m.name }}</span>
            <span class="db-leg-note">{{ m.note }}</span>
          </div>
          <span class="db-leg-v">{{ material[m.key] }}</span>
          <span class="db-leg-p">{{ pct(material[m.key], matTotal) }}%</span>
        </div>
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
