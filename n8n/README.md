# Workflows n8n — déclencheurs des pipelines

L'app fournit deux endpoints qui font tout le travail. n8n sert uniquement de **minuteur** : il appelle ces endpoints toutes les 2 minutes.

| Fichier | Endpoint appelé | Rôle |
|---|---|---|
| `workflow-poll-notion.json` | `POST /api/poll` | Qualifie les sources (URLs) ajoutées dans la base Notion |
| `workflow-poll-drive.json` | `POST /api/drive/poll` | Traite les fichiers déposés dans Google Drive |

## Installation

1. Dans n8n : **Workflows → Import from File** → importer chaque `.json`
2. Remplacer les deux placeholders dans le nœud HTTP :
   - `__APP_BASE_URL__` → l'URL de votre déploiement (ex: `https://votre-app.vercel.app`)
   - `__N8N_SHARED_SECRET__` → la même valeur que la variable d'environnement `N8N_SHARED_SECRET` de l'app
3. **Activer** chaque workflow

## Alternative sans n8n

Tout cron qui fait un `POST` toutes les 2 min sur ces deux URLs (avec l'en-tête `x-n8n-secret`) fonctionne aussi. n8n n'est pas obligatoire — c'est juste un déclencheur.
