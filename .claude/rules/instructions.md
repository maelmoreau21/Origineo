# Origineo - Project Memory (Memoire IA)

> Ce fichier sert de référence exhaustive pour l'IA lors de toute interaction future sur le projet Origineo.
> Derniere mise a jour : 2026-05-01 (Phase 4 - Refonte million-scale workspace arbre + GEDCOM jobs)
> Source de verite : ce fichier uniquement. Ne pas creer de doublon racine `instructions.md`.

## ⚠️ Règle Cruciale : Commits & Git
**L'Agent ne doit JAMAIS effectuer de commit ou de push à moins que cela ne soit EXPLICITEMENT demandé par l'utilisateur.**
Même si une modification est "finie", l'Agent doit attendre une instruction spécifique du type "fais un commit" ou "pousse sur github".

---

## 1. Vue d'Ensemble

**Origineo** est une application web d'arbre généalogique conçue pour gérer des millions de profils avec stabilité et performance.

- **Type** : Application web full-stack
- **Architecture** : Monorepo (pnpm workspaces + Turborepo)
- **Conteneurisation** : 100% Docker (docker-compose)
- **Rôles utilisateur** : Visiteur (lecture seule) / Administrateur (CRUD complet)

---

## 2. Stack Technique

| Couche | Technologie | Version |
|---|---|---|
| Langage | TypeScript | 5.8+ |
| Backend | NestJS | 11 |
| ORM | Prisma | 7 (avec TypedSQL) |
| Base de données | PostgreSQL | 17-alpine |
| Frontend | Next.js (App Router) | 15 |
| UI Framework | React | 19 |
| Visualisation principale | Workspace arbre SVG maison | apps/web/src/components/tree-workspace |
| Layout Engine | apps/web/src/lib/family-layout | Inspire de donatso/family-chart (MIT) |
| GEDCOM Parser | read-gedcom | 0.3.x |
| Authentification | JWT (Passport) | — |
| Package Manager | pnpm | 9.15+ |
| Monorepo Tool | Turborepo | 2.5+ |
| Runtime | Node.js | 22 |

---

## 3. Arborescence du Projet

```
Origineo/
├── apps/
│   ├── api/                             # Backend NestJS 11
│   │   ├── src/
│   │   │   ├── main.ts                  # Point d'entrée + Swagger
│   │   │   ├── app.module.ts            # Module racine
│   │   │   ├── prisma/                  # PrismaService (singleton)
│   │   │   ├── common/                  # Guards, Filters, Decorators
│   │   │   │   ├── guards/              # JwtAuthGuard, RolesGuard
│   │   │   │   ├── filters/             # HttpExceptionFilter
│   │   │   │   └── decorators/          # @Roles(), @Public()
│   │   │   └── modules/
│   │   │       ├── auth/                # JWT Auth (Register/Login)
│   │   │       ├── person/              # CRUD Personnes
│   │   │       ├── relationship/        # Relations parent-enfant
│   │   │       ├── union/               # Couples (mariage, PACS)
│   │   │       ├── tree/                # Navigation arbre (CTE récursives)
│   │   │       ├── search/              # Recherche full-text (pg_trgm)
│   │   │       ├── gedcom/              # Import/Export/Merge GEDCOM
│   │   │       │   ├── gedcom.service.ts       # Import/Export basique
│   │   │       │   └── gedcom-merge.service.ts # Fusion avancée avec doublons
│   │   │       └── document/            # Upload/Download fichiers
│   │   │           ├── document.service.ts     # Logique stockage UUID-folders
│   │   │           └── document.controller.ts  # API Upload/Download/View
│   │   ├── prisma/
│   │   │   └── schema.prisma            # Schéma BDD complet
│   │   ├── Dockerfile                   # Multi-stage (dev + prod)
│   │   └── nest-cli.json                # SWC builder
│   │
│   └── web/                             # Frontend Next.js 15
│       ├── src/
│       │   ├── app/                     # App Router
│       │   │   ├── layout.tsx           # Layout + Sidebar Navigation
│       │   │   ├── page.tsx             # TreeWorkspace principal
│       │   │   ├── search/page.tsx      # Recherche multi-critères (texte, dates, lieu, genre)
│       │   │   ├── person/[id]/page.tsx # Fiche personne
│       │   │   └── admin/page.tsx       # Panel admin
│       │   ├── components/tree-workspace/ # Workspace arbre, canvas, drawers, inspecteur
│       │   ├── lib/family-layout/       # Adaptateur/layout inspire family-chart
│       │   ├── lib/api.ts               # Client API typé
│       │   └── styles/globals.css       # Design system dark theme
│       ├── Dockerfile                   # Multi-stage (dev + prod)
│       └── next.config.ts
│
├── packages/
│   └── shared/                          # Types & Enums partagés
│       └── src/
│           ├── types/index.ts
│           ├── enums/index.ts
│           └── index.ts
│
├── docker/
│   └── postgres/init.sql                # Extensions PG (uuid-ossp, pg_trgm)
│
├── storage/                             # Stockage fichiers (créé runtime)
│   ├── persons/{UUID}/                  # Dossiers individuels
│   └── unions/{UUID1}_{UUID2}/          # Dossiers de couples
│
├── nginx/                               # Reverse proxy production
│   ├── nginx.conf                       # Config Nginx (gzip, rate limit, headers)
│   └── ssl/                             # Certificats SSL (Let's Encrypt)
│
├── docker-compose.yml                   # Dev: PostgreSQL + API + Web + volumes
├── docker-compose.prod.yml              # Prod: + Nginx + resource limits + health checks
├── .env.example                         # Variables d'environnement (dev)
├── .env.prod.example                    # Variables d'environnement (prod)
├── README.md                            # Documentation complète + déploiement
├── .claude/                            # Configuration et règles IA
│   └── rules/
│       └── instructions.md              # Ce fichier (Mémoire & Règles)
├── .github/                             # CICD (GitHub Actions)
├── turbo.json                           # Pipeline Turborepo
├── pnpm-workspace.yaml                  # Workspaces
└── README.md                            # Documentation publique
```

