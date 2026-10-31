-- Demo Seed Data: Moreau / Lefebvre multi-generational pedigree
INSERT INTO places (id, name, subdivision, region, country, latitude, longitude) VALUES
('018e0000-0000-7000-8000-000000000001'::uuid, 'Bordeaux', 'Gironde', 'Nouvelle-Aquitaine', 'France', 44.8378, -0.5792),
('018e0000-0000-7000-8000-000000000002'::uuid, 'Paris', 'Île-de-France', 'Île-de-France', 'France', 48.8566, 2.3522),
('018e0000-0000-7000-8000-000000000003'::uuid, 'Lyon', 'Rhône', 'Auvergne-Rhône-Alpes', 'France', 45.7640, 4.8357),
('018e0000-0000-7000-8000-000000000004'::uuid, 'Nantes', 'Loire-Atlantique', 'Pays de la Loire', 'France', 47.2184, -1.5536)
ON CONFLICT (id) DO NOTHING;

INSERT INTO persons (
    id, tree_id, given_names, usage_surname, birth_surname, gender,
    birth_date, birth_place_id, death_date, death_place_id,
    professions, residences, notes, nickname, title,
    military_regiment, military_serial, nobility_coat_of_arms, signature_status,
    birth_republican, death_republican,
    given_names_normalized, surname_normalized, primary_name_normalized,
    birth_year, death_year, is_root_default
) VALUES
(
    '018e0000-0000-7000-8000-000000000010'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Jean-Baptiste', 'MOREAU', 'MOREAU', 'MALE',
    '1880-04-12', '018e0000-0000-7000-8000-000000000001'::uuid,
    '1952-11-20', '018e0000-0000-7000-8000-000000000001'::uuid,
    ARRAY['Horloger', 'Maître artisan'], ARRAY['Bordeaux, Gironde'],
    'Ancien combattant 14-18, blessé à Verdun.', 'Le Taciturne', 'Maître horloger',
    '144e Régiment d''Infanterie', 'Classe 1900, Matricule 2408', NULL, 'SIGNS',
    NULL, NULL,
    'jean baptiste', 'moreau', 'jean baptiste moreau',
    1880, 1952, true
),
(
    '018e0000-0000-7000-8000-000000000011'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Marie-Louise', 'MOREAU', 'LEFEBVRE', 'FEMALE',
    '1885-08-25', '018e0000-0000-7000-8000-000000000004'::uuid,
    '1968-03-14', '018e0000-0000-7000-8000-000000000001'::uuid,
    ARRAY['Institutrice'], ARRAY['Nantes', 'Bordeaux'],
    'Médaillée des Palmes académiques.', NULL, NULL,
    NULL, NULL, NULL, 'SIGNS',
    NULL, NULL,
    'marie louise', 'moreau', 'marie louise moreau',
    1885, 1968, false
),
(
    '018e0000-0000-7000-8000-000000000012'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Henri', 'MOREAU', 'MOREAU', 'MALE',
    '1852-02-18', '018e0000-0000-7000-8000-000000000001'::uuid,
    '1928-09-03', '018e0000-0000-7000-8000-000000000001'::uuid,
    ARRAY['Vigneron'], ARRAY['Bordeaux'],
    'Propriétaire récoltant.', NULL, NULL,
    NULL, NULL, NULL, 'SIGNS',
    NULL, NULL,
    'henri', 'moreau', 'henri moreau',
    1852, 1928, false
),
(
    '018e0000-0000-7000-8000-000000000013'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Catherine', 'MOREAU', 'DUPONT', 'FEMALE',
    '1856-07-14', '018e0000-0000-7000-8000-000000000001'::uuid,
    '1935-01-22', '018e0000-0000-7000-8000-000000000001'::uuid,
    ARRAY['Couturière'], ARRAY['Bordeaux'],
    NULL, NULL, NULL,
    NULL, NULL, NULL, 'DOES_NOT_SIGN',
    NULL, NULL,
    'catherine', 'moreau', 'catherine moreau',
    1856, 1935, false
),
(
    '018e0000-0000-7000-8000-000000000014'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'Pierre', 'MOREAU', 'MOREAU', 'MALE',
    '1910-06-04', '018e0000-0000-7000-8000-000000000001'::uuid,
    '1995-12-18', '018e0000-0000-7000-8000-000000000002'::uuid,
    ARRAY['Ingénieur des Ponts'], ARRAY['Paris'],
    NULL, NULL, NULL,
    NULL, NULL, NULL, 'SIGNS',
    NULL, NULL,
    'pierre', 'moreau', 'pierre moreau',
    1910, 1995, false
),
(
    '018e0000-0000-7000-8000-000000000015'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'François', 'MOREAU', 'MOREAU', 'MALE',
    '1795-11-05', '018e0000-0000-7000-8000-000000000001'::uuid,
    '1870-04-10', '018e0000-0000-7000-8000-000000000001'::uuid,
    ARRAY['Tonnelier'], ARRAY['Bordeaux'],
    'Né sous le Directoire.', NULL, NULL,
    NULL, NULL, NULL, 'DOES_NOT_SIGN',
    '14 Brumaire An IV', NULL,
    'francois', 'moreau', 'francois moreau',
    1795, 1870, false
)
ON CONFLICT (id) DO NOTHING;

