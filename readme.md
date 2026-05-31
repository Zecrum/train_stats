# RER E Stats — Collecte de la composition des trains

Système automatisé de collecte et d'enregistrement de la composition du matériel roulant des trains du RER E, à partir de l'API Transilien.

---

## Objectif

Le RER E circule avec différents types de matériel roulant (RER NG, MI2N, etc.) et peut circuler en composition simple ou couplée. L'objectif de ce projet est de **collecter automatiquement chaque jour la composition de chaque train** afin de constituer une base de données statistique exploitable.

---

## Architecture générale

```
┌─────────────────────────────────────────────────────┐
│                     VPS (Node.js)                   │
│                                                     │
│  ┌─────────────┐     ┌──────────────┐               │
│  │  Cron 4h30  │────▶│  Collecte    │               │
│  │  (node-cron)│     │  timetable   │               │
│  └─────────────┘     └──────┬───────┘               │
│                             │                       │
│                             ▼                       │
│                      ┌──────────────┐               │
│                      │  Base MySQL  │               │
│                      │  (queue)     │               │
│                      └──────┬───────┘               │
│                             │                       │
│  ┌─────────────┐            ▼                       │
│  │  Cron 1min  │────▶ ┌──────────────┐              │
│  │  (scheduler)│      │  Collecte    │              │
│  └─────────────┘      │  equipment   │              │
│                       └──────┬───────┘              │
│                              │                      │
│                              ▼                      │
│                       ┌──────────────┐              │
│                       │  API locale  │              │
│                       │  Transilien  │              │
│                       └──────────────┘              │
└─────────────────────────────────────────────────────┘
```

---

## Workflow

### Phase 1 — Collecte des trains du jour (4h30)

Un cron se déclenche à **4h30 chaque matin** et effectue 8 appels à l'API `/timetable` pour récupérer tous les trains prévus sur la journée, couvrant l'ensemble des branches du RER E dans les deux sens.

Chaque appel est filtré par **code mission** pour éviter tout doublon :

| Appel | Départ | Arrivée | Missions acceptées |
|-------|--------|---------|-------------------|
| 1 | Chelles-Gournay | Nanterre La Folie | `NOCY` |
| 2 | Nanterre La Folie | Chelles-Gournay | `CONY` |
| 3 | Tournan | Nanterre La Folie | `NATU`, `NUTU` |
| 4 | Nanterre La Folie | Tournan | `TANU`, `TINU` |
| 5 | Villiers-sur-Marne | Nanterre La Folie | `NOVY` |
| 6 | Nanterre La Folie | Villiers-sur-Marne | `VONY` |
| 7 | Magenta | Nanterre La Folie | `NOMY` |
| 8 | Nanterre La Folie | Magenta | `MONY` |

> Les appels 7 et 8 couvrent les trains du tronçon central uniquement (Magenta ou Haussmann comme terminus), en utilisant Magenta comme point de référence pour capturer tous les cas.

> Les 8 appels sont espacés de 2 minutes, soit une durée totale d'environ 16 minutes.

Les trains collectés sont insérés en base avec le statut `pending`.

---

### Phase 2 — Collecte de la composition (toute la journée)

Un second cron tourne **toutes les minutes** et interroge la base pour trouver les trains éligibles :

```
SELECT * FROM trains
WHERE status = 'pending'
AND departureTime <= NOW() - INTERVAL 5 MINUTE
AND (nextRetryAt IS NULL OR nextRetryAt <= NOW())
```

Pour chaque train trouvé, un appel est effectué sur `/equipment/:trainNumber/:date`.

**Stratégie de retry :**

| Tentative | Déclenchement | Action si échec |
|-----------|--------------|-----------------|
| 1 | T+5 min après départ | Planifie retry à T+15 min |
| 2 | T+15 min | Planifie retry à T+25 min |
| 3 | T+25 min | Marque `unknown` |

> Les appels sont espacés d'au moins **10 secondes** pour ne pas surcharger l'API Transilien.

---

## Structure de la base de données

### Table `trains`

