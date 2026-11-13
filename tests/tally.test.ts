// Lot 6 : traduction d'une réponse du webhook Tally (formulaire historique) dans les clés du questionnaire. Réponse fictive.
import { describe, expect, it } from 'vitest';

import { QUESTIONS_TALLY, reponsesDepuisTally, type WebhookTally } from '../src/domain/tally';
import { QUESTIONNAIRE } from '../src/domain/questionnaire';

const reponse: WebhookTally = {
  eventId: 'evt-1',
  eventType: 'FORM_RESPONSE',
  data: {
    responseId: 'resFictif1',
    formId: '81Ye7r',
    fields: [
      { key: 'question_LYoJO1', label: 'Nom', type: 'INPUT_TEXT', value: ' Fictif ' },
      { key: 'question_pWZ7zb', label: 'Prénom', type: 'INPUT_TEXT', value: 'Alex' },
      { key: 'question_1vBJRW', label: 'Téléphone', type: 'INPUT_PHONE_NUMBER', value: '+33600000099' },
      { key: 'question_JDBJod', label: 'Date de naissance', type: 'INPUT_DATE', value: '1990-04-07' },
      {
        key: 'question_k79y41',
        label: 'Objectif',
        type: 'CHECKBOXES',
        value: ['o1', 'o3'],
        options: [
          { id: 'o1', text: 'Perte de poids' },
          { id: 'o2', text: 'Prise de muscle' },
          { id: 'o3', text: 'Énergie' },
        ],
      },
      { key: 'question_k79y41_o1', label: 'Objectif (Perte de poids)', type: 'CHECKBOXES', value: true },
      { key: 'question_MYGJVX', label: 'E-mail', type: 'INPUT_EMAIL', value: null },
      { key: 'question_NOUVEAU', label: 'Question ajoutée plus tard', type: 'INPUT_TEXT', value: 'x' },
    ],
  },
};

describe('réponse Tally', () => {
  it('donne les réponses dans les clés du questionnaire, avec la source et un identifiant rejouable', () => {
    const r = reponsesDepuisTally(reponse);
    expect(r.envoi).toBe('tally:resFictif1');
    expect(r.reponses).toEqual({
      source: 'Tally',
      nom: 'Fictif',
      prenom: 'Alex',
      telephone: '+33600000099',
      dateNaissance: '07/04/1990',
      objectif: 'Perte de poids, Énergie',
    });
    expect(r.ignorees).toEqual(['Question ajoutée plus tard']);
  });

  it('refuse un autre événement ou une réponse incomplète', () => {
    expect(() => reponsesDepuisTally({ ...reponse, eventType: 'FORM_UPDATED' })).toThrow(/non pris en charge/);
    expect(() => reponsesDepuisTally({ eventType: 'FORM_RESPONSE', data: { fields: [] } })).toThrow(/incomplète/);
  });

  it('chaque question Tally correspond à une question du questionnaire de l’app', () => {
    const cles = new Set(QUESTIONNAIRE.flatMap((s) => s.questions.map((q) => q.id)));
    expect(Object.values(QUESTIONS_TALLY).filter((c) => !cles.has(c))).toEqual([]);
  });
});

it('la fonction Edge `tally` utilise exactement la même traduction', async () => {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const lire = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');
  expect(lire('supabase/functions/_shared/tally.ts')).toBe(lire('src/domain/tally.ts'));
});
