# Origineo — Project Memory (Mémoire IA)

> Ce fichier sert de référence exhaustive pour l'IA lors de toute interaction future sur le projet Origineo.
> Dernière mise à jour : 2026-04-19

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
| Visualisation | React Flow (@xyflow/react) | 12 |
| Layout Engine | Dagre | 0.8.5 |
| GEDCOM Parser | read-gedcom | 2+ |
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
│   │   │       └── gedcom/              # Import/Export GEDCOM
│   │   ├── prisma/
│   │   │   └── schema.prisma            # Schéma BDD complet
│   │   ├── Dockerfile                   # Multi-stage (dev + prod)
│   │   └── nest-cli.json                # SWC builder
│   │
│   └── web/                             # Frontend Next.js 15
│       ├── src/
│       │   ├── app/                     # App Router
│       │   │   ├── layout.tsx           # Layout + Sidebar Navigation
│       │   │   ├── page.tsx             # Arbre (React Flow + Dagre)
│       │   │   ├── search/page.tsx      # Recherche fuzzy
│       │   │   ├── person/[id]/page.tsx # Fiche personne
│       │   │   └── admin/page.tsx       # Panel admin
│       │   ├── components/tree/         # PersonNode (custom node)
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
├── docker-compose.yml                   # Dev: PostgreSQL + API + Web
├── .env.example                         # Variables d'environnement
├── turbo.json                           # Pipeline Turborepo
├── pnpm-workspace.yaml                  # Workspaces
└── project-memory.md                    # Ce fichier
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

### 4.2 Extensions PostgreSQL
- `uuid-ossp` — Génération d'UUID
- `pg_trgm` — Recherche fuzzy par trigrammes

### 4.3 Stratégie de Requêtes
- **Chargement d'arbre** : CTE récursives avec limite de profondeur
- **Recherche** : Opérateur `%` (similarity) + `ILIKE` via pg_trgm
- **Calcul de parenté** : BFS bidirectionnel avec limite de profondeur 20

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
| GET | /api/tree/:personId | Public | Arbre dynamique (?ancestors=4&descendants=2) |
| GET | /api/tree/relationship/:a/:b | Public | Chemin de parenté entre 2 personnes |

### Search
| Méthode | Route | Auth | Description |
|---|---|---|---|
| GET | /api/search?q=... | Public | Recherche fuzzy |

### GEDCOM
| Méthode | Route | Auth | Description |
|---|---|---|---|
| POST | /api/gedcom/import | ADMIN | Upload .ged |
| GET | /api/gedcom/export | Public | Download .ged |

---

## 6. Conventions de Code

- **Naming** : camelCase (TS), snake_case (BDD columns)
- **Modules NestJS** : 1 module = 1 domaine (controller, service, DTOs)
- **Validation** : class-validator + ValidationPipe global
- **Erreurs** : HttpExceptionFilter global → réponses JSON uniformes
- **Auth** : @Public() pour endpoints publics, @Roles('ADMIN') pour mutations
- **Prisma** : PrismaService global (singleton), raw SQL pour CTE/pg_trgm

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
| NEXT_PUBLIC_API_URL | URL de l'API pour le frontend | http://localhost:3001 |

---

## 9. Phases de Développement

### Phase 1 ✅ (Livrable Initial)
- Infrastructure monorepo + Docker
- Schéma BDD Prisma complet
- Backend NestJS avec tous les modules
- Frontend Next.js avec arbre interactif
- Auth JWT + rôles
- GEDCOM import/export
- Recherche fuzzy

### Phase 2 (Prochaine)
- Upload de fichiers (photos, documents officiels)
- Dossiers UUID par personne et par couple
- Fusion GEDCOM avancée
- Thème clair / sombre
- Tests automatisés (Vitest)

### Phase 3 (Future)
- Export PDF de l'arbre
- Notifications et historique des modifications
- Mode collaboratif temps réel
- Support multi-langues (i18n)
