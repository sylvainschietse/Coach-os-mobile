# Génère le SQL des 12 programmes pilotes (3 objectifs x 4 niveaux). Identifiants déterministes : relançable.
import json, uuid

NS = uuid.UUID('6f1c2a5e-3b7d-4c11-9a2e-5d8f0b4c7e21')
uid = lambda *k: str(uuid.uuid5(NS, '/'.join(map(str, k))))
COACH = 'db277d8d-1f4c-43b1-99d2-dcc69391308e'

EX = {
 'Dead bug': '0ccb323c-3d61-4d77-ab6c-dc2667e93b84', 'Planche latérale': 'd59427f8-87e5-454c-a6c3-fae59af892c3',
 'Rotation thoracique à quatre pattes': '18f38aaa-e5da-48ac-93c7-27cc970cbdbc', 'Cercles articulaires contrôlés de l’épaule': 'd5868a8b-c096-4fb3-b73a-2eb4c4a4a451',
 'Mobilité cheville genou au mur': 'ac41b563-73f7-438b-9c42-8c204ec5d6a8', 'Cercles articulaires contrôlés de hanche': '3a37aa58-e52c-49a8-ac86-76f916beb793',
 'Vélo stationnaire': 'f2f7fe1b-d85b-4af3-875a-a6e97a49ad39', 'Rameur': '2b9271c9-6a30-42f1-ada6-c64d1c2947d2',
 'Tirage horizontal assis prise neutre — poulie': '273858ae-b8a5-4b93-a1b4-edb270a4ec2f', 'Développé couché — barre': '9a29cae6-5f8d-4e0f-ad08-3600a8cd384c',
 'Mollets debout — machine': '02c4476a-25d9-4d9e-b2d4-da94c31de386', 'Oiseau sur banc incliné — haltères': 'b1d1d5c5-c597-4220-907b-6f7d7b68e930',
 'Élévation latérale — haltères': '9ffab101-a6a3-4804-80ad-a38c41116207', 'Leg curl assis — machine': '87d08018-1d3f-4d50-b3f9-71067fc92904',
 'Curl debout supination — haltères': '883b87c2-fb67-4f91-a2b6-14492a1a24a6', 'Extension triceps au-dessus de la tête — poulie': '9da93a7b-95e4-4341-bfe0-bc2cd0b53337',
 'Développé militaire debout — haltères': '6d69420b-1043-41ff-898c-6f5a748c1770', 'Développé incliné — haltères': 'ae8f40d4-1320-415f-ace9-41bdd56a5c8c',
 'Squat arrière — barre': '708d6ec3-178f-441a-a06d-943195d554f2', 'Extension triceps poulie corde': '6ac05ab0-4f05-45c2-8b29-cf7ac5c7d5df',
 'Fente arrière — haltères': 'ff31be18-42fe-4967-b4ab-45d1e2823133', 'Curl marteau — haltères': '669ef970-da37-480c-8d43-631bdd6fbdef',
 'Presse à cuisses inclinée — machine': '71a185a3-8268-4776-a703-0d07f31e8aef', 'Tirage vertical poitrine prise pronation — poulie': '79da5ee2-d0ac-42d8-adf3-3a8702655f38',
 'Soulevé de terre roumain — barre': '58ba8677-bb44-4efb-9378-90d254a597d6', 'Rowing à un bras — haltères': 'a8a5a3a1-d3bb-4c19-9d20-9f7a7dc17b45',
 'Soulevé de terre roumain — haltères': '251a33f7-3ddd-4ece-9a4a-d7c6bfa65787', 'Élévation latérale — poulie': 'e582c529-0141-43dd-8a3e-2f903e668173',
 'Squat goblet — haltères': '0c0096e1-3e25-44af-9b3c-75d2e5536193', 'Hip thrust — barre': '288e08ff-7e3c-479f-92aa-f73fa995beb5',
 'Leg extension — machine': 'c64b9f7a-f2ab-4337-a530-aa1aa7df185a', 'Soulevé de terre conventionnel — barre': '8513c068-f1be-44d1-80b7-07d68a456afa',
 'Développé couché — haltères': '6832de1e-d50c-4b39-a60e-52fa1f0e556e', 'Split squat — haltères': '51c23125-b251-4501-afc8-5f4a5578be39',
 'Mollets assis — machine': '8bf2f683-078b-4e21-9741-30cd6fe5273a', 'Presse à cuisses horizontale — machine': '109a3096-2afc-4f9c-9ab8-576f175aede5',
 'Développé incliné — Smith machine': '6dbff9b0-389c-4fd4-ae2d-954cffc6ebae', 'Tirage horizontal assis prise large — poulie': '78a6ac6b-2d33-4213-a2a7-57f2d1683aba',
 'Tirage vertical poitrine prise pronation — machine': '1e1fb0b7-6ad0-46da-96c1-e3c88b59cd72', 'Extension triceps au-dessus de la tête — haltères': 'b518fe28-65b0-4265-b64f-e1e0d8e331ac',
 'Leg curl assis machine sur une jambe': '569049f3-ffd6-48f5-b389-8be5673995d0', 'Rowing buste penché — barre': 'd47fcda0-fe81-4d92-b9a4-043924dba99b',
}