-- Relationships (Parents -> Children)
INSERT INTO relationships (id, tree_id, parent_id, child_id, type) VALUES
('018e0000-0000-7000-8000-000000000020'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '018e0000-0000-7000-8000-000000000012'::uuid, '018e0000-0000-7000-8000-000000000010'::uuid, 'BIOLOGICAL'),
('018e0000-0000-7000-8000-000000000021'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '018e0000-0000-7000-8000-000000000013'::uuid, '018e0000-0000-7000-8000-000000000010'::uuid, 'BIOLOGICAL'),
('018e0000-0000-7000-8000-000000000022'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '018e0000-0000-7000-8000-000000000010'::uuid, '018e0000-0000-7000-8000-000000000014'::uuid, 'BIOLOGICAL'),
('018e0000-0000-7000-8000-000000000023'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '018e0000-0000-7000-8000-000000000011'::uuid, '018e0000-0000-7000-8000-000000000014'::uuid, 'BIOLOGICAL'),
('018e0000-0000-7000-8000-000000000024'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '018e0000-0000-7000-8000-000000000015'::uuid, '018e0000-0000-7000-8000-000000000012'::uuid, 'BIOLOGICAL')
ON CONFLICT (id) DO NOTHING;

-- Unions
INSERT INTO unions (id, tree_id, partner1_id, partner2_id, type, start_date, start_place) VALUES
('018e0000-0000-7000-8000-000000000030'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '018e0000-0000-7000-8000-000000000010'::uuid, '018e0000-0000-7000-8000-000000000011'::uuid, 'MARRIAGE', '1908-07-20', 'Bordeaux, Gironde'),
('018e0000-0000-7000-8000-000000000031'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '018e0000-0000-7000-8000-000000000012'::uuid, '018e0000-0000-7000-8000-000000000013'::uuid, 'MARRIAGE', '1878-05-14', 'Bordeaux, Gironde')
ON CONFLICT (id) DO NOTHING;

-- Repositories & Sources
INSERT INTO repositories (id, tree_id, name, type, website_url) VALUES
('018e0000-0000-7000-8000-000000000040'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, 'Archives Départementales de la Gironde', 'ARCHIVES_DEPARTEMENTALES', 'https://archives.gironde.fr')
ON CONFLICT (id) DO NOTHING;

INSERT INTO sources (id, tree_id, repository_id, title, call_number, source_type, reliability, url) VALUES
('018e0000-0000-7000-8000-000000000050'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '018e0000-0000-7000-8000-000000000040'::uuid, 'Registre des naissances de Bordeaux (1880)', '4 E 1524', 'ETAT_CIVIL', 'PRIMARY', 'https://archives.gironde.fr')
ON CONFLICT (id) DO NOTHING;

INSERT INTO citations (id, source_id, person_id, page_folio, confidence, transcription) VALUES
('018e0000-0000-7000-8000-000000000060'::uuid, '018e0000-0000-7000-8000-000000000050'::uuid, '018e0000-0000-7000-8000-000000000010'::uuid, 'Vue 85/210, Acte N° 412', 4, 'L''an mil huit cent quatre-vingt, le douze avril... est né Jean-Baptiste Moreau...')
ON CONFLICT (id) DO NOTHING;