---

## 4. Schéma de Base de Données

### 4.1 Modèles Principaux

#### Person (persons)
| Colonne | Type | Contraintes |
|---|---|---|
| id | UUID | PK, auto-generated |
| usage_surname | VARCHAR | Nullable, indexé |
| birth_surname | VARCHAR | Nullable, indexé |
| given_names | VARCHAR | NOT NULL, indexé |
| gender | ENUM | MALE/FEMALE/OTHER/UNKNOWN, default UNKNOWN |
| birth_date | DATE | Nullable, indexé |
| birth_place | VARCHAR | Nullable |
| death_date | DATE | Nullable |
| death_place | VARCHAR | Nullable |
| professions | VARCHAR[] | Default [] |
| notes | TEXT | Nullable |
| given_names_normalized / surname_normalized / primary_name_normalized | TEXT | Index BTREE + trigram pour recherche/fusion |
| birth_year / death_year | INTEGER | Index pour filtrage massif |
| is_root_default | BOOLEAN | Default false |
| created_at | TIMESTAMP | Auto |
| updated_at | TIMESTAMP | Auto |

#### Relationship (relationships)
| Colonne | Type | Contraintes |
|---|---|---|
| id | UUID | PK |
| parent_id | UUID | FK → persons, indexé |
| child_id | UUID | FK → persons, indexé |
| type | ENUM | BIOLOGICAL/ADOPTIVE/FOSTER |
| created_at | TIMESTAMP | Auto |
| **Unique** | | (parent_id, child_id) |

#### Union (unions)
| Colonne | Type | Contraintes |
|---|---|---|
| id | UUID | PK |
| partner1_id | UUID | FK → persons, indexé |
| partner2_id | UUID | FK → persons, indexé |
| type | ENUM | MARRIAGE/PACS/PARTNERSHIP/OTHER |
| start_date | DATE | Nullable |
| start_place | VARCHAR | Nullable |
| end_date | DATE | Nullable |
| end_reason | ENUM | DIVORCE/DEATH/ANNULMENT/OTHER, nullable |
| notes | TEXT | Nullable |
| created_at / updated_at | TIMESTAMP | Auto |

#### Document (documents)
| Colonne | Type | Contraintes |
|---|---|---|
| id | UUID | PK |
| person_id | UUID | FK → persons, nullable, indexé |
| union_id | UUID | FK → unions, nullable, indexé |
| filename | VARCHAR | NOT NULL |
| mime_type | VARCHAR | NOT NULL |
| storage_path | VARCHAR | NOT NULL |
| category | ENUM | BIRTH_CERT/DEATH_CERT/MARRIAGE_CERT/PHOTO/OFFICIAL_DOC/OTHER |
| description | TEXT | Nullable |
| created_at | TIMESTAMP | Auto |

#### User (users)
| Colonne | Type | Contraintes |
|---|---|---|
| id | UUID | PK |
| email | VARCHAR | UNIQUE |
| password_hash | VARCHAR | NOT NULL |
| display_name | VARCHAR | Nullable |
| role | ENUM | ADMIN/VISITOR, default VISITOR |
| created_at / updated_at | TIMESTAMP | Auto |

