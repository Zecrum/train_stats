# Transilien Stats

Interface web de visualisation des statistiques de composition du matériel roulant du RER E, alimentée par une API REST Node.js connectée à la base MySQL du collecteur Transilien.

---

## Architecture générale

```
┌─────────────────────────────────────────────────┐
│                   VPS                           │
│                                                 │
│  ┌──────────────┐      ┌──────────────────────┐ │
│  │  Collecteur  │─────▶│     Base MySQL        │ │
│  │  (Node.js)   │      │     (rer_e_stats)     │ │
│  └──────────────┘      └──────────┬───────────┘ │
│                                   │             │
│                         ┌─────────▼──────────┐  │
│                         │    API REST         │  │
│                         │    (Node.js)        │  │
│                         └─────────┬──────────┘  │
└───────────────────────────────────┼─────────────┘
                                    │
                         ┌──────────▼──────────┐
                         │   Dashboard         │
                         │   (Vue.js)          │
                         └─────────────────────┘
```

---

## Fonctionnalités

### Sélecteur de date
Toutes les vues sont filtrables par date (calendrier ou flèches jour-par-jour). Par défaut : jour courant.

### Vue "Jour J"

| Bloc | Description |
|------|-------------|
| Circulations collectées | Trains ayant fait l'objet d'une tentative de collecte (ok + unknown), en attente si `pending > 0` |
| Taux de résolution | `résolues / collectées` — exclut les trains pas encore passés |
| Répartition matériel | Donut RER NG / NAT / MI2N avec légende |
| Composition UM/US | Donut couplées vs simples |
| Détail par branche | Barre horizontale de répartition matériel + couplage, pour chacune des 4 branches |

**Branches couvertes :**

| Branche | Missions |
|---------|----------|
| Chelles-Gournay | `NOCY`, `CONY` |
| Tournan | `NATU`, `NUTU`, `TANU`, `TINU` |
| Villiers-sur-Marne | `NOVY`, `VONY` |
| Tronçon central | `NOMY`, `MONY` |

### Vue "Répartition horaire"

Courbes RER NG / NAT / MI2N par heure de départ (status = ok).  
Un sélecteur de branche permet de filtrer les données : **Toutes / Chelles / Tournan / Villiers / Central**.

### Vue "Évolution"

Courbes journalières sur une période glissante paramétrable (7 j / 30 j / 90 j) :

- % de circulations RER NG par jour
- % de circulations NAT par jour
- % de circulations MI2N par jour
- % de compositions couplées (UM) par jour

---

## Règle de comptage

Un train couplé compte comme **une seule circulation**. Le matériel est déterminé par le `commercialName` du premier élément du tableau `composition`. Il n'y a pas de couplage hétérogène sur le RER E.

Les `commercialName` reconnus :

| Valeur en base | Clé dans l'API |
|----------------|----------------|
| `RER NG` | `RERNG` |
| `NAT` | `NAT` |
| `Francilien` | `NAT` (alias) |
| `MI2N` | `MI2N` |

---

## API REST

Port par défaut : **3051**. CORS configuré via `CORS_ORIGIN` dans `.env`.

### `GET /api/stats/daily`

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `date` | `YYYY-MM-DD` | aujourd'hui | Date de circulation |

```json
{
  "date": "2026-06-01",
  "total": 416,
  "collected": 199,
  "resolved": 189,
  "unknown": 10,
  "pending": 217,
  "material": { "RERNG": 120, "NAT": 45, "MI2N": 24 },
  "coupling": { "um": 160, "us": 39 },
  "branches": {
    "Chelles": {
      "label": "Chelles–Gournay",
      "missions": "NOCY · CONY",
      "total": 52,
      "material": { "RERNG": 36, "NAT": 12, "MI2N": 4 },
      "coupling": { "um": 44, "us": 8 }
    },
    "Tournan": { "...": "..." },
    "Villiers": { "...": "..." },
    "Central": { "...": "..." }
  }
}
```

### `GET /api/stats/hourly`

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `date` | `YYYY-MM-DD` | aujourd'hui | Date de circulation |
| `branch` | `Chelles` \| `Tournan` \| `Villiers` \| `Central` | — | Filtre par branche (optionnel) |

```json
[
  { "heure": 5, "materiel": "RER NG", "total": 4 },
  { "heure": 5, "materiel": "Francilien", "total": 2 }
]
```

### `GET /api/stats/evolution`

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `days` | `integer` | `30` | Nombre de jours glissants (max 365) |
| `end` | `YYYY-MM-DD` | aujourd'hui | Date de fin de la période |

```json
[
  {
    "date": "2026-05-02",
    "pctRERNG": 58,
    "pctNAT": 24,
    "pctMI2N": 18,
    "pctCoupled": 75,
    "total": 184
  }
]
```

### `GET /api/health`

```json
{ "ok": true }
```

---

## Stack technique

| Composant | Technologie |
|-----------|------------|
| Framework front | Vue.js 3 (Composition API + `<script setup>`) |
| Graphiques | Chart.js via vue-chartjs |
| HTTP client (front) | `fetch` natif |
| API REST | Node.js + Express |
| Base de données | MySQL (lecture seule) |
| Driver MySQL | mysql2/promise |
| Build tool | Vite |

---

## Structure du projet

```
train_stats/
├── api/
│   ├── index.js          # Point d'entrée Express + CORS
│   ├── db.js             # Pool MySQL partagé (lecture seule)
│   ├── routes/
│   │   └── stats.js      # /daily, /hourly, /evolution
│   └── .env              # Variables d'environnement
└── front/
    ├── public/
    │   └── Train-Stats.png   # Favicon
    ├── index.html
    ├── src/
    │   ├── main.js
    │   ├── App.vue           # Orchestration, routing vues, loader
    │   ├── api.js            # Client fetch → API REST
    │   ├── utils.js          # pct(), fmtLong(), fmtShort(), MATERIALS
    │   ├── palette.js        # Couleurs Chart.js par thème (dark/light)
    │   ├── style.css         # Styles globaux + responsive (768px / 480px)
    │   ├── composables/
    │   │   └── useTheme.js   # Thème dark/light persisté en localStorage
    │   └── components/
    │       ├── DatePicker.vue
    │       ├── MetricsBar.vue
    │       ├── MaterialDonut.vue
    │       ├── CouplingCard.vue
    │       ├── BranchGrid.vue
    │       ├── HourlyChart.vue
    │       └── EvolutionChart.vue
    ├── vite.config.js
    └── package.json
```

---

## Configuration

```env
# api/.env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=rer_e_stats
PORT=3051
CORS_ORIGIN=http://localhost:5173
```

> L'API est en **lecture seule** — aucune écriture depuis le dashboard.  
> CORS fail-closed : sans `CORS_ORIGIN`, toute requête cross-origin est refusée.

---

## Lancement

```bash
# API
cd api
npm install
node index.js

# Front (dev)
cd front
npm install
npm run dev
```

> En production, builder le front avec `npm run build` et servir `dist/` via Nginx ou Express.
