<script setup>
import { ref, computed, watch } from "vue";
import { api } from "./api.js";
import { TODAY, fmtLong, pct } from "./utils.js";
import { useTheme } from "./composables/useTheme.js";

import DatePicker from "./components/DatePicker.vue";
import MetricsBar from "./components/MetricsBar.vue";
import MaterialDonut from "./components/MaterialDonut.vue";
import CouplingCard from "./components/CouplingCard.vue";
import BranchGrid from "./components/BranchGrid.vue";
import HourlyChart from "./components/HourlyChart.vue";
import EvolutionChart from "./components/EvolutionChart.vue";

const { theme, toggle } = useTheme();

const TABS = [
  { id: "jour", label: "Jour J" },
  { id: "horaire", label: "Répartition horaire" },
  { id: "evolution", label: "Évolution" },
];

const view = ref(localStorage.getItem("rere_view") || "jour");
const date = ref(TODAY);
const period = ref(Number(localStorage.getItem("rere_period")) || 30);
watch(view, (v) => localStorage.setItem("rere_view", v));
watch(period, (p) => localStorage.setItem("rere_period", p));

const BRANCH_KEYS = ["Chelles", "Tournan", "Villiers", "Central"];
const BRANCH_LABELS = { Chelles: "Chelles", Tournan: "Tournan", Villiers: "Villiers", Central: "Central" };

const daily = ref(null);
const hourly = ref(null);
const evolution = ref(null);
const branchFilter = ref(null);
const error = ref("");

async function loadDay() {
  try {
    error.value = "";
    const [d, h] = await Promise.all([api.daily(date.value), api.hourly(date.value, branchFilter.value)]);
    daily.value = d;
    hourly.value = h;
  } catch (e) { error.value = e.message; }
}
async function loadEvolution() {
  try {
    evolution.value = await api.evolution(period.value, date.value);
  } catch (e) { error.value = e.message; }
}

watch(date, () => { loadDay(); loadEvolution(); }, { immediate: true });
watch(period, loadEvolution);
watch(branchFilter, loadDay);

// --- Indicateurs vue Horaire ---
const peak = computed(() => {
  if (!hourly.value || !hourly.value.length) return null;
  const byHour = {};
  hourly.value.forEach((r) => {
    byHour[r.heure] = byHour[r.heure] || { h: r.heure, total: 0, rerng: 0 };
    byHour[r.heure].total += r.total;
    if (r.materiel === "RER NG") byHour[r.heure].rerng += r.total;
  });
  return Object.values(byHour).reduce((a, b) => (b.total > a.total ? b : a));
});

// --- Indicateurs vue Évolution ---
const evoStats = computed(() => {
  if (!evolution.value || !evolution.value.length) return null;
  const first = evolution.value[0];
  const last = evolution.value[evolution.value.length - 1];
  const avg = Math.round(evolution.value.reduce((a, e) => a + e.pctRERNG, 0) / evolution.value.length);
  return {
    last,
    dRerng: last.pctRERNG - first.pctRERNG,
    dCoup: last.pctCoupled - first.pctCoupled,
    avg,
    n: evolution.value.length,
  };
});
</script>

