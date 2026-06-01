# RER E Stats — Dashboard

Interface web de visualisation des statistiques de composition du matériel roulant du RER E, alimentée par l'API REST du collecteur Transilien.

---

## Objectif

Visualiser les données collectées chaque jour par le système de collecte automatique afin d'analyser la répartition du matériel roulant (RER NG, NAT, MI2N) sur la ligne RER E, par branche et dans le temps.

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
Toutes les vues sont filtrables par date. Par défaut : jour courant.

### Vue "Jour J"

| Bloc | Description |
|------|-------------|
| Circulations collectées | Total du jour, dont résolues et inconnues |
| Répartition matériel | % RER NG / NAT / MI2N (1 circulation = 1 unité) |
| Composition | % trains couplés (UM) vs simples (US) |
| Détail par branche | Même répartition filtrée par branche |

**Branches couvertes :**

| Branche | Missions |
|---------|----------|
| Chelles-Gournay | `NOCY`, `CONY` |
| Tournan | `NATU`, `NUTU`, `TANU`, `TINU` |
| Villiers-sur-Marne | `NOVY`, `VONY` |
| Tronçon central | `NOMY`, `MONY` |

### Vue "Évolution"

Courbes journalières sur une période paramétrable (7 j / 30 j / 90 j) :

- % de circulations RER NG par jour
- % de compositions couplées par jour

---

## Règle de comptage

Un train couplé compte comme **une seule circulation**. Le matériel est déterminé par le `commercialName` du premier élément du tableau `composition`. Il n'y a pas de couplage hétérogène sur le RER E.

```
composition: [
  { "commercialName": "RER NG", ... },
  { "commercialName": "RER NG", ... }
]
→ 1 circulation RER NG couplée (UM)

composition: [
  { "commercialName": "NAT", ... }
]
→ 1 circulation NAT simple (US)
```

---

## API REST

Le dashboard consomme deux endpoints exposés par le serveur Node.js :

### `GET /api/stats/daily`

Retourne les statistiques globales et par branche pour une date donnée.

**Paramètres :**

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `date` | `YYYY-MM-DD` | aujourd'hui | Date de circulation |

**Réponse :**

```json
{
  "date": "2026-06-01",
  "total": 284,
  "resolved": 275,
  "unknown": 9,
  "material": {
    "RERNG": 173,
    "NAT": 82,
    "MI2N": 29
  },
  "coupling": {
    "um": 221,
    "us": 63
  },
  "branches": {
    "Chelles": {
      "total": 89,
      "material": { "RERNG": 62, "NAT": 27, "MI2N": 0 },
      "coupling": { "um": 74, "us": 15 }
    },
    "Tournan": { "..." : "..." },
    "Villiers": { "...": "..." },
    "Central": { "...": "..." }
  }
}
```

---

### `GET /api/stats/evolution`

Retourne une série temporelle de points journaliers pour les courbes d'évolution.

**Paramètres :**

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `days` | `integer` | `30` | Nombre de jours glissants |

**Réponse :**

```json
[
  {
    "date": "2026-05-02",
    "pctRERNG": 58,
    "pctCoupled": 75
  },
  {
    "date": "2026-05-03",
    "pctRERNG": 61,
    "pctCoupled": 78
  }
]
```

---

## Stack technique

| Composant | Technologie |
|-----------|------------|
| Framework front | Vue.js 3 (Composition API) |
| Graphiques | Chart.js |
| HTTP client (front) | fetch natif |
| API REST | Node.js + Express |
| Base de données | MySQL |
| Driver MySQL | mysql2 |

---

## Structure du projet

```
rer-e-dashboard/
├── api/
│   ├── index.js          # Point d'entrée Express
│   ├── db.js             # Connexion MySQL (partagée avec le collecteur)
│   ├── routes/
│   │   └── stats.js      # GET /api/stats/daily et /api/stats/evolution
│   └── .env              # Variables d'environnement
└── front/
    ├── index.html
    ├── src/
    │   ├── main.js
    │   ├── App.vue
    │   └── components/
    │       ├── DatePicker.vue
    │       ├── MetricsBar.vue
    │       ├── MaterialDonut.vue
    │       ├── CouplingCard.vue
    │       ├── BranchGrid.vue
    │       └── EvolutionChart.vue
    └── vite.config.js
```

---

## Configuration

```env
DB_HOST=localhost
DB_USER=
DB_PASSWORD=
DB_NAME=rer_e_stats
PORT=3051
```

> L'API partage la même base MySQL que le collecteur. Elle est en lecture seule — aucune écriture depuis le dashboard.

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

> En production, builder le front avec `npm run build` et servir le dossier `dist/` via Nginx ou directement depuis Express.