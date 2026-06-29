<script setup>
import { ref, computed, watch } from "vue";
import { api } from "./api.js";
import { TODAY, fmtLong, pct } from "./utils.js";
import { useTheme } from "./composables/useTheme.js";

import DatePicker from "./components/DatePicker.vue";
import MaterialDonut from "./components/MaterialDonut.vue";
import CouplingCard from "./components/CouplingCard.vue";
import BranchGrid from "./components/BranchGrid.vue";
import HourlyChart from "./components/HourlyChart.vue"
import HourlyDisruptionChart from "./components/HourlyDisruptionChart.vue";
import HourlyTotalDelayChart from "./components/HourlyTotalDelayChart.vue";
import TrainList from "./components/TrainList.vue";
import EvolutionChart from "./components/EvolutionChart.vue";
import DisruptionBar from "./components/DisruptionBar.vue";
import DisruptionChart from "./components/DisruptionChart.vue";
import AdminPanel from "./components/AdminPanel.vue";

const { theme, toggle } = useTheme();
const showAdmin = ref(false);

const appVersion = __APP_VERSION__;

const DAY_TABS = [
  { id: "jour",          label: "Jour J" },
  { id: "trains",        label: "Trains" },
  { id: "horaire",       label: "Répartition horaire" },
];
const PERIOD_TABS = [
  { id: "evolution",     label: "Évolution" },
  { id: "perturbations", label: "Perturbations" },
];

function lsGet(k, fb) { try { return localStorage.getItem(k) ?? fb; } catch { return fb; } }
function lsSet(k, v)  { try { localStorage.setItem(k, v); } catch {} }

const view = ref("jour");
const date = ref(TODAY);
const period = ref(Number(lsGet("rere_period", "7")) || 7);
watch(period, (p) => lsSet("rere_period", p));

const BRANCH_KEYS = ["Chelles", "Tournan", "Villiers", "Central"];

const daily = ref(null);
const hourly = ref(null);
const hourlyDisruptions = ref(null);
const trainsDay = ref(null);
const evolution = ref(null);
const disruptions = ref(null);
const branchFilter = ref(null);
const error = ref("");
const loading = ref(false);

let _inFlight = 0;
function startLoad() { if (++_inFlight > 0) loading.value = true; }
function endLoad()   { if (--_inFlight <= 0) { _inFlight = 0; loading.value = false; } }

async function loadDay() {
  startLoad();
  try {
    error.value = "";
    const [d, h, hd, td] = await Promise.all([
      api.daily(date.value),
      api.hourly(date.value, branchFilter.value),
      api.hourlyDisruptions(date.value),
      api.trainsDay(date.value),
    ]);
    daily.value = d;
    hourly.value = h;
    hourlyDisruptions.value = hd;
    trainsDay.value = td;
  } catch (e) { error.value = e.message; }
  finally { endLoad(); }
}
async function loadEvolution() {
  startLoad();
  try {
    evolution.value = await api.evolution(period.value, date.value);
  } catch (e) { error.value = e.message; }
  finally { endLoad(); }
}
async function loadDisruptions() {
  startLoad();
  try {
    disruptions.value = await api.disruptions(period.value, date.value);
  } catch (e) { error.value = e.message; }
  finally { endLoad(); }
}

watch(date, () => { loadDay(); loadEvolution(); loadDisruptions(); }, { immediate: true });
watch(period, () => { loadEvolution(); loadDisruptions(); });
watch(branchFilter, loadDay);

// --- Indicateurs vue Horaire ---
// slot = index de tranche de 15 min (0 = 0h00, 28 = 7h00, 39 = 9h45, 64 = 16h00, 79 = 19h45)
const PEAK_MORNING = [28, 39];
const PEAK_EVENING = [64, 79];

const peakStats = computed(() => {
  if (!hourly.value || !hourly.value.length) return null;
  // Retourne le pic (max trains simultanés) dans la plage de slots donnée.
  function peakMax(minSlot, maxSlot) {
    const bySlot = {};
    hourly.value.forEach((r) => {
      if (r.slot < minSlot || r.slot > maxSlot) return;
      if (!bySlot[r.slot]) bySlot[r.slot] = { total: 0, rerng: 0 };
      bySlot[r.slot].total += r.total;
      if (r.materiel === "RERNG") bySlot[r.slot].rerng += r.total;
    });
    return Object.values(bySlot).reduce(
      (best, s) => (s.total > best.total ? s : best),
      { total: 0, rerng: 0 }
    );
  }
  return { morning: peakMax(...PEAK_MORNING), evening: peakMax(...PEAK_EVENING) };
});

