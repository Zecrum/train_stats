import { ref, computed } from "vue";

function hasConsentCookie() {
  try {
    return document.cookie.split("; ").some((c) => c.startsWith("mtm_consent="));
  } catch { return false; }
}

// "accepted" s'appuie sur le cookie mtm_consent posé par Matomo (setConsentGiven) —
// sa durée de vie est donc alignée sur celle configurée dans Matomo, pas sur une
// valeur qu'on inventerait nous-mêmes ; s'il expire, on retombe sur null et le
// bandeau se réaffiche. "refused" n'est volontairement PAS persisté : on redemande
// à chaque nouvelle visite plutôt que de mémoriser un refus indéfiniment.
const decision = ref(hasConsentCookie() ? "accepted" : null);

export function useCookieConsent() {
  const decided = computed(() => decision.value === "accepted" || decision.value === "refused");

  function accept() {
    // rememberConsentGiven (pas setConsentGiven, qui ne vaut que pour ce chargement
    // de page) pose le cookie mtm_consent — c'est lui qui persiste le consentement.
    window._paq?.push(["rememberConsentGiven"]);
    decision.value = "accepted";
  }

  function refuse() {
    window._paq?.push(["forgetConsentGiven"]);
    decision.value = "refused";
  }

  // Rouvre le bandeau (ex. depuis les Mentions légales) pour changer d'avis.
  function reset() {
    decision.value = null;
  }

  return { decision, decided, accept, refuse, reset };
}
