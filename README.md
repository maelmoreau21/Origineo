# 🌳 Origineo

**Application web d'arbre généalogique** conçue pour gérer des millions de profils avec stabilité et performance.

## ✨ Fonctionnalités

- **Arbre interactif** — Visualisation React Flow avec disposition automatique Dagre
- **Chargement dynamique** — CTE récursives pour charger X générations ascendantes/descendantes
- **Import/Export GEDCOM** — Compatibilité GEDCOM 5.5.1 avec fusion avancée et détection de doublons
- **Stockage de documents** — Upload de photos et actes (dossiers UUID par personne/couple)
- **Recherche fuzzy** — Recherche par trigrammes (pg_trgm) sur les noms
- **Calcul de parenté** — BFS bidirectionnel pour trouver le chemin entre deux personnes
- **Auth JWT** — Rôles ADMIN / VISITOR avec guards NestJS
- **Dark theme premium** — Design système glassmorphism avec des micro-animations

## 🏗️ Stack Technique

| Couche | Technologie |
|---|---|
| Backend | NestJS 11 · TypeScript · Prisma 7 |
| Frontend | Next.js 15 · React 19 · React Flow 12 |
| Base de données | PostgreSQL 17 |
| Conteneurisation | Docker + Docker Compose |
| Reverse Proxy | Nginx 1.27 |
| Tests | Vitest |

## 📁 Structure du Projet

```
Origineo/
├── apps/
│   ├── api/            # Backend NestJS
│   └── web/            # Frontend Next.js
├── packages/
│   └── shared/         # Types & Enums partagés
├── nginx/              # Configuration Nginx prod
├── docker/             # Init SQL PostgreSQL
├── docker-compose.yml          # Dev
├── docker-compose.prod.yml     # Production
└── project-memory.md           # Mémoire IA
```

---

## 🚀 Démarrage Rapide (Développement)

### Prérequis

- **Node.js** 22+
- **pnpm** 9.15+
- **Docker** + **Docker Compose**

### 1. Cloner et installer

```bash
git clone https://github.com/votre-user/Origineo.git
cd Origineo
pnpm install
```

### 2. Lancer PostgreSQL

```bash
docker compose up -d db
```

### 3. Configurer l'environnement

```bash
cp .env.example .env
# Modifier les variables si nécessaire
```

### 4. Initialiser la base de données

```bash
pnpm --filter @origineo/api prisma migrate dev
pnpm --filter @origineo/api prisma generate
```

### 5. Lancer l'application

```bash
pnpm run dev
```

- **API** : http://localhost:3001
- **Swagger** : http://localhost:3001/api
- **Frontend** : http://localhost:3000

### 6. Premier utilisateur

Le premier utilisateur enregistré via `/admin` obtient automatiquement le rôle **ADMIN**.

---

## 🐳 Tout via Docker (Développement)

```bash
cp .env.example .env
docker compose up --build
```

---

## 🏭 Déploiement en Production

### 1. Préparer l'environnement

```bash
cp .env.prod.example .env.prod
```

Éditez `.env.prod` avec des valeurs sécurisées :

```env
DB_PASSWORD=un_mot_de_passe_tres_fort_ici
JWT_SECRET=votre_secret_jwt_64_caracteres_aleatoires
NEXT_PUBLIC_API_URL=https://votre-domaine.com
```

> **⚠️ Important** : Utilisez `openssl rand -base64 64 | tr -d '\n'` pour générer le JWT_SECRET.

### 2. SSL (optionnel mais recommandé)

```bash
# Avec Let's Encrypt
certbot certonly --standalone -d votre-domaine.com

# Copier les certificats
cp /etc/letsencrypt/live/votre-domaine.com/fullchain.pem nginx/ssl/cert.pem
cp /etc/letsencrypt/live/votre-domaine.com/privkey.pem nginx/ssl/key.pem
```

Puis décommentez la section HTTPS dans `nginx/nginx.conf`.

### 3. Lancer en production (CI/CD)

Le projet utilise GitHub Actions pour le build automatique. Pour déployer :

1. Se connecter au registry (une fois) :
```bash
echo $GITHUB_TOKEN | docker login ghcr.io -u maelmoreau21 --password-stdin
```
2. Déployer les images distantes :
```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
```

---

## 🚀 CI/CD (GitHub Actions)

L'application inclut un workflow complet :

- **Automated Tests** : Exécution systématique des 41 tests à chaque push.
- **Docker Registry** : Build et push automatique vers **GHCR**.
- **Images** : `ghcr.io/maelmoreau21/origineo-api` & `origineo-web`.

### 4. Vérifier

```bash
# Santé de l'API
curl http://localhost/api

# Santé Nginx
curl http://localhost/health

# Logs
docker compose -f docker-compose.prod.yml logs -f
```

### Architecture de production

```
Internet → Nginx (:80/:443)
                ├── /api/*  → API NestJS (:3001)
                └── /*      → Next.js (:3000)

                      API → PostgreSQL (:5432)
                       │
                       └── Volume: filedata (stockage documents)
```

### Sécurité Production

| Mesure | Détail |
|---|---|
| Rate limiting login | 5 req/min max par IP |
| Rate limiting API | 30 req/s max par IP |
| Security headers | X-Frame-Options, X-XSS-Protection, CSP |
| Upload limit | 25 MB (Nginx) + 20 MB (API) |
| Non-root containers | Utilisateurs `nodejs` / `nextjs` |
| Health checks | Toutes les 10s avec retry |

---

## 🧪 Tests

```bash
# Lancer tous les tests
pnpm --filter @origineo/api test

# Mode watch
pnpm --filter @origineo/api test:watch

# Avec couverture
pnpm --filter @origineo/api test:cov
```

### Tests disponibles

| Suite | Tests | Couverture |
|---|---|---|
| GEDCOM Merge Algorithm | 18 tests | Bigram similarity, scoring, normalization |
| Tree Service | 12 tests | Generation mapping, node building, edge cases |
| Route Security | 11 tests | RolesGuard, RBAC matrix visitor/admin |
| **Total** | **41 tests** | |

---

## 📄 API Endpoints

### Routes Publiques (sans auth)

| Méthode | Route | Description |
|---|---|---|
| GET | `/api/persons` | Liste paginée |
| GET | `/api/persons/root` | Personne racine |
| GET | `/api/persons/:id` | Détail + relations |
| GET | `/api/tree/:id` | Arbre dynamique |
| GET | `/api/tree/relationship/:a/:b` | Chemin de parenté |
| GET | `/api/search?q=...` | Recherche fuzzy |
| GET | `/api/gedcom/export` | Export GEDCOM |
| GET | `/api/documents/person/:id` | Documents d'une personne |
| GET | `/api/documents/:id/download` | Télécharger un document |

### Routes Admin (JWT + rôle ADMIN)

| Méthode | Route | Description |
|---|---|---|
| POST | `/api/persons` | Créer une personne |
| PATCH | `/api/persons/:id` | Modifier |
| DELETE | `/api/persons/:id` | Supprimer |
| POST | `/api/gedcom/import` | Import GEDCOM simple |
| POST | `/api/gedcom/merge/analyze` | Analyse pour fusion |
| POST | `/api/gedcom/merge/apply` | Appliquer fusion |
| POST | `/api/documents/upload` | Upload fichier |
| DELETE | `/api/documents/:id` | Supprimer fichier |

---

## 📝 Licence

MIT © Origineo
