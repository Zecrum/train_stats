# RER E Stats — Dashboard (Vue 3 + Chart.js)

Visualisation des statistiques de composition du matériel roulant du RER E
(RER NG / NAT / MI2N), par branche et dans le temps. Front **Vue 3 (Composition API)**
+ **Chart.js**, API **Express / MySQL** en lecture seule.

## Arborescence

```
rer-e-dashboard/
├── api/                      # Node.js + Express + mysql2 (lecture seule)
│   ├── index.js              # point d'entrée + CORS
│   ├── db.js                 # pool MySQL
│   ├── routes/stats.js       # GET /daily, /hourly, /evolution
│   ├── schema.sql            # schéma + index attendus
│   └── .env.example
└── front/                    # Vue 3 + Vite + Chart.js
    ├── index.html
    ├── vite.config.js        # proxy /api -> :3051 en dev
    └── src/
        ├── main.js
        ├── App.vue           # état (date / vue / période / thème), orchestration
        ├── style.css         # thème clair + sombre (variables CSS)
        ├── api.js            # fetch natif
        ├── palette.js        # couleurs Chart.js par thème
        ├── utils.js          # dates FR, %, config matériels
        ├── composables/useTheme.js
        └── components/
            ├── DatePicker.vue
            ├── MetricsBar.vue
            ├── MaterialDonut.vue
            ├── CouplingCard.vue
            ├── BranchGrid.vue
            ├── HourlyChart.vue
            └── EvolutionChart.vue
```

## Lancement

### API
```bash
cd api
cp .env.example .env      # renseigner DB_USER / DB_PASSWORD
npm install
npm run dev               # http://localhost:3051
```

### Front
```bash
cd front
npm install
npm run dev               # http://localhost:5173 (proxy /api -> :3051)
```

En production : `npm run build` puis servir `front/dist/` via Nginx ou Express.
Pour pointer vers une autre API : définir `VITE_API_BASE` au build.

## Règle de comptage

Un train couplé compte comme **une seule circulation**. Le matériel et le
couplage (UM/US) sont résolus par le collecteur depuis `composition[0].commercialName`
et stockés en colonnes — l'API ne fait donc que des `GROUP BY` indexés.
Le matériel et le couplage sont calculés sur les circulations résolues (`status = 'ok'`).

## Endpoints

| Route | Paramètres | Réponse |
|-------|-----------|---------|
| `GET /api/stats/daily` | `date=YYYY-MM-DD` | totaux, matériel, couplage, détail par branche |
| `GET /api/stats/hourly` | `date=YYYY-MM-DD` | `[{ heure, materiel, total }]` |
| `GET /api/stats/evolution` | `days=30`, `end=YYYY-MM-DD` | `[{ date, pctRERNG, pctNAT, pctMI2N, pctCoupled }]` |

## Thème

Bascule clair / sombre via le bouton de l'en-tête, persistée en `localStorage`.
Les couleurs UI sont des variables CSS (`style.css`) ; Chart.js reçoit les valeurs
résolues correspondantes (`palette.js`) puisque `<canvas>` ne lit pas les variables CSS.
