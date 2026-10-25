# Génère le SQL du catalogue de programmes (Fondamentaux V3) : socle salle, profils femme, maison.
# Identifiants déterministes : relançable sans doublon. Les exercices sont pris par leur nom dans la bibliothèque
# (scripts/catalogue-exercices.json : nom → id, lu dans la base) ; un nom absent arrête le script.
# Usage : python3 scripts/catalogue-programmes.py <dossier de sortie>
import json, os, sys, uuid

NS = uuid.UUID('6f1c2a5e-3b7d-4c11-9a2e-5d8f0b4c7e21')
uid = lambda *k: str(uuid.uuid5(NS, '/'.join(map(str, k))))
COACH = 'db277d8d-1f4c-43b1-99d2-dcc69391308e'
ICI = os.path.dirname(os.path.abspath(__file__))
EX = json.load(open(os.path.join(ICI, 'catalogue-exercices.json')))
utilises = set()

def ex(nom):
    utilises.add(nom)
    return nom

NIVEAUX = ['Débutant', 'Intermédiaire', 'Confirmé', 'Expert']
# séries (référence, compléments, isolation) et nombre d'isolations, par niveau
SERIES = {0: (3, 2, 2, 1), 1: (3, 3, 2, 2), 2: (4, 3, 3, 2), 3: (4, 4, 3, 2)}

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
CONSIGNES = {
 'ref': 'Mouvement de référence · Monter en charge sur 2 à 3 séries légères avant les séries de travail. Arrêter la série avant de perdre le placement.',
 'comp': 'Amplitude complète et contrôlée. Arrêter la série avant de perdre le placement.',
 'superset': 'En superset avec l’exercice suivant : enchaîner les deux, puis récupérer.',
 'iso': 'Amplitude confortable et reproductible, contraction marquée en fin de mouvement.',
}
PROG_COURT = 'S1 calibrer · S2–S3 gagner des répétitions puis de la charge · S4 allègement et bilan.'
PROG = ('S1 : calibrer la charge avec 1 répétition de marge en plus du RIR cible. S2–S3 : gagner des répétitions ; quand toutes les séries '
        'atteignent le haut de la plage au RIR cible, ajouter la plus petite charge disponible. S4 : allègement (une série de moins par exercice) et bilan.')
PHRASE = 'Les prescriptions affichées par défaut correspondent au cycle 1. Les cycles 2–4 se choisissent lors de la duplication ou de l’attribution en copie.'

# ---------- Mobilité et gainage ----------
MOB = {'bas': ['Cercles articulaires contrôlés de hanche', 'Mobilité cheville genou au mur'],
       'charniere': ['Cercles articulaires contrôlés de hanche', 'Rotation thoracique à quatre pattes'],
       'haut': ['Cercles articulaires contrôlés de l’épaule', 'Rotation thoracique à quatre pattes'],
       'corps': ['World’s greatest stretch', 'Cercles articulaires contrôlés de l’épaule']}
# Gainage en alternance, un duo différent à chaque séance de la semaine (retour de Sylvain : éviter la lassitude).
GAINAGE_SALLE = [('Dead bug', 'Planche latérale'), ('Bird dog', 'Planche avant-bras'), ('Pallof press debout poulie', 'Bear plank'),
                 ('Hollow hold', 'Planche latérale genoux fléchis'), ('Planche avec toucher d’épaule', 'Planche latérale avec abduction')]
GAINAGE_MAISON = [('Dead bug', 'Planche latérale'), ('Bird dog', 'Planche avant-bras'), ('Pallof press debout élastique', 'Bear plank'),
                  ('Planche avec toucher d’épaule', 'Planche latérale genoux fléchis'), ('Dead bug avec élastique', 'Planche latérale avec abduction')]
# Profils femme : duos sans hyperpression abdominale (pas de hollow hold), expiration sur l'effort.
GAINAGE_FEMME = [('Dead bug', 'Planche latérale genoux fléchis'), ('Bird dog', 'Planche avant-bras'), ('Pallof press debout poulie', 'Planche latérale'),
                 ('Dead bug avec élastique', 'Bird dog'), ('Planche avec toucher d’épaule', 'Planche latérale avec abduction')]
