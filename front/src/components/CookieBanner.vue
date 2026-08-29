<script setup>
import { useCookieConsent } from "../composables/useCookieConsent.js";

const emit = defineEmits(["legal"]);
const { decided, accept, refuse } = useCookieConsent();
</script>

<template>
  <div v-if="!decided" class="ckb-bar">
    <p class="ckb-text">
      Ce site utilise <strong>Matomo</strong>, un outil de mesure d'audience auto-hébergé,
      pour compter ses visites. Vos données ne sont ni partagées ni utilisées à des fins
      publicitaires.
      <button class="ckb-link" @click="emit('legal')">En savoir plus</button>
    </p>
    <div class="ckb-actions">
      <button class="ckb-btn ckb-refuse" @click="refuse">Refuser</button>
      <button class="ckb-btn ckb-accept" @click="accept">Accepter</button>
    </div>
  </div>
</template>

<style scoped>
.ckb-bar {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 90;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 16px;
  padding: 14px 20px;
  background: var(--panel);
  border-top: 1px solid var(--line2);
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.15);
}
.ckb-text {
  margin: 0; max-width: 640px; flex: 1 1 320px;
  font-size: 12px; line-height: 1.5; color: var(--dim);
}
.ckb-link {
  background: none; border: none; padding: 0; margin-left: 4px;
  font: inherit; color: var(--brand); text-decoration: underline; cursor: pointer;
}
.ckb-actions { display: flex; gap: 10px; flex-shrink: 0; }
.ckb-btn {
  font-family: "IBM Plex Mono", monospace; font-size: 12px; font-weight: 600;
  padding: 8px 16px; border-radius: 7px; cursor: pointer;
}
.ckb-refuse { background: var(--panel2); border: 1px solid var(--line2); color: var(--text); }
.ckb-refuse:hover { border-color: var(--dim); }
.ckb-accept { background: var(--brand); border: 1px solid var(--brand); color: #fff; }
.ckb-accept:hover { opacity: 0.9; }
</style>
