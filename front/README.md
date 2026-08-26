# front

Dashboard Vue 3 (Vite) qui consomme l'API REST pour visualiser la composition du matériel roulant, les retards et les perturbations du RER E.

> Documentation complète (fonctionnalités, structure des composants) : [README racine](../README.md).

## Lancement

```bash
npm install
npm run dev       # dev server Vite, proxy /api → http://localhost:3051
npm run build     # build de production dans dist/
npm run preview   # sert le build de dist/
```

## Qualité

```bash
npm run lint   # ESLint (+ eslint-plugin-vue)
npm test       # Vitest
```

## Fichiers principaux

| Fichier | Rôle |
|---|---|
| `src/App.vue` | Orchestration générale, onglets Jour/Période |
| `src/api.js` | Client fetch vers l'API REST (+ `api.admin.*`) |
| `src/utils.js` | Helpers de formatage de dates FR, pourcentages |
| `src/composables/useTheme.js` | Thème dark/light persisté en localStorage |
| `src/composables/useAdminAuth.js` | Token JWT admin persisté en localStorage |
| `src/components/` | Un composant par widget (donuts, graphes, grille par branche, panel admin...) |