PERINEE = ('Expirer sur l’effort en contractant doucement le périnée (comme pour retenir), sans bloquer la respiration ni pousser vers le bas. '
           'Arrêter en cas de fuite, de pesanteur ou de douleur pelvienne, et en parler au coach.')

# ---------- Séances : (titre, mobilité, référence, compléments, isolations) ----------
S = lambda titre, mob, ref, comps, isos: dict(titre=titre, mob=mob, ref=ref, comps=comps, isos=isos)

# Salle
FB_A = S('Full body A · Squat et poussée', 'bas', 'Squat goblet — haltères',
         ['Développé couché — haltères', 'Tirage vertical poitrine prise pronation — poulie'], ['Élévation latérale — haltères', 'Curl debout supination — haltères'])
FB_B = S('Full body B · Charnière et tirage', 'charniere', 'Soulevé de terre roumain — haltères',
         ['Développé militaire debout — haltères', 'Rowing à un bras — haltères'], ['Leg curl assis — machine', 'Extension triceps poulie corde'])
FB_C = S('Full body C · Presse et tirage', 'bas', 'Presse à cuisses inclinée — machine',
         ['Développé incliné — haltères', 'Tirage horizontal assis prise neutre — poulie'], ['Oiseau sur banc incliné — haltères', 'Mollets debout — machine'])
FB_UNIQUE = S('Full body · Séance unique', 'corps', 'Squat goblet — haltères',
              ['Développé couché — haltères', 'Tirage vertical poitrine prise pronation — poulie', 'Soulevé de terre roumain — haltères'],
              ['Élévation latérale — haltères', 'Leg curl assis — machine'])
HAUT_A = S('Haut du corps A · Développé couché', 'haut', 'Développé couché — barre',
           ['Tirage vertical poitrine prise pronation — poulie', 'Développé militaire debout — haltères'], ['Élévation latérale — haltères', 'Curl debout supination — haltères'])
BAS_A = S('Bas du corps A · Squat', 'bas', 'Squat arrière — barre',
          ['Soulevé de terre roumain — barre', 'Fente arrière — haltères'], ['Leg curl assis — machine', 'Mollets debout — machine'])
HAUT_B = S('Haut du corps B · Développé incliné', 'haut', 'Développé incliné — haltères',
           ['Rowing à un bras — haltères', 'Tirage horizontal assis prise neutre — poulie'], ['Extension triceps poulie corde', 'Oiseau sur banc incliné — haltères'])
BAS_B = S('Bas du corps B · Soulevé de terre', 'charniere', 'Soulevé de terre conventionnel — barre',
          ['Presse à cuisses inclinée — machine', 'Hip thrust — barre'], ['Leg extension — machine', 'Leg curl assis — machine'])
# Un muscle par jour (5 séances)
PECS_BI = S('Pectoraux et biceps', 'haut', 'Développé couché — barre',
            ['Développé incliné — haltères', 'Développé assis poitrine — machine'], ['Écarté pectoral assis — machine', 'Curl debout supination — haltères'])
DOS_TRI = S('Dos et triceps', 'haut', 'Tirage vertical poitrine prise pronation — poulie',
            ['Rowing buste penché — barre', 'Tirage horizontal assis prise neutre — poulie'], ['Extension triceps poulie corde', 'Extension triceps au-dessus de la tête — poulie'])
JAMBES_Q = S('Jambes · Quadriceps', 'bas', 'Squat arrière — barre',
             ['Presse à cuisses inclinée — machine', 'Fente arrière — haltères'], ['Leg extension — machine', 'Mollets debout — machine'])
EPAULES = S('Épaules', 'haut', 'Développé militaire debout — haltères',
            ['Développé épaules assis — machine', 'Tirage menton — poulie'], ['Élévation latérale — haltères', 'Face pull — poulie'])
