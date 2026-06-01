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

```sql
SELECT * FROM trains
WHERE status = 'pending'
AND departureTime <= NOW() - INTERVAL 5 MINUTE
AND (nextRetryAt IS NULL OR nextRetryAt <= NOW())
```

Pour chaque train trouvé, un appel est effectué sur `/api/transilien/equipment/:trainNumber/:date`.

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
├── .env                # Variables d'environnement (ne pas commiter)
├── .env.example        # Template à commiter
├── config.js           # Paramètres (lit le .env)
├── db.js               # Connexion MySQL et requêtes
├── collector.js        # Appels HTTP vers l'API Transilien
├── scheduler.js        # Cron de collecte composition (toutes les minutes)
├── logger.js           # Logger console + fichier
├── collect-now.js      # Collecte timetable manuelle (hors cron)
├── index.js            # Point d'entrée + cron 4h30
├── logs/               # Logs journaliers (ignoré par git)
└── package.json
```

---

## Configuration

Copier `.env.example` en `.env` et remplir les valeurs :

```env
API_BASE_URL=http://localhost:3050
API_KEY=ta_clé_api

DB_HOST=localhost
DB_USER=
DB_PASSWORD=
DB_NAME=rer_e_stats
```

L'authentification sur l'API Transilien se fait via le header `X-API-Key`.

La base de données et la table `trains` sont créées automatiquement au démarrage si elles n'existent pas. L'utilisateur MySQL doit avoir les droits `ALL PRIVILEGES` sur la base.

---

## Stack technique

| Composant | Technologie |
|-----------|------------|
| Runtime | Node.js |
| Scheduler | node-cron |
| Base de données | MySQL |
| Driver MySQL | mysql2 |
| HTTP client | axios |
| Variables d'env | dotenv |

---

## Lancement

```bash
npm install
node index.js
```

La collecte timetable se déclenche automatiquement à **4h30**. Pour lancer une collecte manuellement (test ou rattrapage) :

```bash
node collect-now.js
```

> En production, utiliser **PM2** pour maintenir le processus actif :
> ```bash
> pm2 start index.js --name transilien_stats
> pm2 save
> ```

---

## Logs

Les logs sont écrits simultanément dans la console et dans `logs/YYYY-MM-DD.log` (un fichier par jour).

```
[2026-06-01 04:30:00] [INFO ] TIMETABLE | Début de la collecte pour le 2026-06-01
[2026-06-01 09:12:01] [INFO ] APPEL API | 119002 | 2026-06-01 | mission NOVY
[2026-06-01 09:12:02] [OK   ] OK        | 119002 | 2026-06-01 | RER NG (6C) + RER NG (6C)
[2026-06-01 09:14:00] [WARN ] RETRY 1   | 119108 | 2026-06-01 | prochain dans 10 min
```

---

## Limites connues

- L'API Transilien peut retourner `sets: []` si le train est trop loin dans le futur ou annulé. Les trains non résolus après 3 tentatives sont marqués `unknown`.
- Les trains circulant uniquement sur le tronçon central peuvent avoir **Magenta** ou **Haussmann** comme terminus selon les jours ; l'appel depuis Magenta couvre les deux cas.
- Le numéro de train (`trainNumber`) est supposé unique sur une journée donnée — c'est la clé primaire retenue.
