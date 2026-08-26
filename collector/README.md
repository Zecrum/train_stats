# collector

Collecteur Node.js qui alimente la base MySQL partagée `rer_e_stats` : sillons théoriques (une fois par jour), puis composition matérielle et détail de circulation de chaque train (en continu, via un scheduler cron interne).

> Documentation complète du projet (architecture, config, déploiement) : [README racine](../README.md).

## Lancement

```bash
npm install
node index.js
```

Nécessite un fichier `.env` — voir [Configuration](../README.md#configuration) dans le README racine.

## Qualité

```bash
npm run lint   # ESLint
npm test       # node --test
```

## Fichiers principaux

| Fichier | Rôle |
|---|---|
| `index.js` | Point d'entrée — démarre le scheduler + les crons (timetable 3h30, retry 2h30) |
| `timetable.js` | Récupère les sillons théoriques du jour, relation par relation |
| `scheduler.js` | Boucle 1 min — traite les files equipment/detail en attente, avec retry/backoff par code HTTP |
| `collector.js` | Appels API Transilien (timetable, equipment, détail d'un train) |
| `db.js` | Pool MySQL (écriture) + requêtes d'insertion/mise à jour |
| `config.js` | Relations départ/arrivée à interroger et missions associées par branche |
| `utils.js` | Helpers de date (fuseau Europe/Paris) |