JAMBES_IF = S('Jambes · Ischios et fessiers', 'charniere', 'Soulevé de terre roumain — barre',
              ['Hip thrust — barre', 'Split squat bulgare — haltères'], ['Leg curl assis — machine', 'Abduction de hanche assis machine'])

# Femme : bas du corps et fessiers prioritaires
F_BAS_A = S('Bas du corps A · Squat et fessiers', 'bas', 'Squat goblet — haltères',
            ['Hip thrust — barre', 'Fente arrière — haltères'], ['Abduction de hanche assis machine', 'Leg curl assis — machine'])
F_BAS_B = S('Bas du corps B · Charnière et fessiers', 'charniere', 'Soulevé de terre roumain — haltères',
            ['Presse à cuisses inclinée — machine', 'Split squat bulgare — haltères'], ['Extension de hanche debout — poulie', 'Abduction de hanche debout — poulie'])
F_HAUT_A = S('Haut du corps A · Tirage et poussée', 'haut', 'Tirage vertical poitrine prise pronation — poulie',
             ['Développé incliné — haltères', 'Rowing à un bras — haltères'], ['Élévation latérale — haltères', 'Extension triceps poulie corde'])
F_HAUT_B = S('Haut du corps B · Poussée et tirage', 'haut', 'Développé couché — haltères',
             ['Tirage horizontal assis prise neutre — poulie', 'Développé militaire debout — haltères'], ['Face pull — poulie', 'Curl debout supination — haltères'])
F_FB_A = S('Full body A · Squat et fessiers', 'bas', 'Squat goblet — haltères',
           ['Hip thrust — barre', 'Tirage vertical poitrine prise pronation — poulie'], ['Abduction de hanche assis machine', 'Élévation latérale — haltères'])
F_FB_B = S('Full body B · Charnière et tirage', 'charniere', 'Soulevé de terre roumain — haltères',
           ['Fente arrière — haltères', 'Développé incliné — haltères'], ['Extension de hanche debout — poulie', 'Rowing à un bras — haltères'])
F_FB_C = S('Full body C · Haut du corps et fessiers', 'corps', 'Presse à cuisses inclinée — machine',
           ['Développé couché — haltères', 'Tirage horizontal assis prise neutre — poulie'], ['Abduction de hanche debout — poulie', 'Face pull — poulie'])

# Maison (haltères, élastiques, poids du corps)
M_FB_A = S('Full body A · Squat et poussée', 'bas', 'Squat goblet — haltères',
           ['Développé au sol — haltères', 'Rowing à un bras — haltères'], ['Élévation latérale — haltères', 'Curl marteau — haltères'])
M_FB_B = S('Full body B · Charnière et tirage', 'charniere', 'Soulevé de terre roumain — haltères',
           ['Développé militaire debout — haltères', 'Tirage vertical à genoux — élastique'], ['Pont fessier — haltères', 'Extension triceps au-dessus de la tête — haltères'])
M_FB_C = S('Full body C · Unilatéral', 'bas', 'Split squat bulgare — haltères',
           ['Pompe mains surélevées — poids du corps', 'Rowing buste penché — haltères'], ['Abduction de hanche debout — élastique', 'Face pull — élastique'])

