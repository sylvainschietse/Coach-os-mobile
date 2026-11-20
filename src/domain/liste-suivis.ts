// Clients actifs (onglet Clients) : recherche, filtre et tri de la liste des suivis.
import { ajouterJours } from './entrainement';
import type { SuiviClient } from './entrainement-etat';

export type FiltreSuivis = 'tous' | 'en-cours' | 'sans-programme' | 'fin-proche';
export type TriSuivis = 'nom' | 'fin' | 'sans-programme';

export const FILTRES_SUIVIS: { cle: FiltreSuivis; libelle: string }[] = [
  { cle: 'tous', libelle: 'Tous' },
  { cle: 'en-cours', libelle: 'En cours' },
  { cle: 'sans-programme', libelle: 'Sans programme' },
  { cle: 'fin-proche', libelle: 'Finit sous 15 jours' },
];
export const TRIS_SUIVIS: { cle: TriSuivis; libelle: string }[] = [
  { cle: 'nom', libelle: 'Nom (A → Z)' },
  { cle: 'fin', libelle: 'Fin du programme la plus proche' },
  { cle: 'sans-programme', libelle: 'Sans programme d’abord' },
];

const enCours = (p: SuiviClient) => p.cycles.find((c) => c.statut === 'Actif');
const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** `jour` : aujourd'hui (AAAA-MM-JJ), pour « finit sous 15 jours ». */
export function listeSuivis(liste: SuiviClient[], o: { recherche: string; filtre: FiltreSuivis; tri: TriSuivis; jour: string }): SuiviClient[] {
  const q = sansAccents(o.recherche.trim());
  const limite = ajouterJours(o.jour, 15);
  const nom = (a: SuiviClient, b: SuiviClient) => a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' });
  // Sans programme en cours : rangé après tous ceux qui en ont un quand on trie par date de fin.
  const fin = (p: SuiviClient) => enCours(p)?.fin || '9999-12-31';
  return liste
    .filter((p) => !q || sansAccents(p.nom).includes(q))
    .filter((p) => {
      const actif = enCours(p);
      if (o.filtre === 'en-cours') return !!actif;
      if (o.filtre === 'sans-programme') return !actif;
      if (o.filtre === 'fin-proche') return !!actif?.fin && actif.fin <= limite;
      return true;
    })
    .sort((a, b) => {
      if (o.tri === 'fin') return fin(a).localeCompare(fin(b)) || nom(a, b);
      if (o.tri === 'sans-programme') return Number(!!enCours(a)) - Number(!!enCours(b)) || nom(a, b);
      return nom(a, b);
    });
}
