# API Train

API REST Node.js/Express exposant des données SNCF Connect et Transilien, avec un dashboard Vue 3 pour le monitoring.

> **Avertissement** : cette API repose sur des APIs privées non officielles (SNCF Connect, Transilien). Elle peut cesser de fonctionner à tout moment sans préavis. Usage à vos risques et périls, non affilié à la SNCF.

---

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Backend | Node.js, Express, TypeScript, tsx |
| Frontend | Vue 3, Vite, Vue Router |
| Base de données | MySQL (mysql2/promise) |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| Cache | node-cache (TTL par endpoint) |
| Rate limiting | express-rate-limit |

---

## Structure du projet

```
API-Train/
├── back/                        # API Express
│   ├── src/
│   │   ├── app.ts               # Point d'entrée, middlewares globaux
│   │   ├── routes/
│   │   │   ├── auth.routes.ts          # POST /api/auth/login
│   │   │   ├── station.routes.ts       # GET /api/station/*
│   │   │   ├── train.routes.ts         # GET /api/train/* (unifié + SNCF Connect)
│   │   │   ├── transilien.routes.ts    # GET /api/transilien/*
│   │   │   └── sncfvoyageurs.routes.ts # GET /api/sncf-voyageurs/*
│   │   ├── services/
│   │   │   ├── sncfconnect.service.ts
│   │   │   ├── transilien.service.ts
│   │   │   ├── sncfvoyageurs.service.ts
│   │   │   └── database.service.ts
│   │   ├── types/
│   │   │   ├── sncf.types.ts
│   │   │   └── sncfvoyageurs.types.ts
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts
│   │   │   └── cache.middleware.ts
│   │   └── utils/
│   │       ├── requestTracker.ts
│   │       ├── errorTracker.ts
│   │       └── userAgent.ts
│   ├── create-user.js           # Créer/mettre à jour un utilisateur MySQL
│   ├── seed.js                  # Insérer des données de test
│   ├── test.js                  # Tester les routes manuellement
│   ├── .env.example
│   └── package.json
└── front/                       # Dashboard Vue 3
    ├── src/
    │   ├── views/
    │   │   ├── Login.vue
    │   │   └── Dashboard.vue
    │   ├── components/
    │   │   ├── SourceCard.vue
    │   │   └── StatCard.vue
    │   ├── composables/
    │   │   └── useDashboard.ts
    │   ├── router.ts
    │   └── main.ts
    └── package.json
```

---

## Installation

### Backend

```bash
cd back
npm install
cp .env.example .env
# Éditer .env avec tes valeurs
```

### Frontend

```bash
cd front
npm install
```

---

## Configuration (`back/.env`)

```env
PORT=3000
API_KEY=change-me

# Active l'authentification JWT/API key (mettre false en dev si besoin)
AUTH_ENABLED=true

# Clé publique du BFF SNCF Connect (optionnel, valeur par défaut incluse)
SNCF_BFF_KEY=ah1MPO-izehIHD-QZZ9y88n-kku876

# JWT — secret pour signer les tokens du dashboard
JWT_SECRET=change-me-jwt-secret

# MySQL (optionnel — désactive la persistance si absent)
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=api_train
```

> Si `DB_HOST` / `DB_USER` / `DB_NAME` sont absents, la persistance MySQL est désactivée et les données restent en mémoire (perdues au redémarrage).

---

## Démarrage

### Développement

```bash
# Backend — hot-reload sur http://localhost:3000
cd back && npm run dev

# Frontend — dev server avec proxy /api → localhost:3000
cd front && npm run dev
# Accessible sur http://localhost:5173
```

### Production

```bash
# Build du frontend
cd front && npm run build
# Génère front/dist/

# Lancer le backend en production
cd back && npm start
# (NODE_ENV=production — sert aussi le front depuis ../front/dist)
```

---

## Authentification

Toutes les routes `/api/*` (sauf `/api/auth/login` et `/api/health`) sont protégées.

Deux méthodes d'authentification acceptées :