# Variante du cycle 3 (même schéma, autre angle ou matériel) ; les références restent pour suivre la progression.
VARIANTE_C3 = {
 'Développé couché — haltères': 'Développé incliné — Smith machine', 'Développé incliné — haltères': 'Développé couché — haltères',
 'Tirage vertical poitrine prise pronation — poulie': 'Tirage vertical poitrine prise pronation — machine',
 'Rowing à un bras — haltères': 'Tirage horizontal assis prise large — poulie', 'Tirage horizontal assis prise neutre — poulie': 'Rowing à un bras — haltères',
 'Fente arrière — haltères': 'Split squat — haltères', 'Soulevé de terre roumain — barre': 'Soulevé de terre roumain — haltères',
 'Presse à cuisses inclinée — machine': 'Presse à cuisses horizontale — machine', 'Élévation latérale — haltères': 'Élévation latérale — poulie',
 'Curl debout supination — haltères': 'Curl marteau — haltères', 'Extension triceps poulie corde': 'Extension triceps au-dessus de la tête — haltères',
 'Leg curl assis — machine': 'Leg curl assis machine sur une jambe', 'Mollets debout — machine': 'Mollets assis — machine',
 'Développé militaire debout — haltères': 'Développé épaules assis — haltères', 'Hip thrust — barre': 'Hip thrust — Smith machine',
 'Split squat bulgare — haltères': 'Montée sur banc — haltères', 'Développé assis poitrine — machine': 'Dips assistés machine — machine',
 'Écarté pectoral assis — machine': 'Écarté debout — poulie', 'Rowing buste penché — barre': 'Rowing T-bar — machine',
 'Extension triceps au-dessus de la tête — poulie': 'Extension triceps couchée — barre EZ', 'Développé épaules assis — machine': 'Développé Arnold — haltères',
 'Tirage menton — poulie': 'Tirage menton — haltères', 'Face pull — poulie': 'Oiseau buste penché — poulie',
 'Abduction de hanche assis machine': 'Abduction de hanche debout — poulie', 'Abduction de hanche debout — poulie': 'Abduction de hanche assis machine',
 'Extension de hanche debout — poulie': 'Extension de hanche à quatre pattes — poulie', 'Leg extension — machine': 'Leg extension machine sur une jambe',
 'Oiseau sur banc incliné — haltères': 'Oiseau assis machine — machine',
}
VARIANTE_C3_MAISON = {
 'Développé au sol — haltères': 'Pompe — poids du corps', 'Rowing à un bras — haltères': 'Rowing buste penché — haltères',
 'Développé militaire debout — haltères': 'Développé militaire à un bras — haltères', 'Tirage vertical à genoux — élastique': 'Tirage vertical à un bras — élastique',
 'Pompe mains surélevées — poids du corps': 'Développé au sol — haltères', 'Rowing buste penché — haltères': 'Rowing à un bras — haltères',
 'Élévation latérale — haltères': 'Élévation latérale — élastique', 'Curl marteau — haltères': 'Curl debout supination — élastique',
 'Pont fessier — haltères': 'Hip thrust — haltères', 'Extension triceps au-dessus de la tête — haltères': 'Extension triceps vers le bas — élastique',
 'Abduction de hanche debout — élastique': 'Clamshell — élastique', 'Face pull — élastique': 'Pull-apart — élastique',
}
# Débutant : la référence barre devient haltères ou machine, le squat goblet devient squat barre aux cycles 3–4.
DEBUTANT_REF = {'Soulevé de terre conventionnel — barre': 'Soulevé de terre roumain — haltères'}
VARIANTE_C34 = {'Squat goblet — haltères': 'Squat arrière — barre'}
# Femme 50 ans : pas de barre lourde au sol, des appuis stables.
F50_SWAP = {'Squat arrière — barre': 'Presse à cuisses inclinée — machine', 'Soulevé de terre conventionnel — barre': 'Soulevé de terre roumain — haltères',
            'Split squat bulgare — haltères': 'Split squat — haltères'}

OBJ = {  # code : (objectif, nom affiché, durée en min)
 'RF': ('Remise en forme', 'Remise en forme · Retrouver l’énergie', 50),
 'PP': ('Perte de poids', 'Perte de poids · Affiner et tonifier', 50),
 'PM': ('Prise de muscle', 'Prise de muscle · Construire du muscle', 60),
}
SALLE = {  # (objectif, séances) → (organisation affichée, séances)
 1: ('Full body', [FB_UNIQUE]), 2: ('Full body', [FB_A, FB_B]), 3: ('Full body', [FB_A, FB_B, FB_C]),
 4: ('Haut / Bas', [HAUT_A, BAS_A, HAUT_B, BAS_B]), 5: ('Haut / Bas / Full body', [HAUT_A, BAS_A, FB_C, HAUT_B, BAS_B]),
}
SALLE_PM = {3: ('Haut / Bas / Full body', [HAUT_A, BAS_A, FB_C])}
FEMME = {2: ('Full body · Bas du corps prioritaire', [F_FB_A, F_FB_B]), 3: ('Full body · Bas du corps prioritaire', [F_FB_A, F_FB_B, F_FB_C]),
         4: ('Bas du corps prioritaire', [F_BAS_A, F_HAUT_A, F_BAS_B, F_HAUT_B])}