// --- Indicateurs vue Perturbations ---
const disruptionStats = computed(() => {
  if (!disruptions.value?.evolution?.length) return null;
  const evo = disruptions.value.evolution;
  const n = evo.length;
  const avgCanceled  = Math.round(evo.reduce((a, d) => a + (d.total ? 100 * d.canceled  / d.total : 0), 0) / n);
  const avgDelayed   = Math.round(evo.reduce((a, d) => a + (d.total ? 100 * d.delayed   / d.total : 0), 0) / n);
  const avgModified  = Math.round(evo.reduce((a, d) => a + (d.total ? 100 * d.modified  / d.total : 0), 0) / n);
  const withDelay    = evo.filter((d) => d.median_delay != null);
  const medianDelay  = withDelay.length ? Math.round(withDelay.reduce((a, d) => a + d.median_delay, 0) / withDelay.length) : null;
  return { n, avgCanceled, avgDelayed, avgModified, medianDelay };
});
const distribBuckets = computed(() => {
  if (!disruptions.value?.distribution) return [];
  const d = disruptions.value.distribution;
  return [
    { key: "d3_5",    label: "3–5 min",   count: d.d3_5    },
    { key: "d6_10",   label: "6–10 min",  count: d.d6_10   },
    { key: "d11_20",  label: "11–20 min", count: d.d11_20  },
    { key: "d20plus", label: "> 20 min",  count: d.d20plus },
  ];
});
const distribMax = computed(() => Math.max(1, ...distribBuckets.value.map((b) => b.count)));

// --- Breakdowns Perturbations ---
const DOW_ORDER  = [2, 3, 4, 5, 6, 7, 1]; // lun → dim
const DOW_LABELS = { 1: "dim.", 2: "lun.", 3: "mar.", 4: "mer.", 5: "jeu.", 6: "ven.", 7: "sam." };

function toBreakdown(rows, keyFn) {
  const mapped = rows.map((r) => ({
    ...keyFn(r),
    pctDelayed:  r.total > 0 ? Math.round(100 * r.delayed  / r.total) : 0,
    pctCanceled: r.total > 0 ? Math.round(100 * r.canceled / r.total) : 0,
  }));
  const maxD = Math.max(1, ...mapped.map((r) => r.pctDelayed));
  return mapped.map((r) => ({ ...r, barW: Math.round(100 * r.pctDelayed / maxD) }));
}

const byWeekday = computed(() => {
  if (!disruptions.value?.byWeekday?.length) return [];
  const map = Object.fromEntries(disruptions.value.byWeekday.map((r) => [r.dow, r]));
  return toBreakdown(
    DOW_ORDER.filter((d) => map[d]).map((d) => ({ ...map[d], _label: DOW_LABELS[d] })),
    (r) => ({ label: r._label })
  );
});