#### GedcomJob / Staging
| Table | Role |
|---|---|
| gedcom_jobs | Job persiste d'import/fusion (`IMPORT`/`MERGE`, status, compteurs, resume) |
| gedcom_staged_persons | Personnes parsees depuis `.ged`/`.gedcom`, noms normalises, annee naissance, decision |
| gedcom_staged_families | Familles parsees, conjoints, enfants, mariage |
| gedcom_duplicate_candidates | Candidats de doublons pagines avec score et raisons |

### 4.2 Extensions PostgreSQL
- `uuid-ossp` — Génération d'UUID
- `pg_trgm` — Recherche fuzzy par trigrammes

### 4.3 Stratégie de Requêtes
- **Chargement d'arbre** : CTE récursives avec limite de profondeur + fenetre active (`limit`, `siblings`, `spouses`, `stats.truncated`). Ne jamais charger tout l'arbre dans le viewer.
- **Recherche** : Colonnes normalisees + opérateur `%` (similarity) + `ILIKE` via pg_trgm, avec filtres SQL combinables (dates de naissance/décès, lieu, genre)
- **Calcul de parenté** : BFS bidirectionnel avec limite de profondeur 20

### 4.4 Système de Stockage Fichiers
- **Structure** : `storage/persons/{UUID}/` pour les documents individuels, `storage/unions/{UUID1}_{UUID2}/` pour les documents de couple
- **Nommage** : Les dossiers sont nommés par UUID de l'entité. Les fichiers sont renommés `{nom_original}_{8chars_uuid}.ext` pour éviter les collisions.
- **Volume Docker** : Volume persistant `filedata` monté sur `/app/storage`
- **Variable** : `STORAGE_PATH` (défaut: `../../storage` en dev, `/app/storage` en Docker)

---

## 5. API Endpoints

### Auth
| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | /api/auth/register | Public | Inscription (1er user = ADMIN) |
| POST | /api/auth/login | Public | Connexion → JWT |
| GET | /api/auth/me | JWT | Profil utilisateur |

### Persons
| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | /api/persons | Public | Liste paginée |
| GET | /api/persons/root | Public | Personne racine par défaut |
| GET | /api/persons/:id | Public | Détail + relations |
| POST | /api/persons | ADMIN | Créer |
| PATCH | /api/persons/:id | ADMIN | Modifier |
| DELETE | /api/persons/:id | ADMIN | Supprimer |
| DELETE | /api/persons/:id/branch | ADMIN | Supprimer ou simuler une branche (?includeRoot=true&simulate=true) |

### Relationships
| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | /api/relationships | ADMIN | Créer relation parent-enfant |
| GET | /api/relationships/person/:id | Public | Relations d'une personne |
| DELETE | /api/relationships/:id | ADMIN | Supprimer |

### Unions
| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | /api/unions | ADMIN | Créer |
| GET | /api/unions | Public | Liste paginée |
| GET | /api/unions/:id | Public | Détail |
| GET | /api/unions/person/:id | Public | Unions d'une personne |
| PATCH | /api/unions/:id | ADMIN | Modifier |
| DELETE | /api/unions/:id | ADMIN | Supprimer |

### Tree
| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | /api/tree/:personId | Public | Fenetre arbre dynamique (?ancestors=4&descendants=2&siblings=true&spouses=true&limit=1200) |
| GET | /api/tree/relationship/:a/:b | Public | Chemin de parenté entre 2 personnes |

### Search
| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | /api/search | Public | Recherche multi-critères (`q`, `place`, `gender`, `birthDateFrom`, `birthDateTo`, `deathDateFrom`, `deathDateTo`, `page`, `limit`) |

### GEDCOM
| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | /api/gedcom/jobs?mode=import\|merge | ADMIN | Cree un job persiste depuis `.ged` ou `.gedcom` |
| GET | /api/gedcom/jobs/:id | ADMIN | Status et compteurs du job |
| GET | /api/gedcom/jobs/:id/candidates | ADMIN | Candidats de doublons pagines |
| POST | /api/gedcom/jobs/:id/apply | ADMIN | Applique merge/create/skip par batch |
| POST | /api/gedcom/import | ADMIN | Compat: import simple (accepte .ged/.gedcom) |
| POST | /api/gedcom/merge/analyze | ADMIN | Compat: analyse un .ged/.gedcom pour fusion (detecte doublons) |
| POST | /api/gedcom/merge/apply | ADMIN | Applique les décisions de fusion (merge/create/skip) |
| GET | /api/gedcom/export | Public | Download .ged |