MUSCLE_PAR_JOUR = ('Un muscle par jour', [PECS_BI, DOS_TRI, JAMBES_Q, EPAULES, JAMBES_IF])
MAISON = {2: ('Maison · Full body', [M_FB_A, M_FB_B]), 3: ('Maison · Full body', [M_FB_A, M_FB_B, M_FB_C])}
PROFILS = {  # code : (libellé, consigne programme, ajustement des exercices)
 'F': ('Femme', 'Profil femme : priorité au bas du corps et aux fessiers, travail en charge progressive pour la force et la densité osseuse.', {}),
 'FP': ('Femme préménopause', 'Profil femme en préménopause : priorité au bas du corps et aux fessiers, travail en charge pour préserver muscle et densité osseuse. '
        'Ajuster la charge au ressenti du jour (sommeil, fatigue, bouffées de chaleur) : garder la séance, baisser la charge plutôt que l’annuler.', {}),
 'F50': ('Femme 50 ans', 'Profil femme de 50 ans et plus : priorité au bas du corps et aux fessiers, travail en charge pour la densité osseuse, appuis stables '
         '(machines et haltères plutôt que barre lourde au sol). Progression prudente, échauffement plus long si besoin.', F50_SWAP),
}

def q(v):
    if v is None: return 'null'
    if isinstance(v, bool): return 'true' if v else 'false'
    if isinstance(v, (int, float)): return str(v)
    if isinstance(v, list): return "array[" + ','.join(q(x) for x in v) + "]::text[]"
    return "'" + str(v).replace("'", "''") + "'"

def jq(v):
    return 'null' if v is None else q(json.dumps(v, ensure_ascii=False, separators=(',', ':'))) + '::jsonb'

fichiers = {}  # nom du fichier → lignes générées par table