const byBranch = computed(() =>
  disruptions.value?.byBranch?.length
    ? toBreakdown(disruptions.value.byBranch, (r) => ({ label: r.label }))
    : []
);

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
          <span class="db-title">Transilien Stats</span>
        </div>
        <div class="db-top-right">
          <DatePicker v-model="date" />
          <button class="db-theme" @click="toggle" title="Basculer le thème">
            {{ theme === "dark" ? "☀" : "☾" }}
          </button>
          <button class="db-theme" @click="showAdmin = true" title="Administration">🔒</button>
        </div>
      </header>

      <AdminPanel v-if="showAdmin" @close="showAdmin = false" />

      <nav class="db-tabs">
        <div class="db-tabgroup">
          <span class="db-tabgroup-label">Jour</span>
          <button
            v-for="t in DAY_TABS"
            :key="t.id"
            class="db-tab"
            :class="{ 'is-active': view === t.id }"
            @click="view = t.id"
          >
            <span class="db-tab-dot"></span>{{ t.label }}
          </button>
        </div>
        <div class="db-tabs-sep"></div>
        <div class="db-tabgroup">
          <span class="db-tabgroup-label">Période</span>
          <button
            v-for="t in PERIOD_TABS"
            :key="t.id"
            class="db-tab"
            :class="{ 'is-active': view === t.id }"
            @click="view = t.id"
          >
            <span class="db-tab-dot"></span>{{ t.label }}
          </button>
        </div>
      </nav>

      <div class="db-loader" :class="{ 'is-active': loading }"><div class="db-loader-bar"></div></div>

      <div :class="{ 'db-content-loading': loading }">
      <p v-if="error" class="db-error">⚠ {{ error }}</p>

      <!-- ===== Vue Jour J ===== -->
      <template v-if="view === 'jour' && daily">
        <DisruptionBar v-if="daily.disruptions?.detail_total" :disruptions="daily.disruptions" />
        <section class="db-row2">
          <MaterialDonut :material="daily.material" />
          <CouplingCard :coupling="daily.coupling" />
        </section>
        <BranchGrid :branches="daily.branches" />
      </template>

      <!-- ===== Vue Trains ===== -->
      <template v-else-if="view === 'trains' && trainsDay">
        <section class="db-panel">
          <div class="db-panel-h">// trains du jour · par branche · heure de départ</div>
          <TrainList :trains="trainsDay" :date="date" />
          <div class="db-foot-note">/api/stats/trains-day · trains avec équipement résolu · source SNCF Connect pour perturbations</div>
        </section>
      </template>

      <!-- ===== Vue Répartition horaire ===== -->
      <template v-else-if="view === 'horaire' && daily && hourly">
        <section class="db-panel db-metrics" v-if="peakStats">
          <div><div class="db-stat-v">{{ daily.resolved }}</div><div class="db-stat-l">circulations (status ok)</div></div>
          <div class="db-divider"></div>
          <div><div class="db-stat-v" style="color:var(--c-rerng)">{{ peakStats.morning.total }}</div><div class="db-stat-l">max simultané · pointe matin 7h–9h</div></div>
          <div><div class="db-stat-v">{{ pct(peakStats.morning.rerng, peakStats.morning.total) }}%</div><div class="db-stat-l">% RER NG au pic matin</div></div>
          <div class="db-divider"></div>
          <div><div class="db-stat-v" style="color:var(--c-rerng)">{{ peakStats.evening.total }}</div><div class="db-stat-l">max simultané · pointe soir 16h–19h</div></div>
          <div><div class="db-stat-v">{{ pct(peakStats.evening.rerng, peakStats.evening.total) }}%</div><div class="db-stat-l">% RER NG au pic soir</div></div>
        </section>
        <section class="db-panel db-chartcard">
          <div class="db-panel-h">
            // matériel par heure
            <span class="db-ph-right">
              <span class="db-period">
                <button :class="{ 'is-active': branchFilter === null }" @click="branchFilter = null">Toutes</button>
                <button v-for="b in BRANCH_KEYS" :key="b" :class="{ 'is-active': branchFilter === b }" @click="branchFilter = b">{{ b }}</button>
              </span>
            </span>
          </div>
          <HourlyChart :hourly="hourly" />
          <div class="db-foot-note">/api/stats/hourly{{ branchFilter ? '?branch=' + branchFilter : '' }} · trains en circulation par tranche de 15 min (status = ok)</div>
        </section>
        <section class="db-panel db-chartcard" style="margin-top:14px" v-if="hourlyDisruptions?.length">
          <div class="db-panel-h">// perturbations dans la journée</div>
          <HourlyDisruptionChart :data="hourlyDisruptions" />
          <div class="db-foot-note">/api/stats/hourly-disruptions · par heure de départ · source SNCF Connect</div>
        </section>
        <section class="db-panel db-chartcard" style="margin-top:14px" v-if="hourlyDisruptions?.some(r => r.total_delay > 0)">
          <div class="db-panel-h">// retard cumulé dans la journée</div>
          <HourlyTotalDelayChart :data="hourlyDisruptions" />
          <div class="db-foot-note">/api/stats/hourly-disruptions · somme des retards par tranche · source SNCF Connect</div>
        </section>
      </template>

      <!-- ===== Vue Évolution ===== -->
      <template v-else-if="view === 'evolution' && evolution && evoStats">
        <section class="db-panel">
          <div class="db-panel-h">
            // évolution sur période glissante
            <span class="db-ph-right">
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

      <!-- ===== Vue Perturbations ===== -->
      <template v-else-if="view === 'perturbations' && disruptions">
        <section class="db-panel db-metrics" v-if="disruptionStats">
          <div>
            <div class="db-stat-v">{{ disruptionStats.n }} j</div>
            <div class="db-stat-l">
              <span class="db-period" style="margin-top:4px">
                <button v-for="p in [7, 30, 90]" :key="p" :class="{ 'is-active': period === p }" @click="period = p">{{ p }} j</button>
              </span>
            </div>
          </div>
          <div class="db-divider"></div>
          <div><div class="db-stat-v" style="color:var(--c-canceled)">{{ disruptionStats.avgCanceled }}%</div><div class="db-stat-l">supprimés (moy. journalière)</div></div>
          <div><div class="db-stat-v" style="color:var(--c-delayed)">{{ disruptionStats.avgDelayed }}%</div><div class="db-stat-l">en retard ≥ 3 min (moy. journalière)</div></div>
          <div><div class="db-stat-v" style="color:var(--c-modified)">{{ disruptionStats.avgModified }}%</div><div class="db-stat-l">parcours modifiés (moy. journalière)</div></div>
          <div class="db-divider"></div>
          <div><div class="db-stat-v">{{ disruptionStats.medianDelay ? disruptionStats.medianDelay + ' min' : '–' }}</div><div class="db-stat-l">retard médian (trains retardés)</div></div>
        </section>

        <section class="db-panel db-chartcard" v-if="disruptions?.evolution">
          <div class="db-panel-h">// taux de perturbation par jour</div>
          <DisruptionChart :evolution="disruptions.evolution" />
          <div class="db-foot-note">/api/stats/disruptions?days={{ period }} · {{ disruptionStats?.n || 0 }} jours · source SNCF Connect/Voyageurs</div>
        </section>

        <div class="db-row2">
          <section class="db-panel">
            <div class="db-panel-h">// distribution des retards (période)</div>
            <div v-if="distribBuckets.some(b => b.count > 0)" class="db-distrib">
              <div class="db-distrib-row" v-for="b in distribBuckets" :key="b.key">
                <span class="db-distrib-label">{{ b.label }}</span>
                <div class="db-distrib-bar"><div class="db-distrib-fill" :style="{ width: pct(b.count, distribMax) + '%' }"></div></div>
                <span class="db-distrib-count">{{ b.count }}</span>
              </div>
            </div>
            <p v-else class="db-loading">Aucun retard sur la période</p>
          </section>
          <section class="db-panel">
            <div class="db-panel-h">// arrêts les plus touchés par les retards</div>
            <div v-if="disruptions.stations.length" class="db-stations">
              <div class="db-station-row" v-for="(s, i) in disruptions.stations" :key="s.station">
                <span class="db-station-rank">{{ i + 1 }}.</span>
                <span class="db-station-name">{{ s.station }}</span>
                <div class="db-station-bar"><div class="db-station-fill" :style="{ width: pct(s.delayed_stops, disruptions.stations[0].delayed_stops) + '%' }"></div></div>
                <span class="db-station-count">{{ s.delayed_stops }}</span>
              </div>
            </div>
            <p v-else class="db-loading">Aucune donnée sur la période</p>
          </section>
        </div>

        <!-- Jour de semaine + Branche -->
        <div class="db-row2">
          <section class="db-panel">
            <div class="db-panel-h">// ponctualité par jour de semaine</div>
            <div v-if="byWeekday.length" class="db-breakdown">
              <div class="db-bk-row" v-for="r in byWeekday" :key="r.label">
                <span class="db-bk-label" :title="r.label">{{ r.label }}</span>
                <div class="db-bk-bar" title="proportionnel au taux de retard"><div class="db-bk-fill" :style="{ width: r.barW + '%' }"></div></div>
                <span class="db-bk-val" title="en retard ≥ 3 min">{{ r.pctDelayed }}%</span>
                <span class="db-bk-val2" title="supprimés">{{ r.pctCanceled }}% sup.</span>
              </div>
            </div>
            <p v-else class="db-loading">Aucune donnée</p>
          </section>
          <section class="db-panel">
            <div class="db-panel-h">// ponctualité par branche</div>
            <div v-if="byBranch.length" class="db-breakdown">
              <div class="db-bk-row" v-for="r in byBranch" :key="r.label">
                <span class="db-bk-label" :title="r.label">{{ r.label }}</span>
                <div class="db-bk-bar" title="proportionnel au taux de retard"><div class="db-bk-fill" :style="{ width: r.barW + '%' }"></div></div>
                <span class="db-bk-val" title="en retard ≥ 3 min">{{ r.pctDelayed }}%</span>
                <span class="db-bk-val2" title="supprimés">{{ r.pctCanceled }}% sup.</span>
              </div>
            </div>
            <p v-else class="db-loading">Aucune donnée</p>
          </section>
        </div>


      </template>

      <p v-else-if="!error && !loading" class="db-loading">Chargement…</p>
      </div>

      <footer class="db-version">v{{ appVersion }}</footer>
    </div>
  </div>
