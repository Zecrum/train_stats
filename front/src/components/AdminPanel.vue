<script setup>
import { ref, computed, onMounted, watch } from "vue";
import { api } from "../api.js";
import { TODAY } from "../utils.js";
import { useAdminAuth } from "../composables/useAdminAuth.js";
import DatePicker from "./DatePicker.vue";

const emit = defineEmits(["close"]);
const { isAuthenticated, login, logout } = useAdminAuth();

function sncfConnectUrl(r) {
  return `https://www.sncf-connect.com/journeyTimelineDetails?number=${r.trainNumber}&departureDate=${r.date}`;
}
function sncfVoyageursUrl(r) {
  return `https://www.sncf-voyageurs.com/api/bff/get-train-details/?dateCirculation=${r.date}&numeroCirculation=${r.trainNumber}&locale=fr`;
}
function transilienEquipUrl(r) {
  return `https://www.transilien.com/api/equipment/train?number=${r.trainNumber}&date=${r.date}`;
}

const linkPopFor = ref(null);
const linkPopPos = ref({ top: 0, left: 0 });
let closePopTimer = null;

function openLinkPop(e, r) {
  clearTimeout(closePopTimer);
  const rect = e.currentTarget.getBoundingClientRect();
  linkPopPos.value = { top: rect.bottom + 6, left: rect.left };
  linkPopFor.value = r;
}
function scheduleClosePop() {
  closePopTimer = setTimeout(() => { linkPopFor.value = null; }, 150);
}
function cancelClosePop() {
  clearTimeout(closePopTimer);
}

const password = ref("");
const loginError = ref("");
const loggingIn = ref(false);

async function onLogin() {
  loginError.value = "";
  loggingIn.value = true;
  try {
    await login(password.value);
    password.value = "";
    load();
  } catch {
    loginError.value = "Mot de passe incorrect.";
  } finally {
    loggingIn.value = false;
  }
}

function onLogout() {
  logout();
  rows.value = [];
}

// Token expiré/invalide (401) → on déconnecte et redemande le mot de passe,
// plutôt que d'afficher une erreur HTTP brute en boucle.
function handleApiError(e) {
  if (e.message.includes("401")) {
    onLogout();
    error.value = "Session expirée, reconnecte-toi.";
  } else {
    error.value = e.message;
  }
}

const dateFilter = ref(TODAY);
const rows = ref([]);
const loading = ref(false);
const error = ref("");
const daily = ref(null);

watch(dateFilter, load);

const collectStats = computed(() => {
  const d = daily.value?.disruptions;
  if (!d) return null;
  return {
    planned:      (d.detail_resolved || 0) + (d.detail_unknown || 0) + (d.detail_pending || 0),
    analyzed:     d.detail_resolved || 0,
    equipFailed:  (d.equipment_unknown || 0) - (d.equipment_unknown_canceled || 0),
    detailFailed: d.detail_unknown || 0,
    pending:      d.detail_pending || 0,
  };
});

async function load() {
  loading.value = true;
  error.value = "";
  try {
    const [unresolved, d] = await Promise.all([
      api.admin.unresolved(dateFilter.value || undefined),
      api.daily(dateFilter.value),
    ]);
    rows.value = unresolved;
    daily.value = d;
  } catch (e) {
    handleApiError(e);
  } finally {
    loading.value = false;
  }
}

async function retryEquipment(r) {
  try {
    await api.admin.retryEquipment(r.trainNumber, r.date);
    r.equipmentStatus = "pending";
    r.equipmentRetries = 0;
  } catch (e) { handleApiError(e); }
}

async function retryDetail(r) {
  try {
    await api.admin.retryDetail(r.trainNumber, r.date);
    r.detailStatus = "pending";
    r.detailRetries = 0;
  } catch (e) { handleApiError(e); }
}

const manualTrain = ref(null);
const manualError = ref("");
const manualForm = ref({ formation: "US", unit1: "RERNG", unit2: "RERNG" });

