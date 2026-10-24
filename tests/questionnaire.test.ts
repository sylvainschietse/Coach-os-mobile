import { describe, expect, it } from 'vitest';

import { normaliserEmail, normaliserTelephone } from '../src/domain/crm';
import { estVisible, LIBELLES_QUESTIONS, nettoyerReponses, QUESTIONNAIRE, reponsesParSection, verifierReponses } from '../src/domain/questionnaire';

const normaliser = { telephone: normaliserTelephone, email: normaliserEmail };
const question = (id: string) => QUESTIONNAIRE.flatMap((s) => s.questions).find((q) => q.id === id)!;
const profil = QUESTIONNAIRE.find((s) => s.titre === 'Ton profil sportif')!;

describe('bilan forme & objectifs', () => {
  it('a des identifiants uniques et garde les clés lues par le CRM', () => {
    const ids = QUESTIONNAIRE.flatMap((s) => s.questions.map((q) => q.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const cle of ['prenom', 'nom', 'telephone', 'email', 'dateNaissance']) expect(LIBELLES_QUESTIONS[cle]).toBeDefined();
  });

  it('ne montre « Peux-tu préciser ton objectif ? » que pour l’objectif Autre', () => {
    expect(estVisible(question('objectifAutre'), { objectif: 'Prendre du muscle' })).toBe(false);
    expect(estVisible(question('objectifAutre'), { objectif: 'Autre' })).toBe(true);
  });

  it('enchaîne les conditions des activités : Oui, puis Autre coché parmi plusieurs', () => {
    expect(estVisible(question('activites'), { activiteReguliere: 'Non' })).toBe(false);
    expect(estVisible(question('activitesAutre'), { activiteReguliere: 'Oui', activites: 'Vélo, Autre' })).toBe(true);
    // Si on répond finalement Non, la précision disparaît aussi.
    expect(estVisible(question('activitesAutre'), { activiteReguliere: 'Non', activites: 'Vélo, Autre' })).toBe(false);
  });

  it('ne demande le matériel que pour un entraînement à la maison', () => {
    expect(estVisible(question('materiel'), { lieu: 'En salle' })).toBe(false);
    expect(estVisible(question('materiel'), { lieu: 'En salle et à la maison' })).toBe(true);
    expect(estVisible(question('materielAutre'), { lieu: 'En salle', materiel: 'Autre' })).toBe(false);
  });

  it('demande laquelle quand il y a une contre-indication', () => {
    expect(estVisible(question('contreIndicationDetail'), { contreIndication: 'Non' })).toBe(false);
    expect(estVisible(question('contreIndicationDetail'), { contreIndication: 'Oui' })).toBe(true);
  });

  it('n’exige une question cachée que si elle est affichée', () => {
    const base = { typesAimes: 'Cardio', douleur: 'Non', contreIndication: 'Non', anciennete: 'Je débute', seancesActuelles: 'Aucune', seancesPossibles: '2 séances', lieu: 'En salle' };
    expect(verifierReponses({ ...base, activiteReguliere: 'Non' }, normaliser, profil)).toEqual({});
    expect(verifierReponses({ ...base, activiteReguliere: 'Oui' }, normaliser, profil)).toEqual({ activites: 'Réponse obligatoire' });
  });

  it('exige la date de naissance et les échelles', () => {
    const erreurs = verifierReponses({}, normaliser);
    expect(erreurs.dateNaissance).toBe('Réponse obligatoire');
    expect(erreurs.stress).toBe('Réponse obligatoire');
    expect(erreurs.motivation).toBeUndefined();
  });

  it('n’envoie pas les réponses des questions redevenues cachées', () => {
    expect(nettoyerReponses({ objectif: 'Prendre du muscle', objectifAutre: 'Padel ', prenom: ' Léa ' })).toEqual({ objectif: 'Prendre du muscle', prenom: 'Léa' });
  });

  it('range les réponses par page pour la fiche, échelles sur 10', () => {
    const sections = reponsesParSection({ prenom: 'Léa', stress: '7', ancienne: 'x' }, ['prenom']);
    expect(sections.map((s) => s.titre)).toEqual(['Ton hygiène de vie', 'Autres réponses']);
    expect(sections[0].lignes[0]).toMatchObject({ rubrique: '🧘 Stress', valeur: '7 / 10' });
  });
});
