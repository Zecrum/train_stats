<script setup>
import { ref, computed } from "vue";
import TrainDetailPanel from "./TrainDetailPanel.vue";

const props = defineProps({ trains: Array, date: String });

const selectedTrain = ref(null);
function openTrain(t) { selectedTrain.value = t; }
function closeTrain()  { selectedTrain.value = null; }

const BRANCH_ORDER  = ["Chelles", "Tournan", "Villiers", "Central"];
const BRANCH_LABELS = {
  Chelles:  "Chelles–Gournay",
  Tournan:  "Tournan",
  Villiers: "Villiers-sur-Marne",
  Central:  "Tronçon central",
};

const byBranch = computed(() => {
  const groups = {};
  for (const t of props.trains) {
    if (!groups[t.branch]) groups[t.branch] = { outbound: [], inbound: [] };
    (t.direction === "outbound" ? groups[t.branch].outbound : groups[t.branch].inbound).push(t);
  }
  return BRANCH_ORDER
    .filter((k) => groups[k])
    .map((k) => {
      const all = [...groups[k].outbound, ...groups[k].inbound];
      return {
        key:      k,
        label:    BRANCH_LABELS[k],
        short:    props.trains.find((t) => t.branch === k)?.branchShort || k,
        outbound: groups[k].outbound,
        inbound:  groups[k].inbound,
        canceled:  all.filter((t) => t.canceled).length,
        delayed:   all.filter((t) => !t.canceled && t.delayMinutes > 1).length,
        modified:  all.filter((t) => !t.canceled && t.modified).length,
      };
    });
});
</script>

<template>
  <TrainDetailPanel
    v-if="selectedTrain"
    :trainNumber="selectedTrain.trainNumber"
    :date="date"
    @close="closeTrain"
  />
  <div class="tl-root">
    <div v-for="grp in byBranch" :key="grp.key" class="tl-section">
      <div class="tl-head">
        <span class="tl-head-label">{{ grp.label }}</span>
        <div class="tl-head-right">
          <span v-if="grp.canceled"  class="tl-head-tag is-canceled">{{ grp.canceled }} supprimé{{ grp.canceled > 1 ? 's' : '' }}</span>
          <span v-if="grp.delayed"   class="tl-head-tag is-delayed">{{ grp.delayed }} en retard</span>
          <span v-if="grp.modified"  class="tl-head-tag is-modified">{{ grp.modified }} modifié{{ grp.modified > 1 ? 's' : '' }}</span>
          <span class="tl-head-count">{{ grp.outbound.length + grp.inbound.length }} trains</span>
        </div>
      </div>
      <div class="tl-columns">

        <div class="tl-col">
          <div class="tl-col-head is-out">→ {{ grp.short }}</div>
          <div
            v-for="t in grp.outbound" :key="t.trainNumber"
            class="tl-row" :class="{ 'is-canceled': t.canceled }" @click="openTrain(t)" role="button"
          >
            <span class="tl-times">{{ t.departureTime }}<span class="tl-arrow"> → </span>{{ t.arrivalTime }}</span>
            <span v-if="t.material" class="tl-mat" :class="`is-${t.material.toLowerCase()}`">{{ t.material }}</span>
            <span v-else class="tl-mat is-unknown">–</span>
            <span v-if="t.formation === 'us'" class="tl-form-badge">US</span>
            <span v-else class="tl-form-spacer"></span>
            <div class="tl-tags">
              <span v-if="t.canceled"                        class="tl-badge is-canceled">Annulé</span>
              <span v-if="!t.canceled && t.delayMinutes > 1" class="tl-badge is-delayed">+{{ t.delayMinutes }} min</span>
              <span v-if="!t.canceled && t.modified"         class="tl-badge is-modified">Modifié</span>
            </div>
          </div>
        </div>

        <div class="tl-sep"></div>

        <div class="tl-col">
          <div class="tl-col-head is-in">→ Paris</div>
          <div
            v-for="t in grp.inbound" :key="t.trainNumber"
            class="tl-row" :class="{ 'is-canceled': t.canceled }" @click="openTrain(t)" role="button"
          >
            <span class="tl-times">{{ t.departureTime }}<span class="tl-arrow"> → </span>{{ t.arrivalTime }}</span>
            <span v-if="t.material" class="tl-mat" :class="`is-${t.material.toLowerCase()}`">{{ t.material }}</span>
            <span v-else class="tl-mat is-unknown">–</span>
            <span v-if="t.formation === 'us'" class="tl-form-badge">US</span>
            <span v-else class="tl-form-spacer"></span>
            <div class="tl-tags">
              <span v-if="t.canceled"                        class="tl-badge is-canceled">Annulé</span>
              <span v-if="!t.canceled && t.delayMinutes > 1" class="tl-badge is-delayed">+{{ t.delayMinutes }} min</span>
              <span v-if="!t.canceled && t.modified"         class="tl-badge is-modified">Modifié</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<style scoped>
