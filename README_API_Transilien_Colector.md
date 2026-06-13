# RER E Stats — Collecte de la composition des trains

Système automatisé de collecte et d'enregistrement de la composition et des perturbations des trains du RER E, à partir de l'API Transilien, de l'API SNCF Voyageurs et de l'API SNCF Connect.

---

## Objectif

Le RER E circule avec différents types de matériel roulant (RER NG, MI2N, Francilien) en composition simple (US) ou couplée (UM). L'objectif est de **collecter automatiquement chaque jour la composition et les perturbations de chaque train** afin de constituer une base de données statistique exploitable.

---

## Architecture générale

```
┌────────────────────────────────────────────────────────────────┐
│                        VPS (Node.js)                           │
│                                                                │
│  ┌─────────────┐    ┌─────────────────┐                        │
│  │  Cron 4h30  │───▶│ Collecte        │                        │
│  │  (node-cron)│    │ timetable       │                        │
│  └─────────────┘    └───────┬─────────┘                        │
│                             │                                  │
│                             ▼                                  │
│                      ┌──────────────┐                          │
│                      │  Base MySQL  │                          │
│                      │  (5 tables)  │                          │
│                      └──────┬───────┘                          │
│                             │                                  │
│  ┌─────────────┐            ▼                                  │
│  │  Cron 1min  │───▶ ┌─────────────────────────────────────┐   │
│  │  (scheduler)│     │  Queue equipment  Queue detail       │   │
│  └─────────────┘     │  (Transilien)  (SNCF Voyageurs/SC)  │   │
│                      └─────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
```

---

## Workflow

### Phase 1 — Collecte des trains du jour (4h30)

Un cron se déclenche à **4h30 chaque matin** (heure de Paris) et effectue 8 appels à l'API `/timetable`, couvrant toutes les branches du RER E dans les deux sens.

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

> Les 8 appels sont espacés de **5 minutes** (durée totale ~35 min).

> Les appels 7 et 8 couvrent les trains du tronçon central (Magenta ou Haussmann comme terminus).

**Stratégie de retry timetable :**
- 2 tentatives par appel (retry après 5 min, ou 30 min si 429)
- Si les 2 tentatives échouent → retry global **2h après** pour les appels ratés

---

### Phase 2 — Collecte de la composition (Transilien)

Un cron tourne **toutes les minutes** et interroge les trains avec `equipmentStatus = 'pending'` dont le départ est passé depuis **5 min**. Pour chaque train, un appel est effectué sur `/api/transilien/equipment/:number/:date`. La queue equipment et la queue detail tournent **en parallèle** dans chaque cycle.

**Stratégie de retry equipment :**

| Tentative | Déclenchement | Action si échec |
|-----------|--------------|-----------------|
| 1 | T+5 min après départ | Retry à T+15 min |
| 2 | T+15 min | Retry à T+25 min |
| 3 | T+25 min | Marque `unknown` |

**Gestion des erreurs HTTP :**

| Code | Action | Tentative consommée |
|------|--------|---------------------|
| 429 | Retry dans 60 min | Non |
| 5xx | Retry dans 60 min | Non |
| 401 | Retry dans 2h + log ERROR | Non |
| 404 | Marque `unknown` immédiatement | Oui |

> Appels espacés de **10 secondes**.

---

### Phase 3 — Collecte des perturbations (SNCF Voyageurs / SNCF Connect)

Le même cron traite les trains avec `detailStatus = 'pending'` dont l'arrivée est passée depuis **1 heure**. Un appel est effectué sur `/api/train/:number/:date` (route unifiée) — **SNCF Voyageurs en priorité** (source publique, sans anti-bot), SNCF Connect en fallback. Jusqu'à **10 trains par cycle**, espacés de **10 secondes**.

**Détection de l'arrivée :**
- Train **supprimé** (`deleted: true`) → considéré terminé
- Terminus avec **`arrivalDelayMin` nul** ou **`realArrival` confirmé** → considéré arrivé
- Terminus **encore en retard** (`arrivalDelayMin != null` et `realArrival` absent) → retry dans 60 min sans consommer de tentative

