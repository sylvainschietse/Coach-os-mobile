// Création des programmes et des séances par le coach : règles pures, sans écran ni base.
import type { Bloc, Exercice, LignePrescription, Programme, Seance, SeanceModele } from './types';

type NouvelId = () => string;

const sansAccents = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Recherche dans le catalogue : tous les mots doivent apparaître (nom, famille, matériel, muscles),
 * sans tenir compte des accents. Les noms qui commencent par la recherche passent en premier.
 */
export function rechercherExercices(catalogue: Exercice[], recherche: string, famille?: string, limite = 40) {
  const mots = sansAccents(recherche).split(/\s+/).filter(Boolean);
  const resultats = catalogue.filter((e) => {
    if (famille && e.famille !== famille) return false;
    const texte = sansAccents([e.nom, e.famille, ...(e.materiel ?? []), ...(e.muscles ?? [])].filter(Boolean).join(' '));
    return mots.every((m) => texte.includes(m));
  });
  const debut = sansAccents(recherche.trim());
  resultats.sort((a, b) => {
    const da = debut && sansAccents(a.nom).startsWith(debut) ? 0 : 1;
    const db = debut && sansAccents(b.nom).startsWith(debut) ? 0 : 1;
    return da - db || a.nom.localeCompare(b.nom, 'fr');
  });
  return { exercices: resultats.slice(0, limite), total: resultats.length };
}

/** Familles présentes dans le catalogue, dans l'ordre d'Airtable (du bas du corps au cardio). */
export function familles(catalogue: Exercice[]) {
  const vues: string[] = [];
  catalogue.forEach((e) => e.famille && !vues.includes(e.famille) && vues.push(e.famille));
  return vues;
}

/** Une prescription de départ raisonnable, que le coach ajuste. */
export function nouvelleLigne(exercice: Exercice, nouvelId: NouvelId): LignePrescription {
  const m = exercice.mesures;
  return {
    id: nouvelId(),
    exercice,
    series: 3,
    repetitionsMin: m.includes('repetitions') ? 10 : undefined,
    repetitionsMax: m.includes('repetitions') ? 12 : undefined,
    dureeS: !m.includes('repetitions') && m.includes('duree') ? 30 : undefined,
    recuperationS: 90,
  };
}

export const nouveauBloc = (titre: string, nouvelId: NouvelId): Bloc => ({ id: nouvelId(), titre, lignes: [] });

export function nouvelleSeance(clientId: string, nouvelId: NouvelId, titre = ''): Seance {
  return { id: nouvelId(), clientId, titre, blocs: [nouveauBloc('Échauffement', nouvelId), nouveauBloc('Corps de séance', nouvelId)] };
}

/** Déplace un élément d'une case vers le haut (-1) ou le bas (+1). */
export function deplacer<T>(liste: T[], index: number, sens: -1 | 1): T[] {
  const cible = index + sens;
  if (cible < 0 || cible >= liste.length) return liste;
  const copie = [...liste];
  [copie[index], copie[cible]] = [copie[cible], copie[index]];
  return copie;
}

/** Ce qui empêche d'enregistrer la séance. Vide = la séance peut partir chez le client. */
export function erreursSeance(s: Pick<Seance, 'titre' | 'blocs'>): string[] {
  const erreurs: string[] = [];
  if (!s.titre.trim()) erreurs.push('Donne un titre à la séance.');
  const lignes = s.blocs.flatMap((b) => b.lignes);
  if (lignes.length === 0) erreurs.push('Ajoute au moins un exercice.');
  for (const l of lignes) {
    const nom = l.exercice.nom;
    if (!Number.isInteger(l.series) || l.series < 1) erreurs.push(`${nom} : au moins 1 série.`);
    if (l.repetitionsMin !== undefined && l.repetitionsMax !== undefined && l.repetitionsMin > l.repetitionsMax) {
      erreurs.push(`${nom} : les répétitions minimum dépassent le maximum.`);
    }
    for (const [cle, v] of Object.entries({
      répétitions: l.repetitionsMin,
      'répétitions max': l.repetitionsMax,
      charge: l.chargeIndicative,
      durée: l.dureeS,
      récupération: l.recuperationS,
      RIR: l.rir,
    })) {
      if (v !== undefined && (Number.isNaN(v) || v < 0)) erreurs.push(`${nom} : ${cle} invalide.`);
    }
  }
  return erreurs;
}

/** Les blocs vides ne partent pas chez le client. */
export const nettoyerSeance = <T extends Pick<Seance, 'blocs' | 'titre'>>(s: T): T => ({
  ...s,
  titre: s.titre.trim(),
  blocs: s.blocs.filter((b) => b.lignes.length > 0),
});