| Méthode | Header |
|---------|--------|
| JWT (dashboard) | `Authorization: Bearer <token>` |
| API Key (machine to machine) | `Authorization: Bearer <api_key>` ou `x-api-key: <api_key>` |

### Obtenir un token JWT

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "monmotdepasse"
}
```

**Réponse :**
```json
{
  "token": "eyJhbGci...",
  "expiresIn": "24h"
}
```

Le token expire après 24 heures. Nécessite MySQL configuré et un utilisateur créé (voir ci-dessous).

---

## Routes API

### Santé

```
GET /api/health
```

Route publique, sans authentification.

```json
{ "status": "ok", "timestamp": "2026-06-03T10:00:00.000Z" }
```

---

### Stations — SNCF Connect

#### Rechercher une gare

```
GET /api/station/search?q=<terme>
```

| Paramètre | Requis | Contrainte |
|-----------|--------|------------|
| `q` | Oui | minimum 2 caractères |

```bash
GET /api/station/search?q=Paris+Montparnasse
```

```json
{
  "query": "Paris Montparnasse",
  "count": 2,
  "stations": [
    {
      "id": "RESARAIL_STA_8739100",
      "label": "Paris Montparnasse",
      "description": "Paris (75)",
      "lines": ["TGV", "RER C", "Transilien N"]
    }
  ]
}
```

#### Départs d'une gare

```
GET /api/station/:id/departures
```

```bash
GET /api/station/RESARAIL_STA_8739100/departures
```

```json
{
  "stationId": "RESARAIL_STA_8739100",
  "count": 14,
  "departures": [
    {
      "trainNumber": "8501",
      "trainLabel": "TGV",
      "direction": "Bordeaux Saint-Jean",
      "scheduledTime": "14:05",
      "realTime": "14:12",
      "isDelayed": true,
      "platform": "F",
      "hasDisruption": true
    }
  ]
}
```

#### Arrivées d'une gare

```
GET /api/station/:id/arrivals
```

Format identique aux départs, `direction` est la gare d'origine.

#### Perturbations d'une gare

```
GET /api/station/:id/disruptions
```

```json
{
  "stationId": "RESARAIL_STA_8739100",
  "count": 1,
  "disruptions": [
    {
      "type": "DISRUPTION_LIMITATION",
      "title": "Travaux ligne N",
      "message": "...",
      "trainLabel": "Transilien N"
    }
  ]
}
```

---

### Trains

#### Route unifiée (recommandée)

```
GET /api/train/:number/:date
```

Essaie **SNCF Voyageurs** en priorité. Si indisponible, bascule automatiquement sur **SNCF Connect**. Un champ `source` indique laquelle a répondu.

| Paramètre | Format | Exemple |
|-----------|--------|---------|
| `number` | Numéro de circulation | `118131` |
| `date` | `YYYY-MM-DD` | `2026-06-04` |

```bash
GET /api/train/118131/2026-06-09
```

**Train supprimé :**
```json
{ "source": "sncf-voyageurs", "deleted": true, "trainNumber": "120058", "circulationDate": "2026-06-04" }
```

**Train normal ou perturbé :**
```json
{
  "source": "sncf-voyageurs",
  "trainNumber": "118131",
  "circulationDate": "2026-06-09",
  "trainType": "RER E - TANU",
  "line": "E",
  "deleted": false,
  "courseModified": false,
  "created": false,
  "stops": [
    {
      "location": "Nanterre La Folie",
      "scheduledDeparture": "2026-06-09T10:04:00+02:00",
      "realDeparture": "2026-06-09T10:17:00+02:00",
      "departureDelayMin": 13,
      "scheduledArrival": null,
      "realArrival": null,
      "arrivalDelayMin": null,
      "isDeleted": false,
      "forbiddenExit": true,
      "forbiddenEntrance": false,
      "events": []
    }
  ],
  "globalEvents": []
}
```

> Quand la source est `sncf-connect` (fallback), `departureDelayMin` est `null` (les horaires sont au format `HH:MM`) et `forbiddenExit`/`forbiddenEntrance` sont `null`.

**Erreurs :**
- `404` — Train introuvable sur les deux sources
- `502` — Les deux sources sont indisponibles

---

#### Détail brut SNCF Connect (avec composition)

```
GET /api/train/detail/:number/:date
```

Route directe vers SNCF Connect uniquement. Utile pour récupérer la **composition du matériel roulant**.

```bash
GET /api/train/detail/118133/2026-06-03
```

```json
{
  "trainNumber": "118133",
  "destination": "Tournan",
  "disruptions": [
    { "type": "DISRUPTION_LIMITATION", "title": "Parcours modifié", "message": "..." }
  ],
  "stops": [
    {
      "station": "Paris Est",
      "scheduledTime": "10:46",
      "realTime": "10:50",
      "platform": "Voie 19",
      "isDelayed": true,
      "segmentType": "START_ACTIVE_DISRUPTION_LIMITED"
    }
  ],
  "composition": {
    "label": "2 trains MI2N - 10 voitures",
    "trains": [{ "carsCount": 5, "lengthInCm": 11200 }]
  }
}
```

**Erreurs :**
- `404` — Train introuvable pour ce numéro et cette date
- `502` — Erreur de communication avec SNCF Connect

---

### Transilien

#### Grille horaire

```
GET /api/transilien/timetable?date=<date>&departure=<id>&destination=<id>
```

| Paramètre | Requis | Description |
|-----------|--------|-------------|
| `date` | Oui | Format `YYYY-MM-DD` |
| `departure` | Oui | ID IDFM de l'arrêt de départ (ex: `stop_area:IDFM:73097`) |
| `destination` | Oui | ID IDFM de l'arrêt d'arrivée |

```bash
GET /api/transilien/timetable?date=2026-06-03&departure=stop_area:IDFM:73097&destination=stop_area:IDFM:73688
```

```json
{
  "count": 42,
  "trains": [
    {
      "trainNumber": "119002",
      "line": "RER_E",
      "mission": "NOVY",
      "departureStation": "Villiers-sur-Marne",
      "departureTime": "2026-06-03T05:04:40",
      "arrivalStation": "Haussmann Saint-Lazare",
      "arrivalTime": "2026-06-03T05:37:10",
      "duration": "PT32M30S",
      "hasSubstitutionBus": false
    }
  ]
}
```

#### Prochains départs

```
GET /api/transilien/next-departures?uicDeparture=<uic>&departure=<nom>&uicArrival=<uic>&arrival=<nom>
```

| Paramètre | Requis | Description |
|-----------|--------|-------------|
| `uicDeparture` | Oui | Code UIC de la gare de départ (ex: `8711379`) |
| `departure` | Oui | Nom de la gare de départ |
| `uicArrival` | Oui | Code UIC de la gare d'arrivée |
| `arrival` | Oui | Nom de la gare d'arrivée |

```bash
GET /api/transilien/next-departures?uicDeparture=8711379&departure=Villiers-sur-Marne&uicArrival=8728189&arrival=Haussmann+Saint-Lazare
```

```json
{
  "count": 6,
  "trains": [
    {
      "trainNumber": "119102",
      "mission": "NOVY",
      "destination": "Nanterre La Folie",
      "platform": "A",
      "departureTime": "17:34",
      "arrivalTime": "18:06",
      "canceled": false,
      "stops": [{ "station": "Villiers-sur-Marne", "time": "17:34", "bypassed": false }],
      "disruptions": [{ "type": "TRAVAUX", "title": "RER E : travaux", "detail": "..." }]
    }
  ]
}
```

#### Composition d'un train

```
GET /api/transilien/equipment/:number/:date
```

| Paramètre | Format | Exemple |
|-----------|--------|---------|
| `number` | Numéro du train | `119106` |
| `date` | `YYYY-MM-DD` | `2026-06-03` |

```bash
GET /api/transilien/equipment/119106/2026-06-03
```

```json
{
  "trainNumber": "119106",
  "date": "2026-06-03",
  "sets": [
    { "commercialName": "RER NG", "coaches": 6, "image": "RERNG_blueIDFM_6C" }
  ]
}
```

> Train annulé ou date trop éloignée → `"sets": []`

---

### SNCF Voyageurs

Source publique de sncf-voyageurs.com exposant les retards, suppressions, modifications de parcours et trains supplémentaires.

#### Détail d'un train

```
GET /api/sncf-voyageurs/train/:number/:date
```

| Paramètre | Format | Exemple |
|-----------|--------|---------|
| `number` | Numéro de circulation | `118131` |
| `date` | `YYYY-MM-DD` | `2026-06-09` |

```bash
GET /api/sncf-voyageurs/train/118131/2026-06-09
```

**Train supprimé** (tableau vide côté API) :
```json
{ "deleted": true, "circulationNumber": "120058", "circulationDate": "2026-06-04" }
```

**Train normal ou perturbé :**
```json
{
  "circulationNumber": "118131",
  "trainType": "RER E - TANU",
  "trainName": "RER E - TANU",
  "line": "E",
  "circulationDate": "2026-06-09",
  "destinationCode": "87116210",
  "deleted": false,
  "created": false,
  "courseModified": false,
  "stopsNb": 14,
  "durationMin": 54,
  "stops": [
    {
      "location": { "code": "87386011", "label": "Nanterre La Folie" },
      "scheduledDeparture": "2026-06-09T10:04:00+02:00",
      "realDeparture": "2026-06-09T10:17:00+02:00",
      "scheduledArrival": null,
      "realArrival": null,
      "departureDelayMin": 13,
      "arrivalDelayMin": null,
      "stopDuration": null,
      "forbiddenExit": true,
      "forbiddenEntrance": false,
      "events": []
    }
  ],
  "globalEvents": {},
  "services": [],
  "reservations": []
}
```

**Flags de statut :**

| Champ | Signification |
|-------|---------------|
| `deleted` | Train entièrement supprimé |
| `created` | Train supplémentaire non prévu |
| `courseModified` | Parcours modifié (arrêts supprimés, nouvelle origine/terminus) |

**Champs par arrêt :**

| Champ | Description |
|-------|-------------|
| `departureDelayMin` | Retard au départ en minutes (`null` si à l'heure) |
| `arrivalDelayMin` | Retard à l'arrivée en minutes (`null` si à l'heure) |
| `forbiddenExit` | Descente interdite (gare d'origine du train) |
| `forbiddenEntrance` | Montée interdite (terminus) |
| `events` | Événements sur cet arrêt (retard, suppression, nouvelle origine…) |

**Catégories d'événements (`category`) et titres (`title`) :**

| `category` | `title` | Signification |
|------------|---------|---------------|
| `delay` | `delay_departure` | Retard au départ |
| `delay` | `delay_arrival` | Retard à l'arrivée |
| `course_modified` | `deletion` | Arrêt supprimé sur cet arrêt |
| `more_stops` | `origin.old` | Ancienne gare de départ (supprimée) |
| `more_stops` | `origin.new` | Nouvelle gare de départ |
| `more_stops` | `destination.old` | Ancien terminus (supprimé) |
| `more_stops` | `destination.new` | Nouveau terminus |
| `deleted` | `deletion.total` | Train entièrement supprimé (aussi dans `globalEvents`) |
| `created` | `course.modified` | Train supplémentaire non prévu |
| `works` | — | Travaux (détail dans `text`) |
| `information` | `normal_departure` / `normal_arrival` | Départ/arrivée normal |

**Configuration optionnelle dans `.env` :**
```env
SNCFV_BASIC_AUTH=base64(user:password)
```

---

### Dashboard (monitoring)

```
GET /api/dashboard
```

Requiert authentification JWT ou API key.

```json
{
  "uptime": 3600,
  "requests": { "total": 142, "success": 138, "error": 4 },
  "cache": { "hits": 67, "misses": 75 },
  "sources": {
    "sncf":       { "status": "ok",    "lastError": null },
    "transilien": { "status": "error", "lastError": { "source": "transilien/timetable", "timestamp": "..." } }
  },
  "errors": {
    "count": 4,
    "stats": { "sncf/search": 2, "transilien/timetable": 2 },
    "recent": [ ... ]
  },
  "recent": [ ... ]
}
```

```
GET  /api/errors    → liste des erreurs récentes
DELETE /api/errors  → vider l'historique des erreurs
```

---

## Base de données MySQL

### Création de la base

```sql
CREATE DATABASE api_train CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Les tables sont créées automatiquement au démarrage si elles n'existent pas.

