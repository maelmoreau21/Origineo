# 🌳 Origineo

**Application web d'arbre généalogique** — Conçue pour la stabilité, la performance et la scalabilité.

![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue)
![NestJS](https://img.shields.io/badge/NestJS-11-red)
![Next.js](https://img.shields.io/badge/Next.js-15-black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-blue)
![Docker](https://img.shields.io/badge/Docker-Compose-blue)

---

## ✨ Fonctionnalités

- 🌳 **Visualisation d'arbre interactif** — React Flow avec layout Dagre automatique
- 🔍 **Recherche fuzzy** — PostgreSQL pg_trgm pour la recherche approximative
- 📊 **Chargement dynamique** — CTE récursives, ne charge jamais toute la BDD
- 🔗 **Calcul de parenté** — Chemin le plus court entre deux personnes
- 📄 **GEDCOM** — Import/Export au format .ged (5.5.1)
- 🔐 **Rôles** — Visiteur (lecture seule) et Administrateur (modification)
- 🐳 **100% Docker** — Un seul `docker compose up` pour tout lancer

---

## 🚀 Démarrage Rapide

### Prérequis

- [Docker](https://docs.docker.com/get-docker/) et Docker Compose
- [Node.js 22+](https://nodejs.org/) et [pnpm 9+](https://pnpm.io/)

### Installation

```bash
# 1. Cloner le projet
git clone https://github.com/votre-username/Origineo.git
cd Origineo

# 2. Copier les variables d'environnement
cp .env.example .env

# 3. Installer les dépendances
pnpm install

# 4. Lancer via Docker (recommandé)
docker compose up --build

# Ou lancer manuellement :
docker compose up -d db          # PostgreSQL
pnpm --filter @origineo/api prisma migrate dev  # Migrations
pnpm run dev                     # API + Web
```

### Accès

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API | http://localhost:3001 |
| Swagger Docs | http://localhost:3001/api/docs |
| Prisma Studio | `pnpm --filter @origineo/api prisma studio` |

---

## 📁 Structure du Projet

```
Origineo/
├── apps/api/          # Backend NestJS 11
├── apps/web/          # Frontend Next.js 15
├── packages/shared/   # Types & Enums partagés
├── docker/            # Scripts d'initialisation PostgreSQL
├── docker-compose.yml # Orchestration des services
└── project-memory.md  # Mémoire IA exhaustive
```

Consultez [project-memory.md](./project-memory.md) pour l'architecture détaillée.

---

## 🔧 Commandes Utiles

```bash
pnpm run dev                    # Lancer en développement
pnpm run build                  # Build de production
pnpm --filter @origineo/api prisma migrate dev   # Migrations BDD
pnpm --filter @origineo/api prisma studio        # IDE visuel BDD
```

---

## 📄 Licence

Ce projet est privé. Tous droits réservés.