def programme(fichier, pcode, titre, obj, niveau_i, nb, seances, *, profil=None, maison=False):
    rows = fichiers.setdefault(fichier, {'programmes': [], 'seances': [], 'blocs': [], 'lignes': []})
    objectif, _, duree = OBJ[obj]
    niveau = NIVEAUX[niveau_i]
    s_ref, s_comp, s_iso, n_iso = SERIES[niveau_i]
    comps_en_plus = nb == 1  # une seule séance par semaine : un complément de plus
    swaps = dict(PROFILS[profil][2]) if profil else {}
    gainages = GAINAGE_MAISON if maison else GAINAGE_FEMME if profil else GAINAGE_SALLE
    variantes = VARIANTE_C3_MAISON if maison else VARIANTE_C3
    cardio_txt = ('Fin de séance : 10 min de cardio modéré (on peut parler).' if obj == 'RF' else
                  'Fin de séance : cardio (intervalles à la séance 2, cardio modéré aux autres).' if obj == 'PP' else
                  'Pas de cardio imposé : le volume de musculation est prioritaire.')
    pas = 'Objectif de pas : 7 000 à 8 000 par jour pour la santé et la récupération.' if obj == 'PM' else 'Objectif de pas : 8 000 par jour, à adapter au point de départ.'
    lignes_consignes = [
        '4 cycles d’un mois (4 semaines), à choisir après bilan : 1 · Fondations, 2 · Progression des charges, 3 · Intensification avec variantes d’exercices, 4 · Force et consolidation.',
        'Chaque mois : S1 calibrage, S2–S3 progression, S4 allègement et bilan. Le coach valide le passage au cycle suivant.',
        PROG,
        'Chaque séance : mobilité spécifique → gainage en alternance (2 exercices, 20 s / 10 s, 4 tours, un duo différent à chaque séance) → 1 mouvement de référence → '
        f'{3 if comps_en_plus else 2} compléments polyarticulaires → 1 à 2 isolations.',
        'Au cycle 3, les compléments et isolations changent de variante ; les mouvements de référence restent pour suivre la progression.',
        cardio_txt, pas,
        'RIR = répétitions propres encore possibles. Les charges ne sont pas imposées en kg. Interrompre un exercice douloureux.',
    ]
    if profil:
        lignes_consignes.insert(0, PROFILS[profil][1])
        lignes_consignes.append('Périnée : ' + PERINEE)
    pid = uid(pcode)
    rows['programmes'].append(dict(id=pid, coach_id=COACH, titre=titre, statut='Brouillon', niveau=niveau, objectif=objectif,
        seances_par_semaine=nb, duree_semaines=4, environnement='Maison' if maison else 'Salle équipée',
        materiel='Maison : haltères, élastiques, banc ou chaise stable, tapis.' if maison else
                 'Salle équipée : machines, poulies, haltères, barre et rack sécurisé, banc, vélo, rameur, tapis.',
        contraintes='Modèle général adulte. Adapter au bilan, à la maîtrise technique et aux contraintes du client avant attribution. Ne pas poursuivre un exercice douloureux ; faire réévaluer la prescription.',
        consignes='\n'.join(lignes_consignes), duree_cible_min=duree, priorites=['Bas du corps', 'Fessiers'] if profil else ['Corps entier'],
        version='3.0 · catalogue · 4 cycles d’un mois', seance_seule=False))

    for si, s in enumerate(seances, start=1):
        sid = uid(pcode, si)
        dominante = s['titre'].split(' · ', 1)[-1]
        rows['seances'].append(dict(id=sid, coach_id=COACH, programme_id=pid, ordre=si, titre=f'{pcode}-S{si} · {s["titre"]}',
            dominante=dominante, objectif=f'{objectif} · {dominante}', duree_prevue_min=duree,
            consignes=f'Répéter la séance chaque semaine du mois. {PHRASE} Pas de passage automatique.'))
        nb_blocs = [0]
        def bloc(t):
            nb_blocs[0] += 1
            bid = uid(sid, nb_blocs[0])
            rows['blocs'].append(dict(id=bid, seance_id=sid, ordre=nb_blocs[0], titre=f'{nb_blocs[0]} · {t}'))
            return bid
        def ligne(bid, ordre, nom, series, phase, **k):
            rows['lignes'].append(dict(id=uid(bid, ordre), bloc_id=bid, ordre=ordre, exercice_id=EX[ex(nom)], series=series, phase=phase, **k))

        bid = bloc('Mobilité spécifique')
        for i, nom in enumerate(MOB[s['mob']], 1):
            ligne(bid, i, nom, 1, 'Échauffement', repetitions='6–8 par côté', recuperation_s=15, charge_intensite='Facile, sans douleur')
        g1, g2 = gainages[(si - 1) % len(gainages)]
        bid = bloc('Gainage · 4 min · 20/10 en alternance')
        cons = f'Alterner les deux exercices à chaque intervalle : {g1.lower()}, {g2.lower()}, {g1.lower()}… 4 tours. Effort facile, garder une marge.'
        if profil: cons += ' Expirer sur l’effort, sans pousser vers le bas.'
        for i, nom in enumerate([g1, g2], 1):
            ligne(bid, i, nom, 4, 'Échauffement', duree_s=20, recuperation_s=10, charge_intensite='Facile, sans douleur', consignes=cons)

        def presc(role, nom, series, cons_txt):
            vs = []
            for c in range(4):
                reps, rir, rec = PRESC[obj][role][c]
                v = dict(series=series, repetitions=reps, recuperationS=rec, rir=rir, chargeIntensite='Charge à ajuster au RIR cible',
                         tempo='Contrôlé', consignes=cons_txt, progressionPrevue=PROG_COURT)
                alt = (VARIANTE_C34.get(nom) if niveau_i == 0 and c >= 2 and not profil and not maison else None) if role == 'ref' else (variantes.get(nom) if c == 2 else None)
                if alt:
                    alt = swaps.get(alt, alt)
                    if alt != nom:
                        v['exercice'] = {'id': EX[ex(alt)], 'nom': alt}
                vs.append(v)
            reps, rir, rec = PRESC[obj][role][0]
            mn, mx = reps.split('–')
            return dict(repetitions=reps, repetitions_min=int(mn), repetitions_max=int(mx), rir=rir, recuperation_s=rec, tempo='Contrôlé',
                        charge_intensite='Charge à ajuster au RIR cible', consignes=cons_txt, progression=PROG, cycles=vs)

        ref = swaps.get(s['ref'], s['ref'])
        if niveau_i == 0: ref = DEBUTANT_REF.get(ref, ref)
        bid = bloc('Mouvement de référence')
        ligne(bid, 1, ref, s_ref, 'Principal', **presc('ref', ref, s_ref, CONSIGNES['ref']))
        superset = obj == 'PP'
        bid = bloc('Compléments en superset' if superset else 'Compléments')
        comps = [swaps.get(c, c) for c in s['comps']][: 3 if comps_en_plus else 2]
        for i, nom in enumerate(comps, 1):
            sup = CONSIGNES['superset'] + ' ' if superset and i % 2 == 1 and i < len(comps) else ''
            ligne(bid, i, nom, s_comp, 'Principal', **presc('comp', nom, s_comp, (sup + CONSIGNES['comp']).strip()))
        bid = bloc('Isolation')
        for i, nom in enumerate([swaps.get(x, x) for x in s['isos']][:n_iso], 1):
            ligne(bid, i, nom, s_iso, 'Principal', **presc('iso', nom, s_iso, CONSIGNES['iso']))

        if obj in ('RF', 'PP'):
            bid = bloc('Cardio')
            if maison:
                if obj == 'PP' and si == 2:
                    tours = 6 if niveau_i == 0 else 8
                    ligne(bid, 1, 'Jumping jack', tours, 'Finisher', duree_s=30, recuperation_s=30, charge_intensite='Soutenu sur le travail, facile sur le repos',
                          consignes=f'Intervalles : {tours} × 30 s soutenu / 30 s de marche sur place. Version sans saut possible (pas latéraux).',
                          minuteur={'exercices': 1, 'travailS': 30, 'reposS': 0, 'tours': tours, 'reposEntreToursS': 30})
                else:
                    ligne(bid, 1, 'Marche', 1, 'Finisher', duree_s=900 if obj == 'PP' else 600, charge_intensite='Modéré : on peut parler',
                          consignes='Marche active à l’extérieur ou sur place, allure régulière.')
            elif obj == 'PP' and si == 2 and nb >= 2:
                tours = 6 if niveau_i == 0 else 8 if niveau_i == 1 else 10
                ligne(bid, 1, 'Rameur', tours, 'Finisher', duree_s=30, recuperation_s=30, charge_intensite='Soutenu sur le travail, facile sur le repos',
                      consignes=f'Intervalles : {tours} × 30 s soutenu / 30 s très facile.',
                      minuteur={'exercices': 1, 'travailS': 30, 'reposS': 0, 'tours': tours, 'reposEntreToursS': 30})
            else:
                ligne(bid, 1, 'Vélo stationnaire', 1, 'Finisher', duree_s=720 if obj == 'PP' else 600, charge_intensite='Modéré : on peut parler',
                      consignes=f'{12 if obj == "PP" else 10} minutes à allure régulière, sans essoufflement fort.')