### Tables

| Table | Colonnes principales | Description |
|-------|---------------------|-------------|
| `requests` | timestamp, method, path, status, ms | Historique de toutes les requêtes |
| `errors` | timestamp, source, status, message | Erreurs vers les APIs externes |
| `users` | username, password_hash | Comptes dashboard |

### Créer un utilisateur

```bash
cd back
node create-user.js <username> <password>
```

Si l'utilisateur existe déjà, le mot de passe est mis à jour.

### Insérer des données de test

```bash
cd back
node seed.js [nbRequests] [nbErrors] [hoursBack]

# Exemples
node seed.js              # 100 requêtes, 20 erreurs sur 24h
node seed.js 500 50 48    # 500 requêtes, 50 erreurs sur 48h
```

---

## Dashboard Vue 3

### Fonctionnalités

- **Page de connexion** (`/login`) — authentification username/password, stocke le JWT dans `localStorage`
- **Statut des sources** — SNCF Connect et Transilien (vert/rouge selon les erreurs des 5 dernières minutes)
- **Statistiques** — total requêtes, succès, erreurs, hits cache
- **Tableau des requêtes récentes** — 50 dernières (méthode, path, status, durée)
- **Tableau des erreurs récentes** — 20 dernières (source, message, timestamp)
- **Rafraîchissement automatique** toutes les 10 secondes
- **Déconnexion** — supprime le JWT et redirige vers `/login`