function openManual(r) {
  manualTrain.value = r;
  manualError.value = "";
  manualForm.value = { formation: "US", unit1: "RERNG", unit2: "RERNG" };
}

async function submitManual() {
  manualError.value = "";
  const f = manualForm.value;
  const units = f.formation === "UM"
    ? [{ rollingStock: f.unit1 }, { rollingStock: f.unit2 }]
    : [{ rollingStock: f.unit1 }];
  try {
    await api.admin.setEquipment({
      trainNumber: manualTrain.value.trainNumber,
      date: manualTrain.value.date,
      formation: f.formation,
      units,
    });
    manualTrain.value.equipmentStatus = "ok";
    manualTrain.value.formation = f.formation;
    manualTrain.value.material = f.unit1;
    manualTrain.value = null;
  } catch (e) {
    if (e.message.includes("401")) {
      manualTrain.value = null;
      handleApiError(e);
    } else {
      manualError.value = e.message;
    }
  }
}

onMounted(() => { if (isAuthenticated.value) load(); });
watch(isAuthenticated, (v) => { if (v) load(); });
</script>

<template>
  <div class="adm-overlay">
    <div class="adm-shell">
      <header class="adm-head">
        <span class="adm-head-title">🔒 Administration — équipement &amp; détail</span>
        <button class="adm-close" @click="emit('close')">✕</button>
      </header>

      <div v-if="!isAuthenticated" class="adm-login">
        <form @submit.prevent="onLogin">
          <input type="password" v-model="password" placeholder="Mot de passe" autofocus />
          <button type="submit" :disabled="loggingIn">Connexion</button>
        </form>
        <p v-if="loginError" class="adm-error">{{ loginError }}</p>
      </div>

      <div v-else class="adm-body">
        <p class="adm-note">⚠ Le collecteur doit être en cours d'exécution pour traiter les relances (reprise automatique sous ~1 min).</p>

        <section class="db-panel db-metrics" v-if="collectStats">
          <div><div class="db-stat-v">{{ collectStats.planned }}</div><div class="db-stat-l">circulations prévues</div></div>
          <div class="db-divider"></div>
          <div><div class="db-stat-v">{{ collectStats.analyzed }}</div><div class="db-stat-l">trajets analysés</div></div>
          <div><div class="db-stat-v" :class="{ 'v-canceled': collectStats.equipFailed > 0 }">{{ collectStats.equipFailed }}</div><div class="db-stat-l">échecs équipement (hors annulés)</div></div>
          <div><div class="db-stat-v" :class="{ 'v-canceled': collectStats.detailFailed > 0 }">{{ collectStats.detailFailed }}</div><div class="db-stat-l">échecs récupération trajet</div></div>
          <div class="db-divider"></div>
          <div><div class="db-stat-v" style="color:var(--faint)">{{ collectStats.pending }}</div><div class="db-stat-l">en attente (train pas encore passé)</div></div>
        </section>

        <div class="adm-toolbar">
          <DatePicker v-model="dateFilter" />
          <button class="adm-logout" @click="onLogout">Déconnexion</button>
        </div>

        <p v-if="loading" class="adm-loading">Chargement…</p>
        <p v-else-if="error" class="adm-error">⚠ {{ error }}</p>
        <p v-else-if="!rows.length" class="adm-loading">Rien à signaler 🎉</p>

        <div v-else class="adm-table-wrap">
          <table class="adm-table">
            <thead>
              <tr>
                <th>Train</th><th>Mission</th><th>Date</th><th>Départ</th><th>Arrivée</th>
                <th>Équipement</th><th>Détail</th><th>Matériel</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.trainNumber + r.date">
                <td>
                  <span
                    class="adm-link-trigger" tabindex="0"
                    @mouseenter="openLinkPop($event, r)" @mouseleave="scheduleClosePop"
                    @focus="openLinkPop($event, r)" @blur="scheduleClosePop"
                  >{{ r.trainNumber }} ▾</span>
                </td>
                <td>{{ r.mission }}</td>
                <td>{{ r.date }}</td>
                <td>{{ r.departureTime }}</td>
                <td>{{ r.arrivalTime }}</td>
                <td>
                  <span class="adm-status" :class="'is-' + r.equipmentStatus">{{ r.equipmentStatus }}</span>
                  <span v-if="r.equipmentRetries" class="adm-retries">({{ r.equipmentRetries }})</span>
                </td>
                <td>
                  <span class="adm-status" :class="'is-' + r.detailStatus">{{ r.detailStatus }}</span>
                  <span v-if="r.detailRetries" class="adm-retries">({{ r.detailRetries }})</span>
                </td>
                <td>{{ r.material || '–' }}{{ r.formation ? ' · ' + r.formation : '' }}</td>
                <td class="adm-actions">
                  <button @click="retryEquipment(r)" title="Relancer la collecte équipement">↻ Équip.</button>
                  <button @click="retryDetail(r)" title="Relancer la collecte détail">↻ Détail</button>
                  <button @click="openManual(r)" title="Saisir l'équipement manuellement">✎ Saisir</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          v-if="linkPopFor"
          class="adm-link-pop"
          :style="{ top: linkPopPos.top + 'px', left: linkPopPos.left + 'px' }"
          @mouseenter="cancelClosePop" @mouseleave="scheduleClosePop"
        >
          <a :href="sncfConnectUrl(linkPopFor)" target="_blank" rel="noopener noreferrer">SNCF Connect ↗</a>
          <a :href="sncfVoyageursUrl(linkPopFor)" target="_blank" rel="noopener noreferrer">SNCF Voyageurs (détail) ↗</a>
          <a :href="transilienEquipUrl(linkPopFor)" target="_blank" rel="noopener noreferrer">Transilien (équipement) ↗</a>
        </div>
      </div>

      <div v-if="manualTrain" class="adm-modal-backdrop" @click.self="manualTrain = null">
        <div class="adm-modal">
          <h3>Saisie manuelle — train {{ manualTrain.trainNumber }} ({{ manualTrain.date }})</h3>

          <label class="adm-field">
            Formation
            <select v-model="manualForm.formation">
              <option value="US">US (simple)</option>
              <option value="UM">UM (couplé)</option>
            </select>
          </label>

          <label class="adm-field">
            Matériel{{ manualForm.formation === 'UM' ? ' (unité 1)' : '' }}
            <select v-model="manualForm.unit1">
              <option value="RERNG">RER NG</option>
              <option value="NAT">NAT</option>
              <option value="MI2N">MI2N</option>
            </select>
          </label>

          <label class="adm-field" v-if="manualForm.formation === 'UM'">
            Matériel (unité 2)
            <select v-model="manualForm.unit2">
              <option value="RERNG">RER NG</option>
              <option value="NAT">NAT</option>
              <option value="MI2N">MI2N</option>
            </select>
          </label>

          <p v-if="manualError" class="adm-error">⚠ {{ manualError }}</p>

          <div class="adm-modal-actions">
            <button @click="manualTrain = null">Annuler</button>
            <button class="adm-primary" @click="submitManual">Enregistrer</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.adm-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: var(--bg);
  overflow-y: auto;
}
.adm-shell { max-width: 1200px; margin: 0 auto; padding: 22px 26px 60px; }

