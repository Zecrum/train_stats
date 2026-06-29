<script setup>
import { computed } from "vue";
import { pct } from "../utils.js";

const props = defineProps({ disruptions: Object });

const plannedTotal = computed(() => {
  const d = props.disruptions;
  return (d?.detail_resolved || 0) + (d?.detail_unknown || 0) + (d?.detail_pending || 0);
});

const equipFailedReal = computed(() => {
  const d = props.disruptions;
  return (d?.equipment_unknown || 0) - (d?.equipment_unknown_canceled || 0);
});
</script>

<template>
  <section class="db-panel db-metrics db-disrupt-bar" v-if="disruptions?.detail_total > 0">
    <div class="db-info-trigger" tabindex="0">
      <div class="db-stat-v">{{ disruptions.detail_total }}</div>
      <div class="db-stat-l">trajets analysés <span class="db-info-icon">ⓘ</span></div>

      <div class="db-info-pop">
        <div class="db-info-row">
          <span>circulations prévues</span>
          <b>{{ plannedTotal }}</b>
        </div>
        <div class="db-info-row">
          <span>trajets analysés</span>
          <b>{{ disruptions.detail_resolved }}</b>
        </div>
        <div class="db-info-row">
          <span>échecs équipement <i>(hors annulés)</i></span>
          <b :class="{ 'is-warn': equipFailedReal > 0 }">{{ equipFailedReal }}</b>
        </div>
        <div class="db-info-row">
          <span>échecs récupération trajet</span>
          <b :class="{ 'is-warn': disruptions.detail_unknown > 0 }">{{ disruptions.detail_unknown }}</b>
        </div>
        <div class="db-info-row is-faint">
          <span>en attente (train pas encore passé)</span>
          <b>{{ disruptions.detail_pending }}</b>
        </div>
      </div>
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
      <div class="db-stat-v">{{ disruptions.median_delay ? disruptions.median_delay + ' min' : '–' }}</div>
      <div class="db-stat-l">retard médian (trains retardés)</div>
    </div>
  </section>
</template>

<style scoped>
.db-disrupt-bar { margin-bottom: 16px; }
.v-canceled  { color: var(--c-canceled); }
.v-delayed   { color: var(--c-delayed); }
.v-modified  { color: var(--c-modified); }

.db-info-trigger { position: relative; cursor: help; outline: none; }
.db-info-icon { color: var(--faint); font-size: 10px; }

.db-info-pop {
  display: none;
  position: absolute;
  top: calc(100% + 10px);
  left: 0;
  width: 250px;
  background: var(--panel);
  border: 1px solid var(--line2);
  border-radius: 10px;
  padding: 12px 14px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.28);
  z-index: 30;
  text-align: left;
}
.db-info-trigger:hover .db-info-pop,
.db-info-trigger:focus .db-info-pop,
.db-info-trigger:focus-within .db-info-pop {
  display: block;
}

.db-info-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  font-size: 11px;
  color: var(--dim);
  padding: 4px 0;
  border-bottom: 1px solid var(--line);
}
.db-info-row:last-child { border-bottom: none; }
.db-info-row i { font-size: 9px; color: var(--faint); font-style: italic; }
.db-info-row b { font-family: "IBM Plex Mono", monospace; font-weight: 600; color: var(--text); flex-shrink: 0; }
.db-info-row b.is-warn { color: var(--c-delayed); }
.db-info-row.is-faint { color: var(--faint); }
.db-info-row.is-faint b { color: var(--faint); font-weight: 500; }
</style>
