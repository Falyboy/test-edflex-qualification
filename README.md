# Edflex Qualification — Formation IA Terrain

Pipeline de qualification automatique de contenus pédagogiques pour collaborateurs terrain (*deskless workers*), basé sur la méthode **OPAD** (Opérationnel · Praticable · Accessible · Déclinable).

**App déployée :** https://formation-ia-studio.vercel.app/edflex

---

## Ce que fait ce système

1. L'utilisateur connecte sa base Notion (OAuth) contenant ses sources de contenu
2. n8n interroge la base toutes les 2 minutes
3. Chaque nouvelle source est extraite (YouTube, podcast, web, Google Drive, fichier)
4. Un LLM (DeepSeek) score le contenu sur 8 critères OPAD
5. Le résultat est écrit dans Notion : décision Publier / Réviser / Rejeter
6. L'utilisateur génère des livrables pédagogiques à partir des sources qualifiées

---

## Architecture du pipeline

```
Notion DB (sources)
    ↓  poll toutes les 2 min
n8n → POST /api/poll  (x-n8n-secret)
    ↓
scan Redis → query Notion (statut vide ou "À qualifier")
    ↓
POST /api/intake par source
    ↓  extraction selon type
YouTube → youtube-transcript
Podcast → Transcript.com API
Web     → @mozilla/readability
Drive   → Google Drive API
Fichier → pdf-parse / texte brut
    ↓
scoreLLM (DeepSeek) — 8 axes OPAD + RGPD + IA Act + PI
    ↓
écriture résultat dans page Notion
    ↓
génération livrables via agents LLM (Groq / DeepSeek)
```

---

## Services requis

| Service | Usage | Lien inscription | Gratuit ? |
|---------|-------|-----------------|-----------|
| **Upstash Redis** | Sessions, projets, tokens OAuth | https://upstash.com | ✅ tier gratuit |
| **Notion OAuth** | Auth user + base de données sources | https://notion.so/my-integrations | ✅ |
| **DeepSeek** | Scoring OPAD + génération livrables | https://platform.deepseek.com | $5 suffisent |
| **Groq** | Génération modules / fiches / roleplay | https://console.groq.com | ✅ gratuit |
| **Google OAuth** | Accès Google Drive | https://console.cloud.google.com | ✅ |
| **YouTube Data API v3** | Extraction transcripts YouTube | https://console.cloud.google.com | ✅ |
| **Google Drive API** | Extraction documents Drive | https://console.cloud.google.com | ✅ |
| **Vercel Blob** | Stockage transcripts | https://vercel.com (Storage) | ✅ tier gratuit |
| **Transcript.com** | Transcription podcasts | https://app.transcript.com | payant |
| **n8n** | Orchestration polling Notion | https://app.n8n.io | ✅ tier gratuit |
| **NextAuth v5** | Gestion sessions (intégré) | — | — |

**Minimum pour démarrer** : Upstash Redis + Notion OAuth + DeepSeek (qualification fonctionnelle, sans ingestion automatique n8n)

---

## Installation

### 1. Cloner le repo

```bash
git clone https://github.com/Falyboy/edflex-qualification.git
cd edflex-qualification
npm install
```

### 2. Configurer les variables d'environnement

```bash
cp .env.example .env.local
```

Remplir `.env.local` avec vos clés (voir tableau services ci-dessus).

### 3. Configurer Notion OAuth

Sur https://www.notion.so/my-integrations :
- Créer une intégration de type **Public** (OAuth 2.0)
- Redirect URI : `http://localhost:3000/api/auth/notion/callback`
- Copier Client ID et Client Secret dans `.env.local`

### 4. Configurer Google OAuth

Sur https://console.cloud.google.com :
- Créer un projet → Activer **Google Drive API** + **YouTube Data API v3**
- Créer des identifiants OAuth 2.0 (application web)
- Redirect URI : `http://localhost:3000/api/auth/google/callback`
- Copier Client ID et Client Secret dans `.env.local`

### 5. Configurer Upstash Redis

