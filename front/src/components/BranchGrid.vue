<script setup>
import { computed } from "vue";
import { pct } from "../utils.js";
import { useTheme } from "../composables/useTheme.js";
import { MAT_COLOR } from "../palette.js";

const props = defineProps({ branches: Object });
const { palette } = useTheme();
const colors = computed(() => MAT_COLOR(palette.value));
const keys = ["RERNG", "NAT", "MI2N"];

const list = computed(() => Object.values(props.branches));
function matTotal(b) { return b.material.RERNG + b.material.NAT + b.material.MI2N; }
</script>

<template>
  <section class="db-panel">
    <div class="db-panel-h">détail par branche</div>
    <div class="db-branchgrid">
      <div v-for="b in list" :key="b.label" class="db-branch">
        <div class="db-branch-head">
          <div>
            <div class="db-branch-name">{{ b.label }}</div>
            <div class="db-branch-miss">{{ b.missions }}</div>
          </div>
          <div class="db-branch-total">{{ b.total }}</div>
        </div>
        <div class="db-matbar">
          <div
            v-for="k in keys"
            v-show="b.material[k] > 0"
            :key="k"
            class="db-matseg"
            :style="{ width: pct(b.material[k], matTotal(b)) + '%', background: colors[k] }"
          ></div>
        </div>
        <div class="db-branch-legend">
          <span v-for="k in keys" :key="k" class="db-bl">
            <i :style="{ background: colors[k] }"></i>{{ k === "RERNG" ? "NG" : k }} {{ pct(b.material[k], matTotal(b)) }}%
          </span>
          <span class="db-bl db-bl-coup">UM {{ pct(b.coupling.um, b.coupling.um + b.coupling.us) }}%</span>
        </div>
        <div class="db-branch-disrupt" v-if="b.canceled || b.delayed || b.modified">
          <span v-if="b.canceled" class="db-bdtag is-canceled">{{ b.canceled }} supprimé{{ b.canceled > 1 ? 's' : '' }}</span>
          <span v-if="b.delayed"  class="db-bdtag is-delayed">{{ b.delayed }} en retard</span>
          <span v-if="b.modified" class="db-bdtag is-modified">{{ b.modified }} modifié{{ b.modified > 1 ? 's' : '' }}</span>
        </div>
      </div>
    </div>
  </section>
</template>