**Stratégie de retry detail** : identique à l'equipment.

---

## Structure de la base de données

### `trains` — horaires + statuts de collecte

| Colonne | Type | Description |
|---------|------|-------------|
| `trainNumber` | VARCHAR(20) PK | Numéro du train |
| `date` | DATE PK | Date de circulation |
| `mission` | VARCHAR(10) | Code mission (NOCY, NOVY…) |
| `departureStation` | VARCHAR(100) | |
| `departureTime` | DATETIME | |
| `arrivalStation` | VARCHAR(100) | |
| `arrivalTime` | DATETIME | |
| `formation` | ENUM('US','UM') | Unité Simple / Multiple |
| `equipmentStatus` | ENUM('pending','ok','unknown') | |
| `equipmentRetries` | TINYINT | |
| `equipmentRetryAt` | DATETIME | |
| `equipmentFetchedAt` | DATETIME | |
| `detailStatus` | ENUM('pending','ok','unknown') | |
| `detailRetries` | TINYINT | |
| `detailRetryAt` | DATETIME | |

### `train_sets` — composition Transilien (une rame par ligne)

| Colonne | Type | Description |
|---------|------|-------------|
| `trainNumber` | VARCHAR(20) PK | |
| `date` | DATE PK | |
| `position` | TINYINT PK | 1 (US), 1+2 (UM) |
| `rollingStock` | ENUM('RERNG','MI2N','NAT') | |
| `coaches` | TINYINT | Nombre de voitures |

> "Francilien" retourné par l'API est mappé sur `NAT`.

### `train_details` — résumé SNCF Voyageurs / SNCF Connect

| Colonne | Type | Description |
|---------|------|-------------|
| `trainNumber` | VARCHAR(20) PK | |
| `date` | DATE PK | |
| `canceled` | TINYINT(1) | Train supprimé (`deleted`) |
| `isDelayed` | TINYINT(1) | Au moins un arrêt en retard |
| `delayMinutes` | SMALLINT | Retard au premier arrêt concerné (minutes) |
| `courseModified` | TINYINT(1) | Parcours modifié (arrêts supprimés, nouvelle origine/terminus) |
| `source` | VARCHAR(20) | `sncf-voyageurs` ou `sncf-connect` |
| `fetchedAt` | DATETIME | |

### `train_stops` — arrêts (un arrêt par ligne)

| Colonne | Type | Description |
|---------|------|-------------|
| `trainNumber` | VARCHAR(20) PK | |
| `date` | DATE PK | |
| `position` | TINYINT PK | Ordre dans le parcours |
| `station` | VARCHAR(100) | Nom de la gare (`location` SNCF Voyageurs) |
| `scheduledTime` | TIME | Heure prévue (départ ou arrivée) |
| `realTime` | TIME | Heure réelle — NULL si à l'heure |
| `platform` | VARCHAR(20) | NULL avec SNCF Voyageurs (disponible uniquement SNCF Connect) |
| `isDelayed` | TINYINT(1) | `departureDelayMin` ou `arrivalDelayMin` non nul |
| `segmentType` | VARCHAR(60) | NULL avec SNCF Voyageurs (héritage SNCF Connect) |
| `isDeleted` | TINYINT(1) | Arrêt supprimé (`stop.isDeleted`) |

### `train_disruptions` — événements globaux SNCF Voyageurs (un par ligne)

| Colonne | Type | Description |
|---------|------|-------------|
| `id` | INT AUTO_INCREMENT PK | |
| `trainNumber` | VARCHAR(20) | |
| `date` | DATE | |
| `disruptionType` | VARCHAR(60) | Catégorie (`deleted`, `course_modified`, `works`…) |
| `title` | VARCHAR(200) | Titre de l'événement (`deletion.total`, `delay_departure`…) |
| `message` | TEXT | Texte détaillé de l'événement |

---

## Structure du projet