### Documents
| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | /api/documents/upload | ADMIN | Upload fichier (multipart, ?personId=&category=) |
| GET | /api/documents/person/:id | Public | Lister docs d'une personne |
| GET | /api/documents/union/:id | Public | Lister docs d'un couple |
| GET | /api/documents/:id | Public | Métadonnées d'un document |
| GET | /api/documents/:id/download | Public | Télécharger un document |
| GET | /api/documents/:id/view | Public | Afficher inline (images, PDF) |
| DELETE | /api/documents/:id | ADMIN | Supprimer (fichier + BDD) |

---

## 6. Conventions de Code

- **Naming** : camelCase (TS), snake_case (BDD columns)
- **Modules NestJS** : 1 module = 1 domaine (controller, service, DTOs)
- **Validation** : class-validator + ValidationPipe global
- **Erreurs** : HttpExceptionFilter global → réponses JSON uniformes
- **Auth** : @Public() pour endpoints publics, @Roles('ADMIN') pour mutations
- **Prisma** : PrismaService global (singleton + driver adapter pg), raw SQL pour CTE/pg_trgm
- **Fichiers** : Stockage local dans dossiers UUID. Limite upload : 20 MB
- **GEDCOM Merge** : Les nouveaux workflows passent par `GedcomJob` persiste + staging pagine. Les routes historiques restent disponibles comme compatibilite.
- **UX Prioritaire (Workspace arbre)** : Toutes les mutations principales doivent rester accessibles depuis l'ecran d'arbre : ajouter parent/enfant/conjoint, modifier fiche, importer/fusionner GEDCOM, rattacher un composant, supprimer personne/branche, exporter branche.
- **Visualisation** : Le rendu principal n'utilise plus React Flow/Dagre. Utiliser `apps/web/src/lib/family-layout` (format `{ id, data, rels }` inspire `donatso/family-chart`) avec conjoints alignes et liens SVG propres.

---

## 7. Commandes de Développement

