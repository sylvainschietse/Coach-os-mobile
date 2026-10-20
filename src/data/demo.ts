// Données fictives du mode démo : aucune donnée réelle de Sylvain ou de ses clients.
import type { Exercice, JournalNutrition, Mensuration, PlanNutrition, Programme, Realisation, RecordPerso, Seance } from '@/domain/types';

export const COACH_DEMO = { id: 'coach-sylvain', nom: 'Sylvain' };

export const CLIENTS_DEMO = [
  { id: 'client-lea', prenom: 'Léa', nom: 'Martin' },
  { id: 'client-thomas', prenom: 'Thomas', nom: 'Bernard' },
];

const ex = (id: string, nom: string, mesures: Exercice['mesures'], famille?: string): Exercice => ({ id, nom, mesures, famille });

export const EXERCICES_DEMO = {
  mobilite: ex('ex-mobilite', 'Mobilité épaules (bâton)', ['repetitions']),
  gainage: ex('ex-gainage', 'Gainage planche', ['duree']),
  crunch: ex('ex-crunch', 'Crunch', ['repetitions']),
  developpe: ex('ex-dc', 'Développé couché barre', ['charge', 'repetitions']),
  incline: ex('ex-di', 'Développé incliné haltères', ['charge', 'repetitions']),
  dips: ex('ex-dips', 'Dips', ['charge', 'repetitions']),
  curl: ex('ex-curl', 'Curl barre EZ', ['charge', 'repetitions']),
  rameur: ex('ex-rameur', 'Rameur', ['duree', 'distance', 'allure500']),
};

function seancePour(clientId: string): Seance {
  const p = (suffixe: string) => `${clientId}-${suffixe}`;
  return {
    id: p('pecs-biceps'),
    clientId,
    titre: 'Pecs · Biceps',
    datePrevue: new Date().toISOString().slice(0, 10),
    consignes: 'Contrôle la descente sur les exercices de base. Note en fin de séance comment tu t’es senti.',
    blocs: [
      {
        id: p('b1'),
        titre: 'Échauffement',
        lignes: [
          { id: p('l1'), exercice: EXERCICES_DEMO.mobilite, series: 2, repetitionsMin: 10, recuperationS: 30, consignes: 'Amplitude progressive' },
        ],
      },
      {
        id: p('b2'),
        titre: 'Abdos en circuit',
        minuteur: { exercices: 2, travailS: 40, reposS: 20, tours: 3, reposEntreToursS: 60 },
        lignes: [
          { id: p('l2'), exercice: EXERCICES_DEMO.gainage, series: 3, dureeS: 40, recuperationS: 30 },
          { id: p('l3'), exercice: EXERCICES_DEMO.crunch, series: 2, repetitionsMin: 15, repetitionsMax: 20, recuperationS: 30 },
        ],
      },
      {
        id: p('b3'),
        titre: 'Renforcement',
        lignes: [
          { id: p('l4'), exercice: EXERCICES_DEMO.developpe, series: 4, repetitionsMin: 8, repetitionsMax: 12, chargeIndicative: 40, recuperationS: 120, rir: 2, tempo: '3-0-1' },
          { id: p('l5'), exercice: EXERCICES_DEMO.incline, series: 3, repetitionsMin: 10, repetitionsMax: 12, chargeIndicative: 14, recuperationS: 90, rir: 2 },
          { id: p('l6'), exercice: EXERCICES_DEMO.dips, series: 3, repetitionsMin: 8, repetitionsMax: 12, chargeIndicative: 0, recuperationS: 90, rir: 1 },
          { id: p('l7'), exercice: EXERCICES_DEMO.curl, series: 3, repetitionsMin: 10, repetitionsMax: 12, chargeIndicative: 20, recuperationS: 60, rir: 1 },
        ],
      },
      {
        id: p('b4'),
        titre: 'Finisher cardio',
        lignes: [
          {
            id: p('l8'),
            exercice: EXERCICES_DEMO.rameur,
            series: 1,
            dureeS: 360,
            recuperationS: 0,
            consignes: '6 sprints de 30 s, 30 s tranquille entre chaque. Note la distance totale.',
            minuteur: { exercices: 6, travailS: 30, reposS: 30, tours: 1, reposEntreToursS: 0 },
          },
        ],
      },
    ],
  };
}

export const SEANCES_DEMO: Seance[] = CLIENTS_DEMO.map((c) => seancePour(c.id));