.adm-head {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 18px;
}
.adm-head-title { font-family: "IBM Plex Mono", monospace; font-size: 15px; font-weight: 600; color: var(--text); }
.adm-close {
  width: 32px; height: 32px; border: 1px solid var(--line2); background: var(--panel);
  color: var(--text); border-radius: 7px; cursor: pointer;
}
.adm-close:hover { border-color: var(--dim); }

.adm-login { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; max-width: 320px; margin-top: 60px; }
.adm-login form { display: flex; gap: 8px; }
.adm-login input {
  font-family: "IBM Plex Mono", monospace; font-size: 13px; padding: 9px 12px;
  border: 1px solid var(--line2); border-radius: 7px; background: var(--panel); color: var(--text);
}
.adm-login button, .adm-toolbar button, .adm-actions button, .adm-modal-actions button {
  font-family: "IBM Plex Mono", monospace; font-size: 12px; padding: 8px 14px;
  border: 1px solid var(--line2); border-radius: 7px; background: var(--panel); color: var(--text); cursor: pointer;
}
.adm-login button:hover, .adm-toolbar button:hover, .adm-actions button:hover { border-color: var(--dim); }

.v-canceled { color: var(--c-canceled); }

.adm-note {
  font-family: "IBM Plex Mono", monospace; font-size: 11px; color: var(--c-delayed);
  background: var(--panel2); border: 1px solid var(--line); border-radius: 7px; padding: 9px 12px; margin-bottom: 16px;
}