# Variante du cycle 3 (même schéma, autre angle ou matériel) ; les cycles 1, 2 et 4 gardent le mouvement de base.
VARIANTE_C3 = {
 'Développé couché — haltères': 'Développé incliné — Smith machine',
 'Développé incliné — haltères': 'Développé couché — haltères',
 'Tirage vertical poitrine prise pronation — poulie': 'Tirage vertical poitrine prise pronation — machine',
 'Rowing à un bras — haltères': 'Tirage horizontal assis prise large — poulie',
 'Tirage horizontal assis prise neutre — poulie': 'Rowing à un bras — haltères',
 'Fente arrière — haltères': 'Split squat — haltères',
 'Soulevé de terre roumain — barre': 'Soulevé de terre roumain — haltères',
 'Presse à cuisses inclinée — machine': 'Presse à cuisses horizontale — machine',
 'Élévation latérale — haltères': 'Élévation latérale — poulie',
 'Curl debout supination — haltères': 'Curl marteau — haltères',
 'Extension triceps poulie corde': 'Extension triceps au-dessus de la tête — haltères',
 'Leg curl assis — machine': 'Leg curl assis machine sur une jambe',
 'Mollets debout — machine': 'Mollets assis — machine',
}
# Débutant : le squat goblet devient squat barre aux cycles 3 et 4 (progression technique).
VARIANTE_C34 = {'Squat goblet — haltères': 'Squat arrière — barre'}

NIVEAUX = ['Débutant', 'Intermédiaire', 'Confirmé', 'Expert']
# séries par niveau : (référence, compléments, isolation), nombre d'isolations
SERIES = {0: (3, 2, 2, 1), 1: (3, 3, 2, 2), 2: (4, 3, 3, 2), 3: (4, 4, 3, 2)}

CONSIGNES = {
 'ref': 'Mouvement de référence · Montée en charge sur 2 à 3 séries légères avant les séries de travail. Arrêter la série avant de perdre le placement.',
 'comp': 'Amplitude complète et contrôlée. Arrêter la série avant de perdre le placement.',
 'superset': 'En superset avec l’exercice suivant : enchaîner les deux, puis récupérer.',
 'iso': 'Amplitude confortable et reproductible, contraction marquée en fin de mouvement.',
}
PROG = ('S1 : calibrer la charge avec 1 répétition de marge en plus du RIR cible. S2–S3 : gagner des répétitions ; quand toutes les séries '
        'atteignent le haut de la plage au RIR cible, ajouter la plus petite charge disponible. S4 : allègement (une série de moins par exercice) et bilan.')
PHRASE = 'Les prescriptions affichées par défaut correspondent au cycle 1. Les cycles 2–4 se choisissent lors de la duplication ou de l’attribution en copie.'

# Prescription par objectif, rôle et cycle : (répétitions, RIR, récupération en s)
PRESC = {
 'RF': {'ref': [('10–12', 3, 120), ('8–10', 2, 150), ('10–12', 2, 120), ('6–8', 2, 180)],
        'comp': [('10–12', 3, 90), ('10–12', 2, 90), ('12–15', 2, 75), ('8–10', 2, 120)],
        'iso': [('12–15', 3, 60), ('12–15', 2, 60), ('15–20', 1, 45), ('12–15', 2, 60)]},
 'PP': {'ref': [('10–12', 3, 120), ('8–10', 2, 150), ('8–10', 2, 120), ('6–8', 2, 180)],
        'comp': [('10–12', 3, 60), ('10–12', 2, 60), ('12–15', 2, 45), ('8–10', 2, 75)],
        'iso': [('12–15', 3, 45), ('12–15', 2, 45), ('15–20', 1, 30), ('12–15', 2, 45)]},
 'PM': {'ref': [('10–12', 3, 150), ('8–10', 2, 150), ('8–12', 1, 150), ('5–6', 2, 180)],
        'comp': [('10–12', 3, 120), ('10–12', 2, 120), ('10–12', 1, 105), ('8–10', 2, 120)],
        'iso': [('12–15', 2, 75), ('12–15', 1, 75), ('12–20', 1, 60), ('10–12', 2, 75)]},
}

