<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import { TODAY, addDays } from "../utils.js";

const props = defineProps({ modelValue: String });
const emit = defineEmits(["update:modelValue"]);

const MIN = "2026-01-01";
const open = ref(false);
const root = ref(null);

const WD = ["lun", "mar", "mer", "jeu", "ven", "sam", "dim"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
  "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

const sel = computed(() => new Date(props.modelValue + "T12:00:00"));
const view = ref({ y: 0, m: 0 });
function syncView() { view.value = { y: sel.value.getFullYear(), m: sel.value.getMonth() }; }
syncView();

const isToday = computed(() => props.modelValue === TODAY);
const dayName = computed(() => JOURS[sel.value.getDay()]);

function ymd(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const cells = computed(() => {
  const first = new Date(view.value.y, view.value.m, 1);
  const startWd = (first.getDay() + 6) % 7;
  const dim = new Date(view.value.y, view.value.m + 1, 0).getDate();
  const out = [];
  for (let i = 0; i < startWd; i++) out.push(null);
  for (let d = 1; d <= dim; d++) out.push(d);
  return out;
});
const monthFirst = computed(() => ymd(view.value.y, view.value.m, 1));
const monthLast = computed(() => ymd(view.value.y, view.value.m, new Date(view.value.y, view.value.m + 1, 0).getDate()));
const canPrev = computed(() => monthFirst.value > MIN);
const canNext = computed(() => monthLast.value < TODAY);

function shift(n) {
  let m = view.value.m + n, y = view.value.y;
  if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
  view.value = { y, m };
}
function cellDate(d) { return ymd(view.value.y, view.value.m, d); }
function disabled(d) { const ds = cellDate(d); return ds > TODAY || ds < MIN; }
function pick(d) {
  if (disabled(d)) return;
  emit("update:modelValue", cellDate(d));
  open.value = false;
}
function step(n) {
  const next = addDays(props.modelValue, n);
  if (next < MIN || next > TODAY) return;
  emit("update:modelValue", next);
  syncView();
}
function toggle() { if (!open.value) syncView(); open.value = !open.value; }

function onDoc(e) { if (root.value && !root.value.contains(e.target)) open.value = false; }
onMounted(() => document.addEventListener("mousedown", onDoc));
onUnmounted(() => document.removeEventListener("mousedown", onDoc));
</script>

<template>
  <div class="db-datepick" ref="root">
    <button class="db-dp-btn" :disabled="modelValue <= MIN" @click="step(-1)" title="Jour précédent">‹</button>
    <div class="db-dp-center" @click="toggle">
      <div class="db-dp-date">{{ modelValue.replaceAll("-", "‑") }}</div>
      <div class="db-dp-day">{{ isToday ? "aujourd'hui · " : "" }}{{ dayName }}</div>
    </div>
    <button class="db-dp-btn" :disabled="isToday" @click="step(1)" title="Jour suivant">›</button>

    <div v-if="open" class="db-dp-pop" @click.stop>
      <div class="db-cal-head">
        <button class="db-cal-nav" :disabled="!canPrev" @click="shift(-1)">‹</button>
        <div class="db-cal-title">{{ MOIS[view.m] }} {{ view.y }}</div>
        <button class="db-cal-nav" :disabled="!canNext" @click="shift(1)">›</button>
      </div>
      <div class="db-cal-grid">
        <div v-for="w in WD" :key="w" class="db-cal-wd">{{ w }}</div>
        <template v-for="(d, i) in cells" :key="i">
          <div v-if="d === null" class="db-cal-cell is-empty"></div>
          <button
            v-else
            class="db-cal-cell"
            :class="{ 'is-sel': cellDate(d) === modelValue }"
            :disabled="disabled(d)"
            @click="pick(d)"
          >{{ d }}</button>
        </template>
      </div>
    </div>
  </div>
</template>