/** Une séance passée de Léa, pour montrer la suggestion de charge (+2,5 kg au développé couché). */
export const HISTORIQUE_DEMO: Realisation[] = [
  {
    id: 'demo-historique-lea',
    seanceId: 'client-lea-pecs-biceps',
    clientId: 'client-lea',
    debut: '2026-10-12T17:00:00.000Z',
    fin: '2026-10-12T18:05:00.000Z',
    commentaire: 'Bonne séance, le développé est passé facilement.',
    series: [0, 1, 2, 3].map((index) => ({
      id: `demo-hist-dc-${index}`,
      ligneId: 'client-lea-l4',
      exerciceId: 'ex-dc',
      index,
      valeurs: { charge: 45, repetitions: 12 },
      suggestion: { charge: 45, repetitions: 8 },
    })),
  },
];

/** Un modèle de programme pour montrer l'attribution à un client. */
export const MODELES_DEMO: Programme[] = [
  {
    id: 'modele-remise-en-forme',
    titre: 'Remise en forme · 4 semaines',
    objectif: 'Reprendre une pratique régulière sans douleur',
    dureeSemaines: 4,
    seancesParSemaine: 2,
    niveau: 'Débutant',
    seances: [
      {
        id: 'modele-rf-a',
        titre: 'Séance A · Haut du corps',
        blocs: [
          { id: 'modele-rf-a-b1', titre: 'Échauffement', lignes: [{ id: 'modele-rf-a-l1', exercice: EXERCICES_DEMO.mobilite, series: 2, repetitionsMin: 10, recuperationS: 30 }] },
          {
            id: 'modele-rf-a-b2',
            titre: 'Renforcement',
            lignes: [
              { id: 'modele-rf-a-l2', exercice: EXERCICES_DEMO.developpe, series: 3, repetitionsMin: 10, repetitionsMax: 12, recuperationS: 90, rir: 3 },
              { id: 'modele-rf-a-l3', exercice: EXERCICES_DEMO.curl, series: 3, repetitionsMin: 12, recuperationS: 60, rir: 2 },
            ],
          },
        ],
      },
      {
        id: 'modele-rf-b',
        titre: 'Séance B · Gainage et cardio',
        blocs: [
          {
            id: 'modele-rf-b-b1',
            titre: 'Gainage',
            lignes: [
              { id: 'modele-rf-b-l1', exercice: EXERCICES_DEMO.gainage, series: 3, dureeS: 30, recuperationS: 30 },
              { id: 'modele-rf-b-l2', exercice: EXERCICES_DEMO.crunch, series: 3, repetitionsMin: 15, recuperationS: 30 },
            ],
          },
          { id: 'modele-rf-b-b2', titre: 'Cardio', lignes: [{ id: 'modele-rf-b-l3', exercice: EXERCICES_DEMO.rameur, series: 1, dureeS: 600, recuperationS: 0 }] },
        ],
      },
    ],
  },
];

export const MENSURATIONS_DEMO: Mensuration[] = [
  { id: 'demo-mens-1', clientId: 'client-lea', date: '2026-09-21', poidsKg: 66.2, tourTailleCm: 75, tourHanchesCm: 99 },
  { id: 'demo-mens-2', clientId: 'client-lea', date: '2026-10-19', poidsKg: 64.8, tourTailleCm: 72.5, tourHanchesCm: 97 },
];

export const RECORDS_DEMO: RecordPerso[] = [
  { id: 'demo-pr-1', clientId: 'client-lea', exerciceId: 'ex-dc', libelle: 'Développé couché barre', valeur: 45, unite: 'kg', repetitions: 5, date: '2026-10-12' },
  { id: 'demo-pr-2', clientId: 'client-lea', libelle: 'Rameur 500 m', valeur: 118, unite: 's', date: '2026-10-05' },
];

export const PLANS_DEMO: PlanNutrition[] = [
  {
    clientId: 'client-lea',
    calories: 1900,
    proteinesG: 110,
    glucidesG: 210,
    lipidesG: 65,
    eauL: 2,
    conseils: 'Une source de protéines à chaque repas. Légumes au déjeuner et au dîner. Un fruit en collation avant la séance.',
  },
];

export const JOURNAL_DEMO: JournalNutrition[] = [
  { id: 'demo-jn-1', clientId: 'client-lea', date: '2026-10-19', respect: 4, eauL: 1.8, ressenti: 'Bien tenu, un peu faim le soir.' },
];
