import { ref, computed } from "vue";
import { api, ADMIN_TOKEN_KEY } from "../api.js";

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
function lsDel(k) { try { localStorage.removeItem(k); } catch {} }

const token = ref(lsGet(ADMIN_TOKEN_KEY));

export function useAdminAuth() {
  const isAuthenticated = computed(() => !!token.value);

  async function login(password) {
    const { token: t } = await api.admin.login(password);
    token.value = t;
    lsSet(ADMIN_TOKEN_KEY, t);
  }

  function logout() {
    token.value = null;
    lsDel(ADMIN_TOKEN_KEY);
  }

  return { isAuthenticated, login, logout };
}