### Guard de navigation

Si le JWT est absent ou expiré (`401`), l'utilisateur est automatiquement redirigé vers `/login`.

---

## Anti-bot (Datadome)

SNCF Connect et Transilien utilisent Datadome. En cas de `403` / `503` :

1. Ouvre Firefox sur le site concerné
2. DevTools → Network → clique une requête → copie le header `Cookie:`
3. Colle dans `back/cookies.txt` (SNCF Connect) ou `back/transilien_cookies.txt` (Transilien)
4. Redémarre le backend

Ces fichiers sont dans `.gitignore`.

---

## Cache

| Endpoint | TTL |
|----------|-----|
| `/station/search` | 5 min |
| `/station/:id/departures` | 30 sec |
| `/station/:id/arrivals` | 30 sec |
| `/station/:id/disruptions` | 1 min |
| `/train/detail/:number/:date` | 30 sec |
| `/transilien/timetable` | 5 min |
| `/transilien/next-departures` | 30 sec |
| `/transilien/equipment/:number/:date` | 30 sec |

Chaque réponse inclut le header `X-Cache: HIT` ou `X-Cache: MISS`.

---

## Rate limiting

60 requêtes par minute par IP.

```json
{ "error": "Trop de requêtes, réessaie dans une minute.", "code": 429 }
```

---

## Codes d'erreur

| Code | Cause |
|------|-------|
| 400 | Paramètre manquant ou invalide |
| 401 | Authentification manquante ou invalide |
| 404 | Train introuvable pour ce numéro et cette date |
| 429 | Rate limit dépassé |
| 502 | Erreur de communication avec SNCF Connect ou Transilien |
| 500 | Erreur interne du serveur |

---

## Déploiement (aaPanel)

### Backend — Node.js (PM2)

```bash
# Dans le répertoire back/
npm install --production
pm2 start --name api-train --interpreter npx -- tsx src/app.ts
pm2 save
```

Créer `back/.env` avec les valeurs de production, notamment `PORT`, `JWT_SECRET`, `DB_*`.

### Frontend — Site statique

```bash
# En local ou sur le serveur
cd front && npm run build
# Copier front/dist/ sur le serveur
```

