// Modifications d'une séance par le coach : fonctions pures, l'écran ne fait qu'appeler celles-ci.
import type { Bloc, Exercice, LignePrescription, Seance } from './types';

type NouvelId = () => string;
type Sens = -1 | 1;

export function nouvelleSeance(clientId: string, nouvelId: NouvelId): Seance {
  return { id: nouvelId(), clientId, titre: '', blocs: [{ id: nouvelId(), titre: 'Échauffement', lignes: [] }] };
}

function deplacer<T>(liste: T[], index: number, sens: Sens): T[] {
  const cible = index + sens;
  if (index < 0 || cible < 0 || cible >= liste.length) return liste;
  const copie = [...liste];
  [copie[index], copie[cible]] = [copie[cible], copie[index]];
  return copie;
}

function surBlocs(s: Seance, maj: (blocs: Bloc[]) => Bloc[]): Seance {
  return { ...s, blocs: maj(s.blocs) };
}

function surLignes(s: Seance, ligneId: string, maj: (lignes: LignePrescription[], index: number) => LignePrescription[]) {
  return surBlocs(s, (blocs) =>
    blocs.map((b) => {
      const index = b.lignes.findIndex((l) => l.id === ligneId);
      return index === -1 ? b : { ...b, lignes: maj(b.lignes, index) };
    }),
  );
}

export const ajouterBloc = (s: Seance, nouvelId: NouvelId): Seance =>
  surBlocs(s, (blocs) => [...blocs, { id: nouvelId(), titre: `Bloc ${blocs.length + 1}`, lignes: [] }]);

export const modifierBloc = (s: Seance, blocId: string, patch: Partial<Omit<Bloc, 'id' | 'lignes'>>): Seance =>
  surBlocs(s, (blocs) => blocs.map((b) => (b.id === blocId ? { ...b, ...patch } : b)));

export const supprimerBloc = (s: Seance, blocId: string): Seance =>
  surBlocs(s, (blocs) => blocs.filter((b) => b.id !== blocId));

export const deplacerBloc = (s: Seance, blocId: string, sens: Sens): Seance =>
  surBlocs(s, (blocs) => deplacer(blocs, blocs.findIndex((b) => b.id === blocId), sens));

/** Prescription de départ selon ce qu'on mesure sur l'exercice ; le coach ajuste ensuite. */
export function prescriptionParDefaut(exercice: Exercice, id: string): LignePrescription {
  const ligne: LignePrescription = { id, exercice, series: 3, recuperationS: 60 };
  if (exercice.mesures.includes('repetitions')) {
    ligne.repetitionsMin = 10;
    ligne.repetitionsMax = 12;
  } else if (exercice.mesures.includes('duree')) {
    ligne.dureeS = 30;
  }
  return ligne;
}

export const ajouterLigne = (s: Seance, blocId: string, exercice: Exercice, nouvelId: NouvelId): Seance =>
  surBlocs(s, (blocs) =>
    blocs.map((b) => (b.id === blocId ? { ...b, lignes: [...b.lignes, prescriptionParDefaut(exercice, nouvelId())] } : b)),
  );

export const modifierLigne = (s: Seance, ligneId: string, patch: Partial<Omit<LignePrescription, 'id' | 'exercice'>>) =>
  surLignes(s, ligneId, (lignes, i) => lignes.map((l, j) => (j === i ? { ...l, ...patch } : l)));

export const supprimerLigne = (s: Seance, ligneId: string): Seance =>
  surLignes(s, ligneId, (lignes, i) => lignes.filter((_, j) => j !== i));

export const deplacerLigne = (s: Seance, ligneId: string, sens: Sens): Seance =>
  surLignes(s, ligneId, (lignes, i) => deplacer(lignes, i, sens));

/** Ce qui empêche d'envoyer la séance au client, en phrases lisibles par le coach. */
export function problemes(s: Seance): string[] {
  const liste: string[] = [];
  if (!s.titre.trim()) liste.push('Donne un titre à la séance.');
  if (s.blocs.length === 0) liste.push('Ajoute au moins un bloc.');
  for (const b of s.blocs) {
    if (!b.titre.trim()) liste.push('Un bloc n’a pas de titre.');
    if (b.lignes.length === 0) liste.push(`Le bloc « ${b.titre || 'sans titre'} » n’a aucun exercice.`);
    for (const l of b.lignes) {
      if (!Number.isInteger(l.series) || l.series < 1) liste.push(`${l.exercice.nom} : au moins 1 série.`);
      if (l.repetitionsMin !== undefined && l.repetitionsMax !== undefined && l.repetitionsMax < l.repetitionsMin) {
        liste.push(`${l.exercice.nom} : le maximum de répétitions est plus petit que le minimum.`);
      }
    }
  }
  return liste;
}

/** Recherche dans le catalogue sans tenir compte des accents ni des majuscules. */
export function chercherExercices(catalogue: Exercice[], recherche: string): Exercice[] {
  const simple = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const mots = simple(recherche).split(/\s+/).filter(Boolean);
  return catalogue
    .filter((e) => mots.every((m) => simple(e.nom).includes(m)))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}