MOB = {'bas': ['Cercles articulaires contrôlés de hanche', 'Mobilité cheville genou au mur'],
       'charniere': ['Cercles articulaires contrôlés de hanche', 'Rotation thoracique à quatre pattes'],
       'haut': ['Cercles articulaires contrôlés de l’épaule', 'Rotation thoracique à quatre pattes']}

FULL_BODY = [  # Remise en forme et Perte de poids : full body A/B/C
 ('Full body A · Squat et poussée', 'bas', 'Squat goblet — haltères',
  ['Développé couché — haltères', 'Tirage vertical poitrine prise pronation — poulie'], ['Élévation latérale — haltères', 'Curl debout supination — haltères']),
 ('Full body B · Charnière et tirage', 'charniere', 'Soulevé de terre roumain — haltères',
  ['Développé militaire debout — haltères', 'Rowing à un bras — haltères'], ['Leg curl assis — machine', 'Extension triceps poulie corde']),
 ('Full body C · Presse et tirage', 'bas', 'Presse à cuisses inclinée — machine',
  ['Développé incliné — haltères', 'Tirage horizontal assis prise neutre — poulie'], ['Oiseau sur banc incliné — haltères', 'Mollets debout — machine']),
]
HAUT_BAS = [  # Prise de muscle : haut / bas x 2
 ('Haut du corps A · Développé couché', 'haut', 'Développé couché — barre',
  ['Tirage vertical poitrine prise pronation — poulie', 'Développé militaire debout — haltères'], ['Élévation latérale — haltères', 'Curl debout supination — haltères']),
 ('Bas du corps A · Squat', 'bas', 'Squat arrière — barre',
  ['Soulevé de terre roumain — barre', 'Fente arrière — haltères'], ['Leg curl assis — machine', 'Mollets debout — machine']),
 ('Haut du corps B · Développé incliné', 'haut', 'Développé incliné — haltères',
  ['Rowing à un bras — haltères', 'Tirage horizontal assis prise neutre — poulie'], ['Extension triceps poulie corde', 'Oiseau sur banc incliné — haltères']),
 ('Bas du corps B · Soulevé de terre', 'charniere', 'Soulevé de terre conventionnel — barre',
  ['Presse à cuisses inclinée — machine', 'Hip thrust — barre'], ['Leg extension — machine', 'Leg curl assis — machine']),
]

OBJ = {
 'RF': ('Remise en forme', 'Remise en forme · Retrouver l’énergie', 'Full body', FULL_BODY, 50),
 'PP': ('Perte de poids', 'Perte de poids · Affiner et tonifier', 'Full body en supersets', FULL_BODY, 50),
 'PM': ('Prise de muscle', 'Prise de muscle · Construire du muscle', 'Haut / Bas', HAUT_BAS, 60),
}

def q(v):
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, list): return "array[" + ','.join(q(x) for x in v) + "]::text[]"
    return "'" + str(v).replace("'", "''") + "'"

def jq(v):
    return 'null' if v is None else q(json.dumps(v, ensure_ascii=False)) + '::jsonb'

out = ['-- Coach OS · 12 programmes pilotes (Remise en forme 3 séances, Perte de poids 3 séances, Prise de muscle 4 séances × 4 niveaux).',
       '-- À lancer dans le SQL Editor. Ajoute uniquement de nouveaux modèles (codes MOD-SAL-V2-…) ; aucun programme existant n’est modifié.',
       '-- Relançable : identifiants fixes, « on conflict do nothing ».', 'begin;']
rows = {'programmes': [], 'seances': [], 'blocs': [], 'lignes': []}

def ligne(bloc_id, ordre, ex, series, phase, **k):
    rows['lignes'].append(dict(id=uid(bloc_id, ordre), bloc_id=bloc_id, ordre=ordre, exercice_id=EX[ex], series=series, phase=phase, **k))

