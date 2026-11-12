// Mes relances : textes réécrits, réglages relus sans confiance, relances du coach créées une seule fois au bon moment.
import { describe, expect, it } from 'vitest';

import { MODELES, rediger } from '../src/domain/crm';
import {
  erreurTexte,
  estRelancePerso,
  lireReglagesRelances,
  noterCreees,
  REGLAGES_RELANCES,
  relancesACreer,
  remplir,
  texteDe,
  type RelancePerso,
  type ReglagesRelances,
  type Situation,
} from '../src/domain/relances-coach';

const perso = (declencheur: RelancePerso['declencheur'], pour: RelancePerso['pour'] = ['clients']): RelancePerso => ({
  id: 'p1',
  nom: 'Ma relance',
  texte: 'Bonjour {prenom}, c’est {coach}. {quand}',
  declencheur,
  pour,
  active: true,
});
const reglages = (p: RelancePerso, creees: Record<string, string> = {}): ReglagesRelances => ({ ...REGLAGES_RELANCES, perso: [p], creees });
const lea: Situation['contact'] = { id: 'c-lea', prenom: 'Léa', statut: 'client', dateNaissance: '1994-11-12' };
const jour = '2026-11-12';

describe('textes', () => {
  it('le texte réécrit remplace celui d’origine, toutes les variables remplies', () => {
    const r = { ...REGLAGES_RELANCES, textes: { booster: 'Salut {prenom} ! {prenom}, on se voit ?' } };
    expect(texteDe(r, 'booster')).toBe('Salut {prenom} ! {prenom}, on se voit ?');
    expect(texteDe(r, 'questionnaire')).toBe(MODELES.questionnaire.texte);
    expect(rediger('booster', { prenom: 'Léa' }, { coach: 'Camille' }, r.textes.booster)).toBe('Salut Léa ! Léa, on se voit ?');
  });
  it('refuse une variable inconnue ou un texte vide', () => {
    expect(erreurTexte('Bonjour {prénom}')).toMatch(/n’est pas reconnu/);
    expect(erreurTexte('  ')).toBe('Écris le message.');
    expect(erreurTexte('Bonjour {prenom}, rendez-vous {quand}')).toBeNull();
  });
  it('remplir garde un message propre sans date', () => {
    expect(remplir('Bonjour {prenom}, {quand} ?', { prenom: 'Léa', coach: 'Camille' })).toBe('Bonjour Léa, bientôt ?');
  });
});

describe('réglages relus', () => {
  it('ignore ce qui est illisible', () => {
    const r = lireReglagesRelances({
      textes: { booster: 'ok', inconnu: 'x', questionnaire: '' },
      coupees: ['rappel_booster', 'nimporte'],
      perso: [{ id: 'a', nom: 'X', texte: 't', declencheur: { type: 'sans_seance', jours: 9999 }, pour: ['clients'] }, { id: 'b' }],
      creees: { k: '2026-11-01', z: 'hier' },
    });
    expect(r.textes).toEqual({ booster: 'ok' });
    expect(r.coupees).toEqual(['rappel_booster']);
    expect(r.perso).toHaveLength(1);
    expect(r.perso[0].declencheur).toEqual({ type: 'sans_seance', jours: 7 });
    expect(r.creees).toEqual({ k: '2026-11-01' });
    expect(lireReglagesRelances(null)).toEqual(REGLAGES_RELANCES);
  });
});

describe('relances du coach', () => {
  it('X jours sans séance : une fois par dernière séance', () => {
    const r = reglages(perso({ type: 'sans_seance', jours: 7 }));
    const s: Situation[] = [{ contact: lea, derniereSeance: '2026-11-04' }];
    const a = relancesACreer(r, s, jour, 'Camille');
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ contactId: 'c-lea', titre: 'Ma relance', note: 'Bonjour Léa, c’est Camille. bientôt' });
    expect(relancesACreer(r, [{ contact: lea, derniereSeance: '2026-11-06' }], jour, 'Camille')).toHaveLength(0);
    // Déjà créée : rien de plus.
    expect(relancesACreer(noterCreees(r, [a[0].cle], jour), s, jour, 'Camille')).toHaveLength(0);
  });
  it('la veille d’un RDV, avec sa date dans le message', () => {
    const r = reglages(perso({ type: 'avant_rdv', jours: 1 }));
    const a = relancesACreer(r, [{ contact: lea, rdvs: ['2026-11-13T09:00:00Z', '2026-11-20T09:00:00Z'] }], jour, 'Camille');
    expect(a).toHaveLength(1);
    expect(a[0].note).toContain('vendredi 13 novembre');
  });
  it('fin de pack, paiement en retard, anniversaire, date fixe', () => {
    const s: Situation = { contact: lea, packs: [{ id: 'k', restantes: 2 }], attentes: [{ id: 'pay', date: '2026-11-01' }] };
    expect(relancesACreer(reglages(perso({ type: 'fin_pack', restantes: 2 })), [s], jour, 'C')).toHaveLength(1);
    expect(relancesACreer(reglages(perso({ type: 'fin_pack', restantes: 1 })), [s], jour, 'C')).toHaveLength(0);
    expect(relancesACreer(reglages(perso({ type: 'paiement_retard', jours: 7 })), [s], jour, 'C')).toHaveLength(1);
    expect(relancesACreer(reglages(perso({ type: 'anniversaire' })), [s], jour, 'C')).toHaveLength(1);
    expect(relancesACreer(reglages(perso({ type: 'date', date: '2026-11-10' })), [s], jour, 'C')).toHaveLength(1);
    expect(relancesACreer(reglages(perso({ type: 'date', date: '2026-11-01' })), [s], jour, 'C')).toHaveLength(0);
  });
  it('seulement pour le public choisi, jamais un dossier archivé ni une relance coupée', () => {
    const prospect: Situation = { contact: { id: 'c-p', prenom: 'Paul', statut: 'prospect' } };
    const archive: Situation = { contact: { id: 'c-a', prenom: 'Ana', statut: 'archive' } };
    const r = reglages(perso({ type: 'date', date: jour }, ['prospects']));
    expect(relancesACreer(r, [{ contact: lea }, prospect, archive], jour, 'C').map((x) => x.contactId)).toEqual(['c-p']);
    expect(relancesACreer({ ...r, perso: [{ ...r.perso[0], active: false }] }, [prospect], jour, 'C')).toHaveLength(0);
  });
  it('se reconnaît dans « À faire » : libre avec un titre', () => {
    expect(estRelancePerso({ modele: 'libre', titre: 'Fin de pack' })).toBe(true);
    expect(estRelancePerso({ modele: 'libre' })).toBe(false);
    expect(estRelancePerso({ modele: 'tache', titre: 'Appeler' })).toBe(false);
  });
});
