// Données fictives du mode démo : aucune donnée réelle de Sylvain ou de ses clients.
import type { Exercice, Realisation, Seance } from '@/domain/types';

export const COACH_DEMO = { id: 'coach-sylvain', nom: 'Sylvain' };

export const CLIENTS_DEMO = [
  { id: 'client-lea', prenom: 'Léa', nom: 'Martin' },
  { id: 'client-thomas', prenom: 'Thomas', nom: 'Bernard' },
];

const ex = (id: string, nom: string, mesures: Exercice['mesures']): Exercice => ({ id, nom, mesures });

const EXERCICES = {
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
          { id: p('l1'), exercice: EXERCICES.mobilite, series: 2, repetitionsMin: 10, recuperationS: 30, consignes: 'Amplitude progressive' },
        ],
      },
      {
        id: p('b2'),
        titre: 'Abdos',
        lignes: [
          { id: p('l2'), exercice: EXERCICES.gainage, series: 3, dureeS: 40, recuperationS: 30 },
          { id: p('l3'), exercice: EXERCICES.crunch, series: 2, repetitionsMin: 15, repetitionsMax: 20, recuperationS: 30 },
        ],
      },
      {
        id: p('b3'),
        titre: 'Renforcement',
        lignes: [
          { id: p('l4'), exercice: EXERCICES.developpe, series: 4, repetitionsMin: 8, repetitionsMax: 12, chargeIndicative: 40, recuperationS: 120, rir: 2, tempo: '3-0-1' },
          { id: p('l5'), exercice: EXERCICES.incline, series: 3, repetitionsMin: 10, repetitionsMax: 12, chargeIndicative: 14, recuperationS: 90, rir: 2 },
          { id: p('l6'), exercice: EXERCICES.dips, series: 3, repetitionsMin: 8, repetitionsMax: 12, chargeIndicative: 0, recuperationS: 90, rir: 1 },
          { id: p('l7'), exercice: EXERCICES.curl, series: 3, repetitionsMin: 10, repetitionsMax: 12, chargeIndicative: 20, recuperationS: 60, rir: 1 },
        ],
      },
      {
        id: p('b4'),
        titre: 'Finisher cardio',
        lignes: [
          { id: p('l8'), exercice: EXERCICES.rameur, series: 1, dureeS: 300, recuperationS: 0, consignes: 'Allure confortable, note la distance' },
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
