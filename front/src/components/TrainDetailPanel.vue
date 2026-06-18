<script setup>
import { computed, ref, watch, onMounted, onUnmounted } from "vue";
import { api } from "../api.js";

const props = defineProps({ trainNumber: String, date: String });
const emit  = defineEmits(["close"]);

const detail  = ref(null);
const loading = ref(false);
const error   = ref("");

async function load() {
  loading.value = true;
  error.value   = "";
  detail.value  = null;
  try {
    detail.value = await api.trainDetail(props.trainNumber, props.date);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

watch(() => props.trainNumber, load, { immediate: true });

function onKey(e) { if (e.key === "Escape") emit("close"); }
onMounted(()   => document.addEventListener("keydown", onKey));
onUnmounted(() => document.removeEventListener("keydown", onKey));

const sncfUrl = computed(() =>
  `https://www.sncf-connect.com/journeyTimelineDetails?number=${props.trainNumber}&departureDate=${props.date}`
);

function delayMin(sched, real) {
  if (!real || !sched) return null;
  const [sh, sm] = sched.split(":").map(Number);
  const [rh, rm] = real.split(":").map(Number);
  const d = (rh * 60 + rm) - (sh * 60 + sm);
  return d > 0 ? d : null;
}
</script>

<template>
  <div class="tdp-backdrop" @click.self="emit('close')">
    <div class="tdp-panel" role="dialog">

      <!-- ── En-tête ── -->
      <div class="tdp-header">
        <div class="tdp-hd-left">
          <span class="tdp-mission">{{ detail?.mission ?? '…' }}</span>
          <a v-if="detail" class="tdp-num" :href="sncfUrl" target="_blank" rel="noopener noreferrer">
            n°&nbsp;{{ detail.trainNumber }}&nbsp;↗
          </a>
        </div>

        <div class="tdp-hd-right">
          <template v-if="detail">
            <span class="tdp-mat-badge is-rerng" v-if="detail.material === 'RERNG'">RER NG</span>
            <span class="tdp-mat-badge is-nat"   v-else-if="detail.material === 'NAT'">NAT</span>
            <span class="tdp-mat-badge is-mi2n"  v-else-if="detail.material === 'MI2N'">MI2N</span>
            <span class="tdp-form-badge is-um" v-if="detail.formation === 'um'">UM</span>
            <span class="tdp-form-badge is-us" v-else-if="detail.formation === 'us'">US</span>
          </template>
          <button class="tdp-close" @click="emit('close')">✕</button>
        </div>
      </div>

      <!-- ── Badges statut (si perturbation) ── -->
      <div class="tdp-status-bar" v-if="detail && (detail.canceled || detail.modified || detail.delayMinutes)">
        <span v-if="detail.canceled"     class="tdp-stag is-canceled">Supprimé</span>
        <span v-if="detail.modified"     class="tdp-stag is-modified">Desserte modifiée</span>
        <span v-if="detail.delayMinutes" class="tdp-stag is-delayed">+{{ detail.delayMinutes }} min de retard</span>
      </div>

      <!-- ── Corps ── -->
      <div class="tdp-body">
        <div v-if="loading"                     class="tdp-empty">Chargement…</div>
        <div v-else-if="error"                  class="tdp-empty is-err">⚠ {{ error }}</div>
        <div v-else-if="!detail?.stops?.length" class="tdp-empty">Aucun arrêt disponible</div>

        <div v-else class="tdp-stops">
          <div
            v-for="(stop, idx) in detail.stops"
            :key="stop.position"
            class="tdp-stop"
            :class="{
              'is-terminus': idx === 0 || idx === detail.stops.length - 1,
              'is-deleted':  stop.isDeleted,
              'is-delayed':  stop.isDelayed && !stop.isDeleted,
            }"
          >
            <!-- Colonne 1 : timeline -->
            <div class="tdp-tl">
              <div class="tdp-tl-seg" v-if="idx > 0"></div>
              <div class="tdp-tl-dot"></div>
              <div class="tdp-tl-seg" v-if="idx < detail.stops.length - 1"></div>
            </div>

            <!-- Colonne 2 : nom de l'arrêt -->
            <div class="tdp-sname">{{ stop.station }}</div>

            <!-- Colonne 3 : heure(s) -->
            <div class="tdp-times">
              <template v-if="stop.isDeleted">
                <span class="tdp-pill is-del">supprimé</span>
              </template>
              <template v-else-if="delayMin(stop.scheduledTime, stop.realTime)">
                <span class="tdp-time is-old">{{ stop.scheduledTime }}</span>
                <span class="tdp-time is-real">{{ stop.realTime }}</span>
                <span class="tdp-pill is-late">+{{ delayMin(stop.scheduledTime, stop.realTime) }} min</span>
              </template>
              <template v-else>
                <span class="tdp-time">{{ stop.scheduledTime }}</span>
              </template>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<style scoped>
.tdp-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0,0,0,0.5);
  display: flex;
  justify-content: flex-end;
}

.tdp-panel {
  width: 400px;
  max-width: 100vw;
  height: 100%;
  background: var(--panel);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  animation: tdp-in 0.18s ease;
}
@keyframes tdp-in {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}