<template>
  <div class="db-app" :data-theme="theme">
    <div class="db-shell">
      <header class="db-top">
        <div class="db-brand">
          <span class="db-tag">RER&nbsp;E</span>
          <span class="db-title">stats.composition</span>
          <span class="db-live"><i></i>collecte active</span>
        </div>
        <div class="db-top-right">
          <DatePicker v-model="date" />
          <button class="db-theme" @click="toggle" title="Basculer le thème">
            {{ theme === "dark" ? "☀" : "☾" }}
          </button>
        </div>
      </header>

      <nav class="db-tabs">
        <button
          v-for="t in TABS"
          :key="t.id"
          class="db-tab"
          :class="{ 'is-active': view === t.id }"
          @click="view = t.id"
        >
          <span class="db-tab-dot"></span>{{ t.label }}
        </button>
      </nav>

      <p v-if="error" class="db-error">⚠ {{ error }}</p>

      <!-- ===== Vue Jour J ===== -->
      <template v-if="view === 'jour' && daily">
        <MetricsBar :daily="daily" />
        <section class="db-row2">
          <MaterialDonut :material="daily.material" />
          <CouplingCard :coupling="daily.coupling" />
        </section>
        <BranchGrid :branches="daily.branches" />
      </template>

      <!-- ===== Vue Répartition horaire ===== -->
      <template v-else-if="view === 'horaire' && daily && hourly">
        <section class="db-panel db-metrics" v-if="peak">
          <div><div class="db-stat-v">{{ daily.resolved }}</div><div class="db-stat-l">circulations (status ok)</div></div>
          <div class="db-divider"></div>
          <div><div class="db-stat-v" style="color:var(--c-rerng)">{{ peak.h }}h</div><div class="db-stat-l">heure de pointe</div></div>
          <div><div class="db-stat-v">{{ peak.total }}</div><div class="db-stat-l">circ. à la pointe</div></div>
          <div class="db-divider"></div>
          <div><div class="db-stat-v" style="color:var(--c-nat)">{{ pct(peak.rerng, peak.total) }}%</div><div class="db-stat-l">% RER NG à la pointe</div></div>
        </section>
        <section class="db-panel db-chartcard">
          <div class="db-panel-h">
            // matériel par heure
            <span class="db-ph-right">
              <span class="db-period">
                <button :class="{ 'is-active': branchFilter === null }" @click="branchFilter = null">Toutes</button>
                <button v-for="b in BRANCH_KEYS" :key="b" :class="{ 'is-active': branchFilter === b }" @click="branchFilter = b">{{ BRANCH_LABELS[b] }}</button>
              </span>
            </span>
          </div>
          <HourlyChart :hourly="hourly" />
          <div class="db-foot-note">/api/stats/hourly{{ branchFilter ? '&branch=' + branchFilter : '' }} · une courbe par matériel (status = ok)</div>
        </section>
      </template>

      <!-- ===== Vue Évolution ===== -->
      <template v-else-if="view === 'evolution' && evolution && evoStats">
        <section class="db-panel">
          <div class="db-panel-h">
            // évolution sur période glissante
            <span class="db-ph-right" style="float:right">
              <span class="db-period">
                <button v-for="p in [7, 30, 90]" :key="p" :class="{ 'is-active': period === p }" @click="period = p">{{ p }} j</button>
              </span>
            </span>
          </div>
          <div class="db-evo-stats">
            <div class="db-evo-stat">
              <div class="db-evo-v" style="color:var(--c-rerng)">
                {{ evoStats.last.pctRERNG }}%
                <span class="db-trend" :class="evoStats.dRerng >= 0 ? 'up' : 'down'">
                  {{ evoStats.dRerng >= 0 ? "↗" : "↘" }} {{ evoStats.dRerng >= 0 ? "+" : "" }}{{ evoStats.dRerng }} pts
                </span>
              </div>
              <div class="db-evo-l">% RER NG — dernier jour (moy. {{ evoStats.avg }}%)</div>
            </div>
            <div class="db-divider" style="min-height:40px"></div>
            <div class="db-evo-stat">
              <div class="db-evo-v" style="color:var(--c-um)">
                {{ evoStats.last.pctCoupled }}%
                <span class="db-trend" :class="evoStats.dCoup >= 0 ? 'up' : 'down'">
                  {{ evoStats.dCoup >= 0 ? "↗" : "↘" }} {{ evoStats.dCoup >= 0 ? "+" : "" }}{{ evoStats.dCoup }} pts
                </span>
              </div>
              <div class="db-evo-l">% compositions couplées — dernier jour</div>
            </div>
          </div>
          <EvolutionChart :evolution="evolution" />
          <div class="db-foot-note">/api/stats/evolution?days={{ period }} · {{ evoStats.n }} points journaliers</div>
        </section>
      </template>

      <p v-else-if="!error" class="db-loading">Chargement…</p>
    </div>
  </div>
</template>

<style scoped>
.db-error { font-family: "IBM Plex Mono", monospace; color: var(--c-mi2n); padding: 14px; }
.db-loading { font-family: "IBM Plex Mono", monospace; color: var(--faint); padding: 40px; text-align: center; }
</style>
