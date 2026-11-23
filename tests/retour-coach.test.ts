import { describe, expect, it } from 'vitest';

import { ecranParentCoach } from '../src/domain/retour-coach';

/** Applique la modification renvoyée, comme router.setParams : une valeur undefined efface le paramètre. */
const appliquer = (p: Record<string, string | undefined>, modif: Record<string, string | undefined>) => {
  const suite = { ...p, ...modif };
  return Object.fromEntries(Object.entries(suite).filter(([, v]) => v !== undefined)) as Record<string, string>;
};

/** Remonte jusqu'à l'accueil et renvoie chaque écran traversé. */
const remonter = (depart: Record<string, string>) => {
  const etapes = [depart];
  let p = depart;
  for (let i = 0; i < 20; i++) {
    const modif = ecranParentCoach(p);
    if (!modif) return etapes;
    p = appliquer(p, modif);
    etapes.push(p);
  }
  throw new Error('Retour sans fin');
};

const ACCUEIL = { onglet: 'crm', rubrique: 'Accueil' };

describe('Retour du téléphone dans l’espace coach', () => {
  it('à l’accueil, laisse le téléphone faire (quitter l’appli)', () => {
    expect(ecranParentCoach({})).toBeNull();
    expect(ecranParentCoach(ACCUEIL)).toBeNull();
  });

  it('d’un onglet, revient à l’accueil', () => {
    expect(remonter({ onglet: 'agenda' })).toEqual([{ onglet: 'agenda' }, ACCUEIL]);
    expect(remonter({ onglet: 'activite' }).at(-1)).toEqual(ACCUEIL);
    expect(remonter({ onglet: 'prospects' }).at(-1)).toEqual(ACCUEIL);
  });

  it('d’une séance de programme : le programme, puis la bibliothèque, puis l’accueil', () => {
    expect(remonter({ onglet: 'airtable', programme: 'p1', seance: 's1' })).toEqual([
      { onglet: 'airtable', programme: 'p1', seance: 's1' },
      { onglet: 'airtable', programme: 'p1' },
      { onglet: 'airtable' },
      ACCUEIL,
    ]);
  });

  it('d’un Booster ouvert depuis une fiche : la fiche, puis la liste, puis l’accueil', () => {
    expect(remonter({ onglet: 'prospects', contact: 'c1', volet: 'tests', booster: 'b1', bc: 'c1' })).toEqual([
      { onglet: 'prospects', contact: 'c1', volet: 'tests', booster: 'b1', bc: 'c1' },
      { onglet: 'prospects', contact: 'c1', volet: 'tests' },
      { onglet: 'prospects' },
      ACCUEIL,
    ]);
  });

  it('d’un document ou d’un bilan ouvert depuis une fiche, revient à la fiche', () => {
    expect(appliquer({ onglet: 'suivis', contact: 'c1', doc: 'd1' }, ecranParentCoach({ onglet: 'suivis', contact: 'c1', doc: 'd1' })!)).toEqual({ onglet: 'suivis', contact: 'c1' });
    expect(appliquer({ onglet: 'suivis', contact: 'c1', bilan: 'x' }, ecranParentCoach({ onglet: 'suivis', contact: 'c1', bilan: 'x' })!)).toEqual({ onglet: 'suivis', contact: 'c1' });
  });

  it('d’un paiement ouvert dans Activité, revient à Activité puis à l’accueil', () => {
    expect(remonter({ onglet: 'activite', paiement: 'f1' })).toEqual([{ onglet: 'activite', paiement: 'f1' }, { onglet: 'activite' }, ACCUEIL]);
  });

  it('du suivi d’un client actif, revient à la liste des clients', () => {
    expect(remonter({ onglet: 'suivis', client: 'k1' })).toEqual([{ onglet: 'suivis', client: 'k1' }, { onglet: 'suivis' }, ACCUEIL]);
  });

  it('d’une rubrique de Mon profil, revient à Mon profil puis à l’accueil', () => {
    expect(remonter({ onglet: 'profil', section: 'agenda' })).toEqual([{ onglet: 'profil', section: 'agenda' }, { onglet: 'profil' }, ACCUEIL]);
  });

  it('de l’aperçu de l’appli d’un client, revient à la fiche d’où il a été ouvert', () => {
    expect(remonter({ onglet: 'prospects', contact: 'c1', apercu: 'k1' }).slice(0, 2)).toEqual([
      { onglet: 'prospects', contact: 'c1', apercu: 'k1' },
      { onglet: 'prospects', contact: 'c1' },
    ]);
  });

  it('ne dépend pas de l’ordre d’ouverture : Agenda puis Programmes puis Retour mène à l’accueil, pas à l’Agenda', () => {
    expect(remonter({ onglet: 'airtable', partie: 'recettes' }).at(-1)).toEqual(ACCUEIL);
    expect(remonter({ onglet: 'airtable', partie: 'recettes' })).not.toContainEqual({ onglet: 'agenda' });
  });

  it('d’une rubrique de l’accueil (messages, tâches), revient à l’accueil', () => {
    expect(remonter({ onglet: 'crm', rubrique: 'Messages' })).toEqual([{ onglet: 'crm', rubrique: 'Messages' }, ACCUEIL]);
    expect(remonter({ onglet: 'crm', rubrique: 'Taches', tache: 't1' })).toEqual([
      { onglet: 'crm', rubrique: 'Taches', tache: 't1' },
      { onglet: 'crm', rubrique: 'Taches' },
      ACCUEIL,
    ]);
  });
});
