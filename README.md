# Train Stats

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Monorepo regroupant le collecteur de données RER E (cron Node.js), l'API REST de lecture et le dashboard Vue.js de visualisation des statistiques de composition du matériel roulant.

**Démo en ligne :** [trainstats.fr](https://trainstats.fr)

> Projet personnel et non-officiel, sans lien avec la SNCF. Les données affichées proviennent d'API publiques non-documentées de SNCF Connect/Voyageurs/Transilien — voir la page **Mentions légales** du dashboard pour le détail.

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
{ "ok": true, "version": "1.0.0" }
```

---

## Panel admin

Accessible via l'icône 🔒 en haut du dashboard. Protégé par mot de passe (`ADMIN_PASSWORD`) + JWT (`ADMIN_JWT_SECRET`), tous deux dans `api/.env`. Permet de :

- voir les trains dont la collecte équipement/détail a échoué (`equipmentStatus`/`detailStatus = 'unknown'`, ou `pending` depuis trop longtemps) — exclut automatiquement les trains supprimés, pour qui l'absence d'équipement est normale
- relancer la collecte équipement ou détail d'un train précis — ne fait que repasser son statut à `pending` en base ; c'est le **collecteur** (process séparé, cron interne toutes les minutes) qui reprend réellement le train, donc il doit être en cours d'exécution pour que la relance ait un effet
- saisir l'équipement manuellement (matériel + formation US/UM) quand la collecte automatique ne pourra jamais réussir
- ouvrir le train sur SNCF Connect / SNCF Voyageurs / Transilien (équipement) pour vérifier à la main

### `POST /api/admin/login`

```json
{ "password": "..." }
```
→ `{ "token": "<jwt>" }` (expire après 12h). Les autres routes `/api/admin/*` exigent `Authorization: Bearer <token>`.

### `GET /api/admin/unresolved?date=YYYY-MM-DD`

Sans `date`, fenêtre des 14 derniers jours. Retourne les trains non résolus (voir critères ci-dessus).

### `POST /api/admin/retry-equipment` · `POST /api/admin/retry-detail`

```json
{ "trainNumber": "847907", "date": "2026-06-13" }
```
Remet `equipmentStatus`/`detailStatus` à `pending` (reset des compteurs de retry).

### `POST /api/admin/equipment`

```json
{ "trainNumber": "847907", "date": "2026-06-13", "formation": "UM", "units": [{ "rollingStock": "RERNG" }, { "rollingStock": "RERNG" }] }
```
Écrit directement `train_sets` + `trains.formation`/`equipmentStatus = 'ok'`.

> Ces routes écrivent en base via le même utilisateur MySQL que les routes `/api/stats` (lecture seule) — voir [Configuration](#configuration) pour les droits `GRANT` nécessaires.

---

## Stack technique

| Composant | Technologie |
|-----------|------------|
| Framework front | Vue.js 3 (Composition API + `<script setup>`) |
| Graphiques | Chart.js via vue-chartjs |
| HTTP client (front) | `fetch` natif |
| API REST | Node.js + Express |
| Base de données | MySQL (lecture seule côté API) |
| Driver MySQL | mysql2/promise |
| Build tool | Vite |
| Collecteur | Node.js + node-cron + axios |
| Auth panel admin | JWT (jsonwebtoken) |

---

## Structure du projet

```
train_stats/
├── VERSION               # Numéro de version — source unique collecteur/api/front
├── deploy.sh             # Script de déploiement VPS (pull + install + build)
├── collector/
│   ├── index.js          # Point d'entrée — démarre le scheduler + cron timetable 3h30
│   ├── collector.js       # Collecte de la composition d'un train (Transilien)
│   ├── timetable.js       # Récupération des sillons théoriques du jour
│   ├── scheduler.js       # Boucle 1 min — déclenche equipment/detail par train
│   ├── db.js              # Pool MySQL (écriture)
│   ├── config.js          # Config branches/missions
│   ├── logger.js          # Logs fichier + console
│   └── .env               # Variables d'environnement (écriture)
├── api/
│   ├── index.js          # Point d'entrée Express + CORS + express.json()
│   ├── db.js             # Pool MySQL partagé (lecture pour /stats, écriture pour /admin)
│   ├── middleware/
│   │   └── auth.js       # requireAdmin — vérif JWT (Authorization: Bearer)
│   ├── routes/
│   │   ├── stats.js      # /daily, /hourly, /evolution, /disruptions, /trains-day, /train-detail
│   │   └── admin.js      # /login, /unresolved, /retry-equipment, /retry-detail, /equipment
│   └── .env               # Variables d'environnement
└── front/
    ├── public/
    │   └── Train-Stats.png   # Favicon
    ├── index.html
    ├── src/
    │   ├── main.js
    │   ├── App.vue           # Orchestration, onglets (Jour/Période), loader
    │   ├── api.js            # Client fetch → API REST (+ api.admin.*)
    │   ├── utils.js          # pct(), fmtLong(), fmtShort(), MATERIALS, TODAY
    │   ├── palette.js        # Couleurs Chart.js par thème (dark/light)
    │   ├── style.css         # Styles globaux + responsive (768px / 480px)
    │   ├── composables/
    │   │   ├── useTheme.js      # Thème dark/light persisté en localStorage
    │   │   └── useAdminAuth.js  # Token JWT persisté en localStorage
    │   └── components/
    │       ├── DatePicker.vue
    │       ├── MaterialDonut.vue
    │       ├── CouplingCard.vue
    │       ├── BranchGrid.vue
    │       ├── HourlyChart.vue
    │       ├── HourlyDisruptionChart.vue
    │       ├── HourlyTotalDelayChart.vue
    │       ├── TrainList.vue / TrainDetailPanel.vue
    │       ├── EvolutionChart.vue
    │       ├── DisruptionBar.vue / DisruptionChart.vue
    │       └── AdminPanel.vue   # Panel admin (login + tableau + actions)
    ├── vite.config.js
    └── package.json
```

---

## Configuration

```env
# collector/.env
API_BASE_URL=http://localhost:3000
API_KEY=
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=rer_e_stats
```

```env
# api/.env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=rer_e_stats
PORT=3051
CORS_ORIGIN=http://localhost:5173

# Panel admin (/api/admin) — mot de passe + secret JWT, ex: openssl rand -hex 32
ADMIN_PASSWORD=
ADMIN_JWT_SECRET=
```


---

## Prérequis

- Node.js ≥ 18
- MySQL ≥ 8.0 (ou MariaDB ≥ 10.4)

## Lancement

```bash
# Collecteur (process long — cron interne)
cd collector
npm install
node index.js

# API
cd api
npm install
node index.js

# Front (dev)
cd front
npm install
npm run dev
```

> Le collecteur et l'API sont des process long-running — en production, les superviser avec PM2 ou un service systemd pour qu'ils redémarrent automatiquement en cas de crash.  
> Builder le front avec `npm run build` et servir `dist/` via Nginx ou Express.

---

## Versioning

Le numéro de version est centralisé dans le fichier `VERSION` à la racine — source unique pour le backend et le frontend.

- **Backend** : exposé dans `GET /api/health` (champ `version`), affiché au démarrage dans les logs
- **Frontend** : injecté au build (`vite.config.js` lit `VERSION` via `define: { __APP_VERSION__ }`), affiché discrètement en bas de chaque page

### Branches

`main` est la branche de production — tout ce qui y est mergé peut être déployé via `deploy.sh` (`git pull origin main` sur le VPS).

Le développement courant se fait sur `dev` (ou des branches `feature/...`), mergée sur `main` seulement quand le code est stable :

```bash
git checkout dev
# ... commits ...

# Quand c'est prêt à déployer
git checkout main
git merge dev
git push origin main
```

### Workflow de release

Convention [SemVer](https://semver.org/lang/fr/) : `MAJOR.MINOR.PATCH`
- **MAJOR** — changement cassant (route supprimée/modifiée incompatible)
- **MINOR** — nouvelle fonctionnalité rétrocompatible
- **PATCH** — correctif de bug

```bash
# 1. Mettre à jour le fichier VERSION
echo "1.1.0" > VERSION

# 2. Committer
git add VERSION
git commit -m "Bump version to 1.1.0"

# 3. Tagger et pousser
git tag v1.1.0
git push origin main --tags
```

Le tag `v1.1.0` sert de point de repère sur GitHub — utile pour créer une **Release** (GitHub → Releases → Draft a new release → choisir le tag).

---

## Déploiement (aaPanel)

Le site Node.js est géré via le plugin **Node项目管理器** (Node Project Manager) d'aaPanel.

Le script `deploy.sh` à la racine automatise le pull et le build sur le VPS :

```bash
./deploy.sh
```

Il effectue dans l'ordre :
1. `git pull origin main`
2. `npm install` dans `collector/`, `api/` (pas de build — Node pur)
3. `npm install` + `npm run build` dans `front/`

**Le redémarrage des process n'est pas automatisé** — après le script, redémarrer manuellement le collecteur et l'API depuis l'interface aaPanel (NodeJS → sélectionner le site → Restart).

`collector/.env` et `api/.env` doivent contenir les valeurs de production — voir [Configuration](#configuration).

---

## Licence

[MIT](LICENSE) — libre de réutilisation, modification et redistribution.
