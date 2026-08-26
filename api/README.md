# api

API REST Node.js/Express exposant les statistiques calculées à la volée depuis la base MySQL `rer_e_stats`, plus un panel d'administration protégé par JWT pour rattraper les échecs de collecte.

> Documentation complète (endpoints détaillés, exemples de réponses, panel admin) : [README racine](../README.md#api-rest).

## Lancement

```bash
npm install
node index.js       # ou : npm run dev (avec --watch)
```

Nécessite un fichier `.env` — voir [Configuration](../README.md#configuration) dans le README racine. Port par défaut : `3051`.

## Qualité

```bash
npm run lint   # ESLint
npm test       # node --test + supertest, sur l'app Express (sans DB ni port ouvert)
```

## Fichiers principaux

| Fichier | Rôle |
|---|---|
| `app.js` | Construction de l'app Express (middlewares, routes, error handler) — exportée pour les tests |
| `index.js` | Point d'entrée — charge `.env` et démarre `app.listen()` |
| `db.js` | Pool MySQL partagé (lecture pour `/stats`, écriture pour `/admin`) |
| `middleware/auth.js` | `requireAdmin` — vérification du JWT sur les routes admin |
| `routes/stats.js` | `/daily`, `/hourly`, `/hourly-disruptions`, `/evolution`, `/disruptions`, `/trains-day`, `/train-detail` |
| `routes/admin.js` | `/login`, `/unresolved`, `/retry-equipment`, `/retry-detail`, `/equipment`, `/unknown-missions` |