.tl-root { display: flex; flex-direction: column; gap: 14px; }

.tl-section {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.tl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--panel2);
}
.tl-head-label { font-family: "IBM Plex Mono", monospace; font-size: 12px; font-weight: 600; color: var(--fg); letter-spacing: 0.02em; }
.tl-head-right { display: flex; align-items: center; gap: 8px; }
.tl-head-count { font-family: "IBM Plex Mono", monospace; font-size: 11px; color: var(--faint); }
.tl-head-tag {
  font-family: "IBM Plex Mono", monospace;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
}
.tl-head-tag.is-canceled { background: var(--c-canceled); color: #fff; }
.tl-head-tag.is-delayed  { background: var(--c-delayed);  color: #fff; }
.tl-head-tag.is-modified { background: var(--c-modified); color: #fff; }

.tl-columns { display: flex; align-items: stretch; }

.tl-col { flex: 1; min-width: 0; }

.tl-sep { width: 1px; background: var(--border); flex-shrink: 0; }

.tl-col-head {
  font-family: "IBM Plex Mono", monospace;
  font-size: 11px;
  font-weight: 600;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
  letter-spacing: 0.04em;
}
.tl-col-head.is-out { color: var(--c-rerng); }
.tl-col-head.is-in  { color: var(--faint); }

.tl-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 7px;
  padding: 4px 12px;
  border-bottom: 1px solid var(--border);
  min-width: 0;
  cursor: pointer;
  transition: background 0.1s;
}
.tl-row:last-child { border-bottom: none; }
.tl-row:hover { background: var(--panel2); }
.tl-row.is-canceled { opacity: 0.45; }

.tl-times {
  font-family: "IBM Plex Mono", monospace;
  font-size: 11px;
  color: var(--fg);
  white-space: nowrap;
  flex-shrink: 0;
  min-width: 108px;
}
.tl-arrow { color: var(--faint); }

.tl-mat {
  font-family: "IBM Plex Mono", monospace;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 0;
  border-radius: 3px;
  flex-shrink: 0;
  width: 46px;
  text-align: center;
  letter-spacing: 0.03em;
}
.tl-mat.is-rerng   { background: var(--c-rerng); color: #fff; }
.tl-mat.is-nat     { background: var(--c-nat);   color: #fff; }
.tl-mat.is-mi2n    { background: var(--c-mi2n);  color: #fff; }
.tl-mat.is-unknown { color: var(--faint); }

.tl-form-badge {
  font-family: "IBM Plex Mono", monospace;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 0;
  border-radius: 3px;
  flex-shrink: 0;
  width: 28px;
  text-align: center;
  background: var(--panel2);
  color: var(--dim);
  border: 1px solid var(--border);
}
.tl-form-spacer { width: 28px; flex-shrink: 0; }

.tl-tags { display: flex; gap: 4px; flex-wrap: nowrap; flex-shrink: 0; }

.tl-badge {
  font-family: "IBM Plex Mono", monospace;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
  font-weight: 500;
  min-width: 56px;
  text-align: center;
}
.tl-badge.is-canceled { background: var(--c-canceled); color: #fff; }
.tl-badge.is-delayed  { background: var(--c-delayed);  color: #fff; }
.tl-badge.is-modified { background: var(--c-modified); color: #fff; }

@media (max-width: 600px) {
  .tl-head { flex-wrap: wrap; gap: 6px; }
  .tl-head-right { flex-wrap: wrap; gap: 5px; }

  .tl-columns { flex-direction: column; }

  .tl-sep { width: 100%; height: 1px; flex-shrink: 0; }

  .tl-col-head { font-size: 10px; padding: 5px 10px; }

  .tl-row { padding: 5px 10px; gap: 4px 5px; }

  .tl-times { font-size: 10px; min-width: 90px; }

  .tl-mat { width: 38px; font-size: 9px; }

  .tl-form-badge,
  .tl-form-spacer { width: 22px; }

  .tl-badge { font-size: 9px; padding: 1px 4px; }
}
</style>
