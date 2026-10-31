# 🌳 Origineo Studio v1.0.0
> **Plateforme Professionnelle de Généalogie Interactive à Haute Performance**  
> Conçue pour traiter **10 000 000+ d'individus** en temps réel avec **PostgreSQL 18 Alpine**, **Rust (Axum + SQLx)** et **Svelte 5 (Runes) + SvelteKit 3**.

---

## ⚡ Caractéristiques & Architecture Technique

- **Architecture Cloud-Native Ultra-Légère** :
  - **Rust Backend** : API asynchrone multithreadée avec empreinte mémoire minimale (~30 Mo RAM).
  - **PostgreSQL 18** : Moteur natif `uuidv7()` temporellement ordonné (zéro fragmentation d'index B-Tree).
  - **Zero Database Bloat** : Aucun fichier binaire (BLOB) en base. Les photographies et actes scannés sont gérés sur le système de fichiers (`/uploads`) via des chemins UUID transparents.
  - **Recherche Fuzzy sub-10ms** : Trigrammes `pg_trgm 1.6` avec `unaccent 1.1` et `btree_gin 1.3` permettant des recherches instantanées sur plusieurs millions d'individus.
  - **Single Canonical Database Schema** : Un seul schéma consolidé [`backend/migrations/0001_init.sql`](backend/migrations/0001_init.sql) avec champ extensible `custom_attributes JSONB` pour une pérennité absolue sans migrations morcelées.

---

## 🚀 Fonctionnalités Professionnelles

### 1. Visualisations & Navigation Multi-Vues
- **Arbre Dynamique par Générations (3A/3D)** : Chargement ciblé et fluide de la parenté ascendante et descendante.
- **Roue d'Ascendance Sosa 360° (Fan Chart)** : Éventail circulaire interactif jusqu'à 8–10 générations.
- **Atlas & Carte des Migrations** : Trajectoires de vie (naissance → décès) et migrations intergénérationnelles tracées sur carte interactive Leaflet.
- **Frise Chronologique Historique** : Barres de vie superposées aux contextes historiques (Ancien Régime, Révolution, XIXe Industriel, 14-18, 39-45).

### 2. Édition & Exports Professionnels
- **🖨️ Arbre Géant Vectoriel / SVG (Format Traceur A0/A1)** : Export vectoriel pur haute définition pour impression sur traceur ou traceur papier.
- **📖 Livre de Famille (Chronique Biographique)** : Génération automatique d'un livre généalogique complet illustré par génération.
- **📄 Fiche Biographique Imprimable** : Génération de fiches d'archives conformes pour l'impression ou l'export PDF.

### 3. Contrôle de Cohérence & Outils d'Archives
- **Moteur d'Audit 9 Règles** : Détection des erreurs chronologiques, âges parentaux anormaux, mariages post-mortem et espacements impossibles en fratrie.
- **🏛️ Convertisseur Calendrier Républicain (1792–1805)** : Conversion bidirectionnelle automatique (ex: *14 Brumaire An IV* ↔ *1795-11-05*).
- **👥 Détection d'Homonymes & Fusion Intelligente** : Détection de doublons par score de similarité et fusion côte-à-côte avec réassignation automatique de tous les actes, filiations et documents.
- **📜 Référentiel Sources, Dépôts & Citations (Norme GEDCOM 7)** : Cotes d'archives, indices de certitude (1 à 4) et transcriptions paléographiques.
- **🤝 Témoins & Rôles d'Événements** : Parrains, marraines, célébrants, témoins et notaires rattachés aux actes avec liens interactifs.

---

## 🛠️ Démarrage Rapide

### Prérequis
- [Docker & Docker Compose](https://www.docker.com/)
- [Rust & Cargo](https://rustup.rs/) (1.80+)
- [Node.js & npm](https://nodejs.org/) (Node 20+)

### 1. Lancer la base PostgreSQL 18
```bash
docker compose up -d
```

### 2. Compiler et Lancer le Serveur Rust
```bash
cd backend
$env:DATABASE_URL="postgres://origineo:origineo_secret@127.0.0.1:5432/origineo"
$env:STATIC_DIR="../frontend/build"
$env:STORAGE_PATH="../uploads"
$env:OIDC_DEV_MOCK="true"
cargo run
```

### 3. Compiler le Frontend Svelte 5
```bash
cd frontend
npm install
npm run build
```

Ouvrez ensuite votre navigateur sur **[http://localhost:8080](http://localhost:8080)**.

---

## 🔒 Sécurité & Rôles Utilisateurs
Connexion sécurisée via **SSO OIDC** avec 3 niveaux d'accès :
- **ADMINISTRATEUR** : Accès total, imports/exports GEDCOM, fusions de branches, gestion documentaire et système.
- **MODIFICATEUR** : Ajout et édition de personnes, dates, lieux, actes, témoins et documents.
- **LECTEUR** : Consultation interactive, parcours de l'arbre, carte des migrations, recherche et exports PDF.

---

## 📜 Licence
Projet open-source sous licence **MIT**.
