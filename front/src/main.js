import { createApp } from "vue";
import App from "./App.vue";
import VueMatomo from "vue-matomo";
import "./chartSetup.js";
import "./style.css";

const app = createApp(App);

// Désactivé hors trainstats.fr pour ne pas polluer les stats avec les sessions de dev local.
if (location.hostname.endsWith("trainstats.fr")) {
  // "requireConsent" doit être poussé dans _paq avant tout trackPageView, sinon ce
  // premier appel partirait sans consentement. Le bandeau (CookieBanner.vue) appelle
  // ensuite rememberConsentGiven/forgetConsentGiven — voir composables/useCookieConsent.js.
  window._paq = window._paq || [];
  window._paq.push(["requireConsent"]);

  app.use(VueMatomo, {
    host: "https://stats.zecrum.fr/",
    siteId: 1,
  });

  // vue-matomo ne déclenche trackPageView tout seul que via l'option `router`
  // (vue-router) — sans ça il se contente d'exposer $matomo, sans jamais tracker
  // la moindre vue. Cette app n'a pas de router (onglets en état local), donc on
  // déclenche la vue nous-mêmes ; une seule visite par chargement suffit ici.
  window._paq.push(["trackPageView"]);
}

app.mount("#app");
