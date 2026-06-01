import { ref, computed, watch } from "vue";
import { PALETTES } from "../palette.js";

// Thème clair/sombre, persisté en localStorage.
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }

const stored = lsGet("rere_theme");
const theme = ref(stored === "light" || stored === "dark" ? stored : "dark");

watch(theme, (t) => lsSet("rere_theme", t), { immediate: true });

export function useTheme() {
  const palette = computed(() => PALETTES[theme.value]);
  const toggle = () => { theme.value = theme.value === "dark" ? "light" : "dark"; };
  return { theme, palette, toggle };
}