</template>

<style scoped>
.db-error   { font-family: "IBM Plex Mono", monospace; color: var(--c-mi2n); padding: 14px; }
.db-loading { font-family: "IBM Plex Mono", monospace; color: var(--faint); padding: 40px; text-align: center; }

.db-loader { height: 2px; overflow: hidden; }
.db-loader-bar { height: 100%; background: var(--c-rerng); width: 40%; transform: translateX(-100%); }
.db-loader.is-active .db-loader-bar { animation: db-load 1.1s ease-in-out infinite; }
@keyframes db-load {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}

.db-content-loading { opacity: 0.5; transition: opacity 0.15s; pointer-events: none; }

.db-distrib { display: flex; flex-direction: column; gap: 8px; margin-top: 4px; }
.db-distrib-row { display: flex; align-items: center; gap: 10px; }
.db-distrib-label { font-family: "IBM Plex Mono", monospace; font-size: 11px; color: var(--dim); min-width: 70px; }
.db-distrib-bar { flex: 1; height: 10px; background: var(--panel2); border-radius: 3px; overflow: hidden; }
.db-distrib-fill { height: 100%; background: var(--c-delayed); border-radius: 3px; }
.db-distrib-count { font-family: "IBM Plex Mono", monospace; font-size: 11px; color: var(--faint); min-width: 36px; text-align: right; }