/* ── En-tête ── */
.tdp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.tdp-hd-left  { display: flex; flex-direction: column; gap: 4px; }
.tdp-hd-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.tdp-mission {
  font-family: "IBM Plex Mono", monospace;
  font-size: 22px;
  font-weight: 700;
  color: var(--fg);
  letter-spacing: 0.08em;
  line-height: 1;
}
.tdp-num {
  font-family: "IBM Plex Mono", monospace;
  font-size: 11px;
  color: var(--faint);
  text-decoration: none;
}
.tdp-num:hover { color: var(--fg); text-decoration: underline; }

.tdp-mat-badge {
  font-family: "IBM Plex Mono", monospace;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 6px;
  color: #fff;
  letter-spacing: 0.03em;
}
.tdp-mat-badge.is-rerng { background: var(--c-rerng); }
.tdp-mat-badge.is-nat   { background: var(--c-nat);   }
.tdp-mat-badge.is-mi2n  { background: var(--c-mi2n);  }

.tdp-form-badge {
  font-family: "IBM Plex Mono", monospace;
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 6px;
  letter-spacing: 0.03em;
}
.tdp-form-badge.is-um { background: var(--c-um); color: #fff; }
.tdp-form-badge.is-us { background: var(--panel2); color: var(--dim); border: 1px solid var(--border); }

.tdp-close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  color: var(--faint);
  padding: 5px 7px;
  border-radius: 4px;
  line-height: 1;
  margin-left: 4px;
}
.tdp-close:hover { color: var(--fg); background: var(--panel2); }

/* ── Barre de statut ── */
.tdp-status-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--panel2);
  flex-shrink: 0;
}
.tdp-stag {
  font-family: "IBM Plex Mono", monospace;
  font-size: 10px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
}
.tdp-stag.is-canceled { background: var(--c-canceled); color: #fff; }
.tdp-stag.is-delayed  { background: var(--c-delayed);  color: #fff; }
.tdp-stag.is-modified { background: var(--c-modified); color: #fff; }

/* ── Corps ── */
.tdp-body { flex: 1; overflow-y: auto; }
.tdp-empty {
  font-family: "IBM Plex Mono", monospace;
  font-size: 12px;
  color: var(--faint);
  text-align: center;
  padding: 48px 20px;
}
.tdp-empty.is-err { color: var(--c-canceled); }

/* ── Arrêts ── */
.tdp-stops { padding: 4px 0 24px; }

.tdp-stop {
  display: grid;
  grid-template-columns: 36px 1fr 120px;
  align-items: stretch;
}
.tdp-stop.is-deleted { opacity: 0.35; }

/* Timeline */
.tdp-tl {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.tdp-tl-seg {
  flex: 1;
  width: 2px;
  background: var(--border);
  min-height: 8px;
}
.tdp-tl-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid var(--faint);
  background: var(--panel);
  flex-shrink: 0;
}
.tdp-stop.is-terminus .tdp-tl-dot {
  width: 12px;
  height: 12px;
  background: var(--fg);
  border-color: var(--fg);
}
.tdp-stop.is-delayed:not(.is-terminus) .tdp-tl-dot { border-color: var(--c-delayed); }

/* Nom de l'arrêt */
.tdp-sname {
  font-size: 12px;
  color: var(--fg);
  padding: 10px 12px 10px 4px;
  align-self: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tdp-stop.is-terminus .tdp-sname { font-weight: 600; }

/* Colonne heures + badge retard */
.tdp-times {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 1px;
  padding: 8px 14px 8px 8px;
}
.tdp-time {
  font-family: "IBM Plex Mono", monospace;
  font-size: 12px;
  color: var(--dim);
}
.tdp-stop.is-terminus .tdp-times .tdp-time:not(.is-old) {
  color: var(--fg);
  font-weight: 600;
}
.tdp-time.is-old {
  font-size: 10px;
  color: var(--faint);
  text-decoration: line-through;
}
.tdp-time.is-real {
  font-family: "IBM Plex Mono", monospace;
  font-size: 12px;
  font-weight: 600;
  color: var(--c-delayed);
}

.tdp-pill {
  font-family: "IBM Plex Mono", monospace;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 10px;
  white-space: nowrap;
  margin-top: 2px;
}
.tdp-pill.is-late { background: var(--c-delayed);  color: #fff; }
.tdp-pill.is-del  { background: var(--c-canceled); color: #fff; }

@media (max-width: 600px) {
  .tdp-panel {
    width: 100vw;
    height: 92dvh;
    border-left: none;
    border-top: 1px solid var(--border);
    border-radius: 14px 14px 0 0;
    position: fixed;
    bottom: 0;
    left: 0;
    animation: tdp-in-mobile 0.22s ease;
  }
  @keyframes tdp-in-mobile {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
  .tdp-backdrop { align-items: flex-end; justify-content: center; }

  .tdp-header { padding: 12px 14px; }
  .tdp-mission { font-size: 18px; }

  .tdp-stop { grid-template-columns: 30px 1fr 100px; }
  .tdp-times { padding: 6px 10px 6px 6px; }
  .tdp-sname { font-size: 11px; padding: 8px 8px 8px 2px; }
}
</style>