for code, (objectif, nom, orga, seances, duree) in OBJ.items():
    nb = len(seances)
    for n, niveau in enumerate(NIVEAUX):
        s_ref, s_comp, s_iso, n_iso = SERIES[n]
        pcode = f'MOD-SAL-V2-{code}{nb}-{n + 1}'
        pid = uid(pcode)
        titre = f'{pcode} · {nom} · {nb} séances · {orga} · {niveau}'
        cardio = {'RF': 'Fin de séance : 10 min de vélo à allure modérée (on peut parler).',
                  'PP': 'Fin de séance : cardio (intervalles de rameur à la séance 2, vélo modéré aux séances 1 et 3).',
                  'PM': 'Pas de cardio imposé : le volume de musculation est prioritaire.'}[code]
        consignes = '\n'.join([
            '4 cycles d’un mois (4 semaines), à choisir après bilan : 1 · Fondations, 2 · Progression des charges, 3 · Intensification avec variantes d’exercices, 4 · Force et consolidation.',
            'Chaque mois : S1 calibrage, S2–S3 progression, S4 allègement et bilan. Le coach valide le passage au cycle suivant.',
            'Chaque séance : mobilité spécifique → gainage en alternance (2 exercices, 20 s / 10 s, 4 tours) → 1 mouvement de référence → 2 compléments polyarticulaires → 1 à 2 isolations.',
            'Au cycle 3, les compléments et isolations changent de variante (autre angle ou autre matériel) ; les mouvements de référence restent pour suivre la progression.',
            cardio,
            'Objectif de pas : 8 000 par jour, à adapter au point de départ.' if code != 'PM' else 'Objectif de pas : 7 000 à 8 000 par jour pour la santé et la récupération.',
            'RIR = répétitions propres encore possibles. Les charges ne sont pas imposées en kg. Interrompre un exercice douloureux.',
        ])
        rows['programmes'].append(dict(id=pid, coach_id=COACH, titre=titre, statut='Brouillon', niveau=niveau, objectif=objectif,
            seances_par_semaine=nb, duree_semaines=4, environnement='Salle équipée',
            materiel='Salle équipée : machines, poulies, haltères, barre et rack sécurisé, banc, vélo, rameur, tapis.',
            contraintes='Modèle général adulte. Adapter au bilan, à la maîtrise technique et aux contraintes du client avant attribution. Ne pas poursuivre un exercice douloureux ; faire réévaluer la prescription.',
            consignes=consignes, duree_cible_min=duree, priorites=['Corps entier'], version='3.0 — pilote · 4 cycles d’un mois', seance_seule=False))
        for si, (stitre, mob, ref, comps, isos) in enumerate(seances, start=1):
            sid = uid(pcode, si)
            dominante = stitre.split(' · ', 1)[1]
            rows['seances'].append(dict(id=sid, coach_id=COACH, programme_id=pid, ordre=si, titre=f'{pcode}-S{si} · {stitre}',
                dominante=dominante, objectif=f'{objectif} · {dominante}', duree_prevue_min=duree,
                consignes=f'Répéter la séance chaque semaine du mois. {PHRASE} Pas de passage automatique.'))
            b = 0
            def bloc(t):
                nonlocal_b[0] += 1
                bid = uid(sid, nonlocal_b[0])
                rows['blocs'].append(dict(id=bid, seance_id=sid, ordre=nonlocal_b[0], titre=f'{nonlocal_b[0]} · {t}'))
                return bid
            nonlocal_b = [0]
            bid = bloc('Mobilité spécifique')
            for i, ex in enumerate(MOB[mob], 1):
                ligne(bid, i, ex, 1, 'Échauffement', repetitions='6–8 par côté', recuperation_s=15, charge_intensite='Facile, sans douleur')
            bid = bloc('Gainage · 4 min · 20/10 en alternance')
            for i, ex in enumerate(['Dead bug', 'Planche latérale'], 1):
                ligne(bid, i, ex, 4, 'Échauffement', duree_s=20, recuperation_s=10, charge_intensite='Facile, sans douleur',
                      consignes='Alterner les deux exercices à chaque intervalle : dead bug, planche latérale, dead bug… 4 tours. Effort facile, garder une marge.')

            def presc(role, ex, series, cons, extra_cons=''):
                variants = []
                for c in range(4):
                    reps, rir, rec = PRESC[code][role][c]
                    v = dict(series=series, repetitions=reps, recuperationS=rec, rir=rir, chargeIntensite='Charge à ajuster au RIR cible',
                             tempo='Contrôlé', consignes=(extra_cons + cons).strip(), progressionPrevue=PROG)
                    alt = VARIANTE_C34.get(ex) if c >= 2 and role == 'ref' else (VARIANTE_C3.get(ex) if c == 2 and role != 'ref' else None)
                    if alt:
                        v['exercice'] = {'id': EX[alt], 'nom': alt}
                    variants.append(v)
                reps, rir, rec = PRESC[code][role][0]
                return dict(repetitions=reps, repetitions_min=int(reps.split('–')[0]), repetitions_max=int(reps.split('–')[1]), rir=rir,
                            recuperation_s=rec, tempo='Contrôlé', charge_intensite='Charge à ajuster au RIR cible',
                            consignes=(extra_cons + cons).strip(), progression=PROG, cycles=variants)

            # Débutant en Prise de muscle : soulevé de terre conventionnel remplacé par le roumain haltères.
            ref_ex = 'Soulevé de terre roumain — haltères' if (n == 0 and ref == 'Soulevé de terre conventionnel — barre') else ref
            bid = bloc('Mouvement de référence')
            ligne(bid, 1, ref_ex, s_ref, 'Principal', **presc('ref', ref_ex, s_ref, CONSIGNES['ref']))
            bid = bloc('Compléments en superset' if code == 'PP' else 'Compléments')
            for i, ex in enumerate(comps, 1):
                sup = CONSIGNES['superset'] + ' ' if code == 'PP' and i == 1 else ''
                ligne(bid, i, ex, s_comp, 'Principal', **presc('comp', ex, s_comp, CONSIGNES['comp'], sup))
            bid = bloc('Isolation')
            for i, ex in enumerate(isos[:n_iso], 1):
                ligne(bid, i, ex, s_iso, 'Principal', **presc('iso', ex, s_iso, CONSIGNES['iso']))
            if code == 'RF':
                bid = bloc('Cardio')
                ligne(bid, 1, 'Vélo stationnaire', 1, 'Finisher', duree_s=600, charge_intensite='Modéré : on peut parler',
                      consignes='10 minutes à allure régulière, sans essoufflement fort.')
            if code == 'PP':
                bid = bloc('Cardio')
                if si == 2:
                    tours = 6 if n == 0 else 8 if n == 1 else 10
                    ligne(bid, 1, 'Rameur', tours, 'Finisher', duree_s=30, recuperation_s=30, charge_intensite='Soutenu sur le travail, facile sur le repos',
                          consignes=f'Intervalles : {tours} × 30 s soutenu / 30 s très facile.',
                          minuteur={'exercices': 1, 'travailS': 30, 'reposS': 0, 'tours': tours, 'reposEntreToursS': 30})
                else:
                    ligne(bid, 1, 'Vélo stationnaire', 1, 'Finisher', duree_s=720, charge_intensite='Modéré : on peut parler',
                          consignes='12 minutes à allure régulière.')