/** Même séance, nouveaux identifiants : pour dupliquer ou passer d'un modèle à un client. */
export function copierBlocs(blocs: Bloc[], nouvelId: NouvelId): Bloc[] {
  return blocs.map((b) => ({ ...b, id: nouvelId(), lignes: b.lignes.map((l) => ({ ...l, id: nouvelId() })) }));
}

export function dupliquerSeance(s: Seance | SeanceModele, clientId: string, nouvelId: NouvelId, titre?: string): Seance {
  return {
    id: nouvelId(),
    clientId,
    titre: titre ?? s.titre,
    consignes: s.consignes,
    blocs: copierBlocs(s.blocs, nouvelId),
  };
}

const ajouterJours = (iso: string, jours: number) => {
  const [a, m, j] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + jours));
  return d.toISOString().slice(0, 10);
};

/**
 * Attribue un modèle à un client : un nouveau programme et ses séances, réparties dans la semaine
 * (3 séances par semaine : lundi, mercredi, vendredi si le début est un lundi).
 */
export function attribuerModele(modele: Programme, clientId: string, debut: string | undefined, nouvelId: NouvelId) {
  const programme: Programme = { ...modele, id: nouvelId(), clientId, seances: [] };
  const parSemaine = Math.max(1, modele.seancesParSemaine ?? 3);
  const ecart = Math.max(1, Math.floor(7 / parSemaine));
  const seances: Seance[] = modele.seances.map((s, n) => ({
    ...dupliquerSeance(s, clientId, nouvelId),
    programmeId: programme.id,
    ordre: n + 1,
    datePrevue: debut ? ajouterJours(debut, Math.floor(n / parSemaine) * 7 + (n % parSemaine) * ecart) : undefined,
  }));
  return { programme, seances };
}

export function erreursProgramme(p: Pick<Programme, 'titre' | 'seances' | 'dureeSemaines' | 'seancesParSemaine'>): string[] {
  const erreurs: string[] = [];
  if (!p.titre.trim()) erreurs.push('Donne un nom au programme.');
  if (p.dureeSemaines !== undefined && !(p.dureeSemaines >= 1 && p.dureeSemaines <= 104)) erreurs.push('Durée : entre 1 et 104 semaines.');
  if (p.seancesParSemaine !== undefined && !(p.seancesParSemaine >= 1 && p.seancesParSemaine <= 14)) {
    erreurs.push('Séances par semaine : entre 1 et 14.');
  }
  return erreurs;
}

/** Lit « 26/10 », « 26/10/2026 » ou « 2026-10-26 ». Sans année, la prochaine occurrence à partir d'aujourd'hui. */
export function lireDate(saisie: string, maintenant = new Date()): string | undefined {
  const t = saisie.trim();
  let a: number, m: number, j: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  const fr = /^(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?$/.exec(t);
  if (iso) [a, m, j] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else if (fr) {
    j = Number(fr[1]);
    m = Number(fr[2]);
    if (fr[3]) a = fr[3].length === 2 ? 2000 + Number(fr[3]) : Number(fr[3]);
    else {
      a = maintenant.getFullYear();
      const hier = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate() - 1);
      if (new Date(a, m - 1, j) < hier) a += 1;
    }
  } else return undefined;
  const d = new Date(Date.UTC(a, m - 1, j));
  if (d.getUTCMonth() !== m - 1 || d.getUTCDate() !== j) return undefined;
  return d.toISOString().slice(0, 10);
}

export const formaterDate = (iso?: string) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '');

/** Résumé d'une ligne pour la liste : « 4 × 8-12 · 40 kg · récup 1 min 30 ». */
export function resumeLigne(l: LignePrescription): string {
  const morceaux: string[] = [];
  const reps =
    l.repetitionsMin !== undefined
      ? l.repetitionsMax !== undefined && l.repetitionsMax !== l.repetitionsMin
        ? `${l.repetitionsMin}-${l.repetitionsMax}`
        : `${l.repetitionsMin}`
      : undefined;
  if (reps) morceaux.push(`${l.series} × ${reps}`);
  else if (l.dureeS) morceaux.push(`${l.series} × ${duree(l.dureeS)}`);
  else morceaux.push(`${l.series} série${l.series > 1 ? 's' : ''}`);
  if (l.chargeIndicative) morceaux.push(`${String(l.chargeIndicative).replace('.', ',')} kg`);
  if (l.rir !== undefined) morceaux.push(`RIR ${l.rir}`);
  if (l.tempo) morceaux.push(`tempo ${l.tempo}`);
  if (l.recuperationS) morceaux.push(`récup ${duree(l.recuperationS)}`);
  return morceaux.join(' · ');
}

function duree(s: number) {
  if (s < 60) return `${s} s`;
  const min = Math.floor(s / 60);
  const reste = s % 60;
  return reste ? `${min} min ${reste}` : `${min} min`;
}