```
transilien_stats/
├── .env                # Variables d'environnement (ne pas commiter)
├── .env.example        # Template à commiter
├── config.js           # Paramètres (lit le .env)
├── db.js               # Connexion MySQL, création des tables, requêtes
├── collector.js        # Appels HTTP (Transilien + SNCF Voyageurs/Connect)
├── scheduler.js        # Cron 1 min — queues equipment et detail
├── timetable.js        # Collecte timetable avec retry
├── logger.js           # Logger console + fichier (heure de Paris)
├── utils.js            # Utilitaires timezone (nowParis, todayParis)
├── collect-now.js      # Collecte timetable manuelle
├── index.js            # Point d'entrée + cron 4h30
├── logs/               # Logs journaliers YYYY-MM-DD.log (ignoré par git)
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

L'authentification sur l'API se fait via le header `X-API-Key`.

Les 5 tables sont créées automatiquement au démarrage. L'utilisateur MySQL doit avoir les droits `ALL PRIVILEGES` sur la base. Si MySQL connecte via `127.0.0.1` plutôt que `localhost`, accorder les droits sur les deux hosts.

---

## Stack technique

| Composant | Technologie |
|-----------|------------|
| Runtime | Node.js |
| Scheduler | node-cron |
| Base de données | MySQL 8+ |
| Driver MySQL | mysql2 |
| HTTP client | axios |
| Variables d'env | dotenv |

---

## Lancement

```bash
npm install
node index.js
```

La collecte timetable se déclenche automatiquement à **4h30**. Pour lancer une collecte manuellement :

```bash
node collect-now.js              # Aujourd'hui
node collect-now.js 2026-06-01   # Date spécifique
```

> En production, utiliser **PM2** :
> ```bash
> pm2 start index.js --name transilien_stats
> pm2 save
> ```

---

## Logs

Un fichier par jour dans `logs/YYYY-MM-DD.log`, en heure de Paris.

```
[2026-06-04 04:30:00] [INFO ] TIMETABLE | Collecte du 2026-06-04
[2026-06-04 04:30:00] [INFO ] TIMETABLE | Collecte du 2026-06-04
[2026-06-04 10:15:01] [OK   ] EQUIP OK        | 119002 | 2026-06-04 | RER NG (6C) + RER NG (6C)
[2026-06-04 10:15:11] [WARN ] EQUIP VIDE      | 118108 | 2026-06-04
[2026-06-04 11:20:00] [OK   ] DETAIL OK       | 119002 | 2026-06-04 | retard
[2026-06-04 11:20:00] [OK   ] DETAIL OK       | 118200 | 2026-06-04 | supprimé
[2026-06-04 11:20:00] [OK   ] DETAIL OK       | 118133 | 2026-06-04 | parcours modifié | arrêt(s) supprimé(s)
[2026-06-04 11:20:00] [WARN ] DETAIL EN ROUTE | 118300 | 2026-06-04 | pas encore arrivé — retry dans 60 min
[2026-06-04 11:20:00] [WARN ] DETAIL 404      | 116050 | 2026-06-04 | marqué unknown
```

---

## Limites connues

- L'API Transilien retourne `sets: []` si la composition n'est pas encore disponible ou si le train est annulé. Après 3 tentatives → `unknown`.
- SNCF Voyageurs (source principale) est publique — pas de risque de ban Datadome. SNCF Connect reste le fallback.
- Avec SNCF Voyageurs, `platform` et `segmentType` sont toujours `NULL` dans `train_stops`.
- En cas de fallback SNCF Connect (source `sncf-connect`), `departureDelayMin` est `null` et les horaires sont au format `HH:MM`.
- SNCF Connect utilise Datadome (anti-bot). En cas de ban (403/503) affectant le fallback, renouveler les cookies dans l'API locale.
- Les trains du tronçon central peuvent avoir Magenta ou Haussmann comme terminus selon les jours.
- Le numéro de train est supposé unique par journée — c'est la clé primaire de `trains`.