COLS = {
 'programmes': ['id', 'coach_id', 'titre', 'statut', 'niveau', 'objectif', 'seances_par_semaine', 'duree_semaines', 'environnement', 'materiel',
                'contraintes', 'consignes', 'duree_cible_min', 'priorites', 'version', 'seance_seule'],
 'seances': ['id', 'coach_id', 'programme_id', 'ordre', 'titre', 'dominante', 'objectif', 'duree_prevue_min', 'consignes'],
 'blocs': ['id', 'seance_id', 'ordre', 'titre'],
 'lignes': ['id', 'bloc_id', 'ordre', 'exercice_id', 'series', 'phase', 'repetitions', 'repetitions_min', 'repetitions_max', 'rir', 'recuperation_s',
            'duree_s', 'tempo', 'charge_intensite', 'consignes', 'progression', 'cycles', 'minuteur'],
}
for t, cols in COLS.items():
    vals = []
    for r in rows[t]:
        vals.append('(' + ', '.join(jq(r.get(c)) if c in ('cycles', 'minuteur') else (q(r.get(c)) + ('::uuid' if c.endswith('id') and r.get(c) else '')) for c in cols) + ')')
    out.append(f'insert into public.{t} ({", ".join(cols)}) values\n' + ',\n'.join(vals) + '\non conflict (id) do nothing;')
out.append("select count(*) as programmes_pilotes from public.programmes where titre like 'MOD-SAL-V2-%';")
out.append('commit;')
open('/mnt/project-files/reprise/programmes/pilotes.sql', 'w').write('\n\n'.join(out) + '\n')
json.dump(rows, open('pilotes-rows.json', 'w'), ensure_ascii=False)
print({k: len(v) for k, v in rows.items()})