```bash
# Installation
pnpm install

# Développement (tous les services)
docker compose up -d db    # PostgreSQL uniquement
pnpm run dev               # API + Web en parallèle

# Ou tout via Docker
docker compose up --build

# Base de données
pnpm --filter @origineo/api prisma migrate dev
pnpm --filter @origineo/api prisma studio
pnpm --filter @origineo/api prisma generate

# Build production
pnpm run build

# Tests
pnpm --filter @origineo/api test        # Lancer les 41 tests
pnpm --filter @origineo/api test:watch  # Mode watch
pnpm --filter @origineo/api test:cov    # Avec couverture

# Production
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

---

## 8. Variables d'Environnement

| Variable | Description | Default |
|---|---|---|
| DB_USER | Utilisateur PostgreSQL | origineo |
| DB_PASSWORD | Mot de passe PostgreSQL | origineo_secret_change_me |
| DB_NAME | Nom de la base | origineo |
| DB_PORT | Port PostgreSQL | 5432 |
| DATABASE_URL | URL Prisma complète | — |
| JWT_SECRET | Clé secrète JWT | change_me |
| JWT_EXPIRATION | Durée du token | 7d |
| API_PORT | Port de l'API | 3001 |
| STORAGE_PATH | Chemin racine du stockage fichiers | /app/storage (Docker) ou ../../storage (dev) |
| NEXT_PUBLIC_API_URL | URL de l'API pour le frontend | http://localhost:3001 |

---

## 9. Phases de Développement

### Phase 1 ✅ (Livrable Initial)
- Infrastructure monorepo + Docker
- Schéma BDD Prisma complet (Prisma 7 + driver adapter)
- Backend NestJS 11 avec modules : Auth, Person, Relationship, Union, Tree, Search, GEDCOM
- Frontend Next.js 15 avec arbre interactif (React Flow + Dagre)
- Auth JWT + rôles (ADMIN/VISITOR)
- GEDCOM import/export basique
- Recherche fuzzy pg_trgm + filtres avancés (dates, lieu, genre)

### Phase 2 ✅ (Stockage & Fusion)
- **DocumentModule** : Upload, téléchargement, visualisation inline, suppression
- **Dossiers UUID** : `storage/persons/{uuid}/` et `storage/unions/{uuid1}_{uuid2}/`
- **Volume Docker persistant** `filedata` pour les fichiers uploadés
- **Fusion GEDCOM avancée** : Analyse en 2 étapes (analyze → review → apply)
- **Détection de doublons** : Algorithme bigram (prénoms 30pts, nom 30pts, genre 10pts, date 20pts, lieu 10pts)
- **Interface de résolution** : Cartes comparatives GEDCOM vs BDD avec score de confiance et boutons merge/create/skip
- **Fiche personne enrichie** : Section Documents avec upload, preview images, téléchargement, suppression
- **Types partagés** : MergeAnalysisDto, DuplicateCandidateDto, MergeDecisionDto, MergeResultDto

### Phase 3 ✅ (Tests, Production & UI)
- **41 tests unitaires** (Vitest) : merge scoring (18), tree logic (12), route security (11)
- **Arbre React Flow optimisé** : ReactFlowProvider, fitView animé, transitions entre profondeurs
- **CI/CD GitHub Actions** : Build & Push automatique vers GHCR (`origineo-api`, `origineo-web`)
- **docker-compose.prod.yml** : Images distantes GHCR, health checks, resource limits
- **Nginx** : gzip, rate limiting (login/api), security headers, cache assets, HTTPS ready
- **README.md** : Guide complet (quick start, déploiement CI/CD, API reference)
- **.env.prod.example** : Template avec instructions de sécurité

### Phase 4 ✅ (Refonte Million-Scale Workspace)
- **Fenetre active arbre** : `GET /api/tree/:rootPersonId` expose `ancestors`, `descendants`, `siblings`, `spouses`, `limit` et `stats.truncated`.
- **Stockage million-scale** : champs/index normalises sur Person (`givenNamesNormalized`, `surnameNormalized`, `primaryNameNormalized`, `birthYear`, `deathYear`) + trigram.
- **GEDCOM jobs** : `GedcomJob`, staging personnes/familles, candidats pagines, application batch, `.ged` et `.gedcom`.
- **Simulation suppression branche** : `DELETE /api/persons/:id/branch?simulate=true` retourne personnes/relations/unions/documents avant confirmation.
- **Workspace frontend** : `TreeWorkspace`, `TreeCanvas`, `TreeToolbar`, `PersonInspector`, `GedcomImportDrawer`, `MergeReviewDrawer`, `BranchDeleteDialog`.
- **Layout visuel** : moteur SVG maison inspire de `donatso/family-chart` (MIT) : conjoints alignes, bus parent-enfant, chemins courbes, fenetre navigable.

### Phase 5 (Prochaine)
- Rattachement complet de composants depuis le workspace principal
- Historique de modifications visible dans l'inspecteur
- Mode collaboratif temps reel et support multi-langues (i18n)

---

## 10. Architecture de la Fusion GEDCOM

Depuis la Phase 4, le workflow cible est persiste :
`POST /api/gedcom/jobs` parse le fichier, cree le staging et stocke les candidats.
`GET /api/gedcom/jobs/:id/candidates` permet une revue paginee.
`POST /api/gedcom/jobs/:id/apply` applique les decisions par batch.
Les routes `merge/analyze` et `merge/apply` restent pour compatibilite.

### Workflow en 2 étapes

1. **Analyse** (`POST /api/gedcom/merge/analyze`) :
   - Parse le fichier GEDCOM → StagedPersons + StagedFamilies
   - Compare chaque StagedPerson avec TOUTES les personnes existantes
   - Calcule un score de confiance (0-100) basé sur : prénoms, nom, genre, date de naissance, lieu de naissance
   - Retourne un `MergeAnalysis` avec un `sessionId` (TTL 30 min)

2. **Application** (`POST /api/gedcom/merge/apply`) :
   - L'utilisateur envoie ses décisions : `merge`, `create`, ou `skip` pour chaque doublon
   - `merge` : fusionne les données GEDCOM dans la personne existante (ne surcharge jamais les champs non-null)
   - `create` : crée une nouvelle personne indépendante
   - `skip` : ignore la personne
   - Crée ensuite unions et relations en vérifiant les doublons

### Algorithme de Scoring

| Critère | Points max | Détail |
|---|---|---|
| Prénoms identiques | 30 | Exact = 30, partiel = 20, bigram > 70% = proportionnel |
| Nom identique | 30 | Exact = 30, bigram > 70% = proportionnel |
| Genre identique | 10 | UNKNOWN ignoré |
| Date naissance identique | 20 | Même jour = 20, même année (±365j) = 10 |
| Lieu naissance identique | 10 | Exact = 10, partiel = 5 |
| **Seuil minimum** | **40** | En dessous : pas de candidat affiché |
| **Auto-merge** | **70** | Au-dessus : merge par défaut |
