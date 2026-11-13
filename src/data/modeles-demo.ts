// Les 95 modèles d'Airtable (Usage = Modèle), lus une fois en lecture seule et rangés dans modeles-demo.json par
// scripts/import-programmes.mjs. Le même import alimente Supabase ; ici, il sert au mode démo.
import type { VarianteCycle } from '@/domain/cycles';
import type { Exercice, LignePrescription, Phase } from '@/domain/types';
import type { ProgrammeStocke, SeanceStockee } from '@/domain/entrainement-etat';

import catalogue from './catalogue-demo.json';
import brut from './modeles-demo.json';

type N = number | null;
type Ligne = [string, number, N, N, N, N, N, N, N, N, N, N, N, N, N, N];
type Bloc = [number, Ligne[]];
type SeanceT = [string, number, N, N, N, N, N, Bloc[]];
type ProgrammeT = [string, number, N, N, N, N, N, N, N, N, N, number[], N, N, number, SeanceT[]];
type Variante = [number, N, N, N, N, N, N, N];

const doc = brut as unknown as { d: string[]; c: Variante[][]; p: ProgrammeT[] };
const t = (i: N) => (i === null ? undefined : doc.d[i]);
const n = (v: N) => (v === null ? undefined : v);

const exercices = new Map((catalogue as Exercice[]).map((e) => [e.id, e]));
const exercice = (ref: string): Exercice => exercices.get(`ex-${ref}`) ?? { id: `ex-${ref}`, nom: ref, mesures: ['charge', 'repetitions'] };

const variantes = (i: N): VarianteCycle[] | undefined =>
  i === null
    ? undefined
    : doc.c[i].map(([series, reps, recup, rir, charge, tempo, cons, prog]) => ({
        series,
        repetitions: t(reps) ?? '',
        recuperationS: n(recup),
        rir: rir ?? '',
        chargeIntensite: t(charge) ?? '',
        tempo: t(tempo) ?? '',
        consignes: t(cons) ?? '',
        progressionPrevue: t(prog) ?? '',
      }));

const ligne = ([ref, exo, series, reps, rmin, rmax, duree, dist, charge, recup, rir, tempo, cons, phase, prog, cyc]: Ligne): LignePrescription => ({
  id: ref,
  exercice: exercice(doc.d[exo]),
  series: series ?? 0,
  repetitions: t(reps),
  repetitionsMin: n(rmin),
  repetitionsMax: n(rmax),
  dureeS: n(duree),
  distanceM: n(dist),
  chargeIntensite: t(charge),
  recuperationS: n(recup),
  rir: n(rir),
  tempo: t(tempo),
  consignes: t(cons),
  phase: t(phase) as Phase | undefined,
  progression: t(prog),
  cycles: variantes(cyc),
});

let cache: { programmes: ProgrammeStocke[]; seances: SeanceStockee[] } | undefined;

export function modelesImportes(coachId: string) {
  if (cache) return cache;
  const programmes: ProgrammeStocke[] = [];
  const seances: SeanceStockee[] = [];
  for (const [ref, titre, niveau, obj, freq, duree, env, mat, cont, cons, cible, prio, version, statut, seule, ss] of doc.p) {
    programmes.push({
      id: ref,
      coachId,
      titre: doc.d[titre],
      niveau: t(niveau),
      objectif: t(obj),
      seancesParSemaine: n(freq),
      dureeSemaines: n(duree),
      environnement: t(env),
      materiel: t(mat),
      contraintes: t(cont),
      consignes: t(cons),
      dureeCibleMin: n(cible),
      priorites: prio.map((i) => doc.d[i]),
      version: t(version),
      statut: t(statut),
      seanceSeule: !!seule,
    });
    for (const [sref, stitre, ordre, dom, dmin, sobj, scons, blocs] of ss)
      seances.push({
        id: sref,
        coachId,
        programmeId: ref,
        titre: doc.d[stitre],
        ordre: n(ordre),
        dominante: t(dom),
        dureeMin: n(dmin),
        objectif: t(sobj),
        consignes: t(scons),
        blocs: blocs.map(([bt, lignes], i) => ({ id: `${sref}:bloc:${i}`, titre: doc.d[bt], lignes: lignes.map(ligne) })),
      });
  }
  cache = { programmes, seances };
  return cache;
}