.adm-toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
.adm-logout { margin-left: auto; }

.adm-loading { font-family: "IBM Plex Mono", monospace; color: var(--faint); padding: 30px 0; text-align: center; }
.adm-error { font-family: "IBM Plex Mono", monospace; color: var(--c-canceled); font-size: 12px; margin-top: 8px; }

.adm-table-wrap { overflow-x: auto; }
.adm-table { width: 100%; border-collapse: collapse; font-size: 12px; }
.adm-table th, .adm-table td { padding: 8px 10px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
.adm-table th { font-family: "IBM Plex Mono", monospace; font-size: 10px; color: var(--faint); text-transform: uppercase; letter-spacing: .4px; }
.adm-table td { font-family: "IBM Plex Mono", monospace; color: var(--dim); }
.adm-link-trigger { cursor: pointer; color: var(--text); outline: none; }
.adm-link-trigger:hover, .adm-link-trigger:focus { color: var(--brand); }

.adm-link-pop {
  position: fixed;
  z-index: 120;
  display: flex;
  background: var(--panel);
  border: 1px solid var(--line2);
  border-radius: 8px;
  padding: 6px;
  box-shadow: 0 12px 32px rgba(0,0,0,0.28);
  flex-direction: column;
  gap: 2px;
  white-space: nowrap;
}
.adm-link-pop a {
  font-family: "IBM Plex Mono", monospace; font-size: 11px; color: var(--dim);
  text-decoration: none; padding: 6px 10px; border-radius: 5px;
}
.adm-link-pop a:hover { background: var(--panel2); color: var(--text); }

.adm-status { padding: 2px 7px; border-radius: 10px; font-weight: 600; font-size: 10px; }
.adm-status.is-unknown { background: var(--c-canceled); color: #fff; }
.adm-status.is-pending { background: var(--c-delayed); color: #fff; }
.adm-status.is-ok { background: var(--c-nat); color: #fff; }
.adm-retries { color: var(--faint); margin-left: 4px; }

.adm-actions { display: flex; gap: 5px; }
.adm-actions button { padding: 5px 9px; font-size: 11px; }

.adm-modal-backdrop {
  position: fixed; inset: 0; z-index: 110; background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
}
.adm-modal {
  background: var(--panel); border: 1px solid var(--line2); border-radius: 10px;
  padding: 22px; width: 320px; box-shadow: 0 12px 32px rgba(0,0,0,0.28);
}
.adm-modal h3 { font-size: 14px; margin: 0 0 16px; color: var(--text); }
.adm-field { display: flex; flex-direction: column; gap: 5px; font-family: "IBM Plex Mono", monospace; font-size: 11px; color: var(--dim); margin-bottom: 12px; }
.adm-field select {
  font-family: "IBM Plex Mono", monospace; font-size: 13px; padding: 7px 9px;
  border: 1px solid var(--line2); border-radius: 6px; background: var(--panel2); color: var(--text);
}
.adm-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
.adm-primary { background: var(--brand) !important; border-color: var(--brand) !important; color: #fff !important; }
</style>