| Colonne | Type | Description |
|--------|------|-------------|
| `trainNumber` | VARCHAR(20) | Numéro du train |
| `date` | DATE | Date de circulation |
| `mission` | VARCHAR(10) | Code mission (ex: NOVY) |
| `departureStation` | VARCHAR(100) | Gare de départ |
| `departureTime` | DATETIME | Heure de départ |
| `arrivalStation` | VARCHAR(100) | Gare d'arrivée |
| `arrivalTime` | DATETIME | Heure d'arrivée |
| `composition` | JSON | Sets retournés par `/equipment` |
| `fetchedAt` | DATETIME | Horodatage de la collecte |
| `retries` | INT | Nombre de tentatives effectuées |
| `nextRetryAt` | DATETIME | Prochaine tentative planifiée |
| `status` | ENUM | `pending` / `ok` / `unknown` |

**Clé primaire** : `(trainNumber, date)`

### Exemple de `composition` stockée

```json
[
  { "commercialName": "RER NG", "coaches": 6, "image": "RERNG_blueIDFM_6C" },
  { "commercialName": "RER NG", "coaches": 6, "image": "RERNG_blueIDFM_6C" }
]
```

---

## Structure du projet

```
transilien_stats/
├── config.js          # URL API Transilien, credentials MySQL, codes IDFM, missions
├── db.js              # Connexion MySQL et requêtes
├── collector.js       # Appels API Transilien (timetable + equipment)
├── scheduler.js       # Cron de collecte composition (toutes les minutes)
├── index.js           # Point d'entrée + cron 4h30
└── package.json
```

---

## Configuration

Le fichier `config.js` centralise tous les paramètres :

```js
module.exports = {
  api: {
    baseUrl: 'http://localhost:PORT', // URL de l'API Transilien locale
  },
  db: {
    host: 'localhost',
    user: 'xxx',
    password: 'xxx',
    database: 'rer_e_stats',
  },
  timetable: [
    { label: 'Chelles → Nanterre',  departure: 'stop_area:IDFM:XXXXX', destination: 'stop_area:IDFM:XXXXX', missions: ['NOCY'] },
    { label: 'Nanterre → Chelles',  departure: 'stop_area:IDFM:XXXXX', destination: 'stop_area:IDFM:XXXXX', missions: ['CONY'] },
    { label: 'Tournan → Nanterre',  departure: 'stop_area:IDFM:XXXXX', destination: 'stop_area:IDFM:XXXXX', missions: ['NATU', 'NUTU'] },
    { label: 'Nanterre → Tournan',  departure: 'stop_area:IDFM:XXXXX', destination: 'stop_area:IDFM:XXXXX', missions: ['TANU', 'TINU'] },
    { label: 'Villiers → Nanterre', departure: 'stop_area:IDFM:XXXXX', destination: 'stop_area:IDFM:XXXXX', missions: ['NOVY'] },
    { label: 'Nanterre → Villiers', departure: 'stop_area:IDFM:XXXXX', destination: 'stop_area:IDFM:XXXXX', missions: ['VONY'] },
    { label: 'Noisy → Nanterre',    departure: 'stop_area:IDFM:XXXXX', destination: 'stop_area:IDFM:XXXXX', missions: ['NOMY'] },
    { label: 'Nanterre → Noisy',    departure: 'stop_area:IDFM:XXXXX', destination: 'stop_area:IDFM:XXXXX', missions: ['MONY'] },
  ],
  scheduler: {
    delayAfterDeparture: 5,   // minutes après le départ avant 1er appel
    retryDelays: [10, 10],    // délais en minutes entre les retries
    callSpacing: 2000,        // ms entre chaque appel API
  },
};
```

---

## Stack technique

| Composant | Technologie |
|-----------|------------|
| Runtime | Node.js |
| Scheduler | node-cron |
| Base de données | MySQL |
| Driver MySQL | mysql2 |
| HTTP client | node-fetch ou axios |

---

## Lancement

```bash
npm install
node index.js
```

> En production, utiliser **PM2** pour maintenir le processus actif :
> ```bash
> pm2 start index.js --name transilien_stats
> pm2 save
> ```

---

## Limites connues

- L'API Transilien peut retourner `sets: []` si le train est trop loin dans le futur ou annulé. Les trains non résolus après 3 tentatives sont marqués `unknown`.
- Les trains circulant uniquement sur le tronçon central peuvent avoir **Magenta** ou **Haussmann** comme terminus selon les jours ; l'appel depuis Magenta couvre les deux cas.
- Le numéro de train (`trainNumber`) est supposé unique sur une journée donnée — c'est la clé primaire retenue.