def seances_txt(n): return f'{n} séance' + ('s' if n > 1 else '')

# ---------- Socle salle : 3 objectifs × 1 à 5 séances × 4 niveaux (+ un muscle par jour à 5 séances) ----------
for obj, (_, nom, _) in OBJ.items():
    for nb in range(1, 6):
        orga, seances = (SALLE_PM.get(nb) if obj == 'PM' else None) or SALLE[nb]
        for n in range(4):
            pcode = f'MOD-SAL-V3-{obj}{nb}-{n + 1}'
            programme(f'1-socle-{obj}', pcode, f'{pcode} · {nom} · {seances_txt(nb)} · {orga} · {NIVEAUX[n]}', obj, n, nb, seances)
    for n in range(4):
        pcode = f'MOD-SAL-V3-{obj}5M-{n + 1}'
        programme(f'1-socle-{obj}', pcode, f'{pcode} · {nom} · 5 séances · {MUSCLE_PAR_JOUR[0]} · {NIVEAUX[n]}', obj, n, 5, MUSCLE_PAR_JOUR[1])

# ---------- Profils femme : Remise en forme et Perte de poids, 2 à 4 séances ----------
for pf, (libelle, _, _) in PROFILS.items():
    for obj in ('RF', 'PP'):
        nom = OBJ[obj][1]
        for nb, (orga, seances) in FEMME.items():
            for n in range(4):
                pcode = f'MOD-SAL-V3-{pf}-{obj}{nb}-{n + 1}'
                programme(f'2-femmes-{pf}', pcode, f'{pcode} · {libelle} · {nom} · {seances_txt(nb)} · {orga} · {NIVEAUX[n]}', obj, n, nb, seances, profil=pf)