.db-stations { display: flex; flex-direction: column; gap: 7px; }
.db-station-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
.db-station-rank { font-family: "IBM Plex Mono", monospace; font-size: 11px; color: var(--faint); min-width: 20px; }
.db-station-name { font-size: 12px; flex: 2; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.db-station-bar { flex: 1; height: 7px; background: var(--panel2); border-radius: 3px; overflow: hidden; min-width: 40px; }
.db-station-fill { height: 100%; background: var(--c-canceled); border-radius: 3px; }
.db-station-count { font-family: "IBM Plex Mono", monospace; font-size: 11px; color: var(--faint); min-width: 36px; text-align: right; }

.db-breakdown   { display: flex; flex-direction: column; gap: 7px; margin-top: 4px; }
.db-bk-row      { display: flex; align-items: center; gap: 8px; }
.db-bk-label    { font-family: "IBM Plex Mono", monospace; font-size: 11px; color: var(--dim); width: 140px; flex-shrink: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.db-bk-bar      { flex: 1; height: 8px; background: var(--panel2); border-radius: 3px; overflow: hidden; }
.db-bk-fill     { height: 100%; background: var(--c-delayed); border-radius: 3px; transition: width 0.4s ease; }
.db-bk-val      { font-family: "IBM Plex Mono", monospace; font-size: 11px; color: var(--faint); min-width: 32px; text-align: right; }
.db-bk-val2     { font-family: "IBM Plex Mono", monospace; font-size: 10px; color: var(--c-canceled); min-width: 54px; text-align: right; }

.db-version { font-family: "IBM Plex Mono", monospace; font-size: 10px; color: var(--faint); text-align: center; margin-top: 24px; opacity: 0.6; }


</style>
