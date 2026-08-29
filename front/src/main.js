import { createApp } from "vue";
import App from "./App.vue";
import VueMatomo from "vue-matomo";
import "./chartSetup.js";
import "./style.css";

const app = createApp(App);

// Pas de vue-router ici (navigation par onglets en état local) — trackInitialView
// (par défaut) suffit à compter la visite. Désactivé hors trainstats.fr pour ne
// pas polluer les stats avec les sessions de dev local.
if (location.hostname.endsWith("trainstats.fr")) {
  // "requireConsent" doit être poussé dans _paq AVANT que vue-matomo n'y ajoute
  // trackPageView, sinon ce premier appel partirait sans consentement. Le bandeau
  // (CookieBanner.vue) appelle ensuite setConsentGiven/forgetConsentGiven — voir
  // composables/useCookieConsent.js.
  window._paq = window._paq || [];
  window._paq.push(["requireConsent"]);

  app.use(VueMatomo, {
    host: "https://stats.zecrum.fr/",
    siteId: 1,
  });
}

app.mount("#app");
