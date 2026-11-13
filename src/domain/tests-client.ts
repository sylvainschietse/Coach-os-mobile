// Tests d'un client suivi depuis longtemps (hors Booster) : tests golf chiffrés et angles mesurés en vidéo,
// datés, pour suivre l'évolution d'une fois sur l'autre.
import { syntheseBilan, vuesCompletes, type BilanPostural } from './bilan-postural';
import type { MesureAngle } from './mesure-angle';
import { syntheseGolf, testsGolfRenseignes, type EvaluationGolf } from './tests-golf';

export type FamilleMesure = 'mobilite' | 'posture';

export interface TestClient {
  id: string;
  clientId: string;
  /** AAAA-MM-JJ. */
  date: string;
  golf?: EvaluationGolf;
  /** Bilan postural par photos et vidéos. */
  posture?: BilanPostural;
  mesures: Partial<Record<FamilleMesure, MesureAngle[]>>;
  notes?: string;
}

export const testVide = (id: string, clientId: string, date: string): TestClient => ({ id, clientId, date, mesures: {} });

/** Rien de saisi : inutile d'enregistrer. */
export const testClientVide = (t: TestClient) =>
  testsGolfRenseignes(t.golf) === 0 && vuesCompletes(t.posture) === 0 && !t.mesures.mobilite?.length && !t.mesures.posture?.length && !t.notes?.trim();

/** Le dernier test du client avant celui-ci, avec des tests golf mesurés. */
export function golfAvant(tests: TestClient[], t: Pick<TestClient, 'id' | 'date'>): TestClient | undefined {
  return tests
    .filter((x) => x.id !== t.id && x.date <= t.date && testsGolfRenseignes(x.golf) > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** Le dernier test du client avant celui-ci avec un bilan postural. */
export function postureAvant(tests: TestClient[], t: Pick<TestClient, 'id' | 'date'>): TestClient | undefined {
  return tests
    .filter((x) => x.id !== t.id && x.date <= t.date && vuesCompletes(x.posture) > 0)
    .sort((a, b) => b.date.localeCompare(a.date))[0];
}

/** Même mesure (même nom) lors d'un test précédent : sert à afficher l'écart. */
export function mesureAvant(tests: TestClient[], t: Pick<TestClient, 'id' | 'date'>, famille: FamilleMesure, libelle: string): number | undefined {
  const cle = libelle.trim().toLowerCase();
  for (const x of tests.filter((x) => x.id !== t.id && x.date <= t.date).sort((a, b) => b.date.localeCompare(a.date))) {
    const m = x.mesures[famille]?.find((m) => m.libelle.trim().toLowerCase() === cle);
    if (m) return m.angle;
  }
  return undefined;
}

/** Résumé d'une ligne pour la liste des tests. */
export function resumeTest(t: TestClient): string {
  const morceaux: string[] = [];
  const vues = vuesCompletes(t.posture);
  if (vues) morceaux.push(`bilan postural (${vues} vue${vues > 1 ? 's' : ''})`);
  const golf = testsGolfRenseignes(t.golf);
  if (golf) morceaux.push(`${golf} test${golf > 1 ? 's' : ''} golf`);
  const n = (t.mesures.mobilite?.length ?? 0) + (t.mesures.posture?.length ?? 0);
  if (n) morceaux.push(`${n} mesure${n > 1 ? 's' : ''} vidéo`);
  return morceaux.join(' · ') || 'Aucune mesure';
}

/** Texte complet, au format des tests du Booster. */
export function syntheseTest(t: TestClient): string {
  const lignes = [...syntheseBilan(t.posture), ...syntheseGolf(t.golf)];
  for (const [f, titre] of [['mobilite', 'MOBILITÉ'], ['posture', 'POSTURE']] as const) {
    const m = t.mesures[f];
    if (m?.length) lignes.push(`${titre} — ${m.map((x) => `${x.libelle} ${x.angle}°`).join(', ')}`);
  }
  if (t.notes?.trim()) lignes.push(`NOTES — ${t.notes.trim()}`);
  return lignes.join('\n');
}