Sur https://upstash.com :
- Créer une base Redis (région Europe de préférence)
- Copier REST URL et REST Token dans `.env.local`

### 6. Lancer en local

```bash
npm run dev
```

Ouvrir http://localhost:3000/edflex

### 7. (Optionnel) Configurer n8n pour le polling automatique

Sans n8n, déclencher manuellement la qualification via :
```bash
curl -X POST http://localhost:3000/api/intake \
  -H "Content-Type: application/json" \
  -d '{"notionPageId": "YOUR_PAGE_ID", "email": "your@email.com"}'
```

---

## Structure du projet

```
edflex-qualification/
│
├── agents/                         ← Prompts LLM (chargés au runtime)
│   ├── AGENT_CONTENU/              ← Module e-learning
│   ├── AGENT_CURATION/             ← Fiche outil
│   ├── AGENT_ROLEPLAY/             ← Scénario roleplay
│   ├── AGENT_CARTE_CONCEPTUELLE/   ← Carte conceptuelle
│   ├── AGENT_BILAN_SOURCES/        ← Bilan des sources
│   └── AGENT_QUIZ/                 ← Quiz automatisé
│
├── app/
│   ├── edflex/                     ← Pages UI (workspace, projets)
│   ├── auth/                       ← Login / Register
│   └── api/
│       ├── edflex/                 ← CRUD projets, ingestion, génération
│       ├── intake/                 ← Pipeline extraction + scoring
│       ├── poll/                   ← Webhook n8n
│       ├── qualify/                ← Qualification manuelle
│       ├── pi-sources/             ← Propriété intellectuelle — sources
│       └── pi-validate/            ← Propriété intellectuelle — validation
│
├── lib/
│   ├── edflex/
│   │   ├── store.ts                ← CRUD projets Redis
│   │   ├── notion-sync.ts          ← Sync résultats → Notion
│   │   ├── notion-schema.ts        ← Schéma base Notion
│   │   ├── render-livrable.ts      ← Rendu HTML livrables
│   │   └── limits.ts              ← Quotas + agents Edflex
│   ├── ingestion/                  ← Loaders par type de source
│   ├── qualification/
│   │   └── scorer-llm.ts          ← Scoring OPAD (prompt DeepSeek)
│   └── generate/
│       └── agents/                 ← Renderers livrables spécialisés
│
└── components/
    └── edflex/                     ← Composants UI Edflex
```

---

## Carte des livrables

| Livrable | Agent | Fichier prompt | Renderer |
|----------|-------|---------------|----------|
| Module E-Learning | AGENT_CONTENU | `agents/AGENT_CONTENU/AGENT_CONTENU.md` | Groq |
| Fiche Outil | AGENT_CURATION | `agents/AGENT_CURATION/AGENT_CURATION.md` | Groq |
| Scénario Roleplay | AGENT_ROLEPLAY | `agents/AGENT_ROLEPLAY/AGENT_ROLEPLAY.md` | Groq |
| Carte Conceptuelle | AGENT_CARTE_CONCEPTUELLE | `agents/AGENT_CARTE_CONCEPTUELLE/AGENT_CARTE_CONCEPTUELLE.md` | `lib/generate/agents/carte-html.ts` |
| Bilan Sources | AGENT_BILAN_SOURCES | `agents/AGENT_BILAN_SOURCES/AGENT_BILAN_SOURCES.md` | DeepSeek |
| Quiz | AGENT_QUIZ | `agents/AGENT_QUIZ/AGENT_QUIZ.md` | DeepSeek |
| Score OPAD | — | `lib/qualification/scorer-llm.ts` (prompt inline) | DeepSeek |

---

## Conformité

- **RGPD** : scoring automatique du niveau de sensibilité des données (`scores.rgpd`)
- **IA Act** : flag de transparence sur les contenus générés par IA (`scores.ia_act`)
- **Propriété intellectuelle** : détection automatique PI sur les sources (`/api/pi-sources`, `/api/pi-validate`)
