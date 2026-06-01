import { ref, computed, watch } from "vue";
import { PALETTES } from "../palette.js";

// Thème clair/sombre, persisté en localStorage.
const stored = localStorage.getItem("rere_theme");
const theme = ref(stored === "light" || stored === "dark" ? stored : "dark");

watch(theme, (t) => localStorage.setItem("rere_theme", t), { immediate: true });

export function useTheme() {
  const palette = computed(() => PALETTES[theme.value]);
  const toggle = () => { theme.value = theme.value === "dark" ? "light" : "dark"; };
  return { theme, palette, toggle };
}