# ---------- Maison : 3 objectifs × 2 et 3 séances × 4 niveaux ----------
for obj, (_, nom, _) in OBJ.items():
    for nb, (orga, seances) in MAISON.items():
        for n in range(4):
            pcode = f'MOD-SAL-V3-MAI-{obj}{nb}-{n + 1}'
            programme('3-maison', pcode, f'{pcode} · {nom} · {seances_txt(nb)} · {orga} · {NIVEAUX[n]}', obj, n, nb, seances, maison=True)

COLS = {
 'programmes': ['id', 'coach_id', 'titre', 'statut', 'niveau', 'objectif', 'seances_par_semaine', 'duree_semaines', 'environnement', 'materiel',
                'contraintes', 'consignes', 'duree_cible_min', 'priorites', 'version', 'seance_seule'],
 'seances': ['id', 'coach_id', 'programme_id', 'ordre', 'titre', 'dominante', 'objectif', 'duree_prevue_min', 'consignes'],
 'blocs': ['id', 'seance_id', 'ordre', 'titre'],
 'lignes': ['id', 'bloc_id', 'ordre', 'exercice_id', 'series', 'phase', 'repetitions', 'repetitions_min', 'repetitions_max', 'rir', 'recuperation_s',
            'duree_s', 'tempo', 'charge_intensite', 'consignes', 'progression', 'cycles', 'minuteur'],
}
sortie = sys.argv[1] if len(sys.argv) > 1 else '.'
os.makedirs(sortie, exist_ok=True)
bilan = {}
for fichier, rows in sorted(fichiers.items()):
    out = [f'-- Coach OS · catalogue de programmes · {fichier} ({len(rows["programmes"])} programmes).',
           '-- À lancer dans le SQL Editor. Ajoute uniquement de nouveaux modèles (codes MOD-SAL-V3-…) ; aucun programme existant n’est modifié.',
           '-- Relançable : identifiants fixes, « on conflict do nothing ».', 'begin;']
    for t, cols in COLS.items():
        vals = ['(' + ', '.join(jq(r.get(c)) if c in ('cycles', 'minuteur') else (q(r.get(c)) + ('::uuid' if c.endswith('id') and r.get(c) else '')) for c in cols) + ')'
                for r in rows[t]]
        out.append(f'insert into public.{t} ({", ".join(cols)}) values\n' + ',\n'.join(vals) + '\non conflict (id) do nothing;')
    out.append("select count(*) as programmes_catalogue_v3 from public.programmes where titre like 'MOD-SAL-V3-%';")
    out.append('commit;')
    open(os.path.join(sortie, f'catalogue-{fichier}.sql'), 'w').write('\n\n'.join(out) + '\n')
    json.dump(rows, open(os.path.join(sortie, f'catalogue-{fichier}.json'), 'w'), ensure_ascii=False)
    bilan[fichier] = {k: len(v) for k, v in rows.items()}
print(json.dumps(bilan, ensure_ascii=False))
