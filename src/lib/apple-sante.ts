// Lecture d'Apple Santé (iPhone) : séances de sport seulement. L'appli Technogym, Garmin Connect, Strava, la montre Apple…
// y déposent leurs séances ; on ne fait que lire, avec l'accord du client.
// Le module natif est chargé à la demande : sur Android, sur le web ou sur une ancienne version de l'appli, tout renvoie « indisponible ».

import { Platform } from 'react-native';
import type * as HK from '@kingstinct/react-native-healthkit';

import { aImporter, sportAppleSante, titreAppleSante, type NouvelleActivite } from '@/domain/activites';

type Module = typeof HK;
let module: Module | null | undefined;

function charger(): Module | null {
  if (module !== undefined) return module;
  if (Platform.OS !== 'ios') return (module = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- chargement à la demande, voir plus haut
    module = require('@kingstinct/react-native-healthkit') as Module;
  } catch {
    // Appli fabriquée avant l'ajout du module : il faut installer la nouvelle version.
    module = null;
  }
  return module;
}

/** Tout ce que CoachGo lit. La phrase affichée par l'iPhone est dans app.json (plugin react-native-healthkit). */
const LECTURES = ['HKWorkoutTypeIdentifier', 'HKQuantityTypeIdentifierHeartRate'] as const;

export async function appleSanteDisponible(): Promise<boolean> {
  const hk = charger();
  if (!hk) return false;
  try {
    return await hk.isHealthDataAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * L'iPhone ne dit jamais si la lecture a été accordée (c'est voulu par Apple) : on sait seulement si la question
 * a déjà été posée. Si oui, on lit ; une lecture refusée renvoie simplement une liste vide.
 */
export async function questionDejaPosee(): Promise<boolean> {
  const hk = charger();
  if (!hk) return false;
  try {
    const s = await hk.getRequestStatusForAuthorization({ toRead: [...LECTURES] });
    return s === hk.AuthorizationRequestStatus.unnecessary;
  } catch {
    return false;
  }
}

/** Affiche la fenêtre d'Apple Santé. Renvoie vrai si la question a bien été posée. */
export async function demanderAcces(): Promise<boolean> {
  const hk = charger();
  if (!hk) return false;
  await hk.requestAuthorization({ toRead: [...LECTURES] });
  return questionDejaPosee();
}

const arrondi = (n: number | undefined) => (n && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined);

/** Séances commencées depuis `depuis` (ISO), avec distance, calories et fréquence cardiaque de la séance. */
export async function lireSeances(depuis: string): Promise<NouvelleActivite[]> {
  const hk = charger();
  if (!hk || !(await questionDejaPosee())) return [];
  const seances = await hk.queryWorkoutSamples({ limit: 500, ascending: false, filter: { date: { startDate: new Date(depuis), endDate: new Date() } } });
  const sortie: NouvelleActivite[] = [];
  for (const s of seances) {
    const sport = sportAppleSante(s.workoutActivityType);
    const origine = s.sourceRevision?.source?.name || s.sourceRevision?.source?.bundleIdentifier || '';
    const appareil = `${origine}${s.sourceRevision?.source?.bundleIdentifier && origine !== s.sourceRevision.source.bundleIdentifier ? ` (${s.sourceRevision.source.bundleIdentifier})` : ''}`;
    if (!aImporter(sport, appareil) || !s.uuid) continue;
    const fc = await s.getStatistic('HKQuantityTypeIdentifierHeartRate', 'count/min').catch(() => undefined);
    const distance = s.totalDistance;
    const energie = s.totalEnergyBurned;
    sortie.push({
      source: 'apple_sante',
      idExterne: s.uuid,
      sport,
      titre: titreAppleSante(s.workoutActivityType),
      debut: new Date(s.startDate).toISOString(),
      dureeS: Math.round((new Date(s.endDate).getTime() - new Date(s.startDate).getTime()) / 1000),
      distanceM: arrondi(distance ? (distance.unit === 'km' ? distance.quantity * 1000 : distance.unit === 'mi' ? distance.quantity * 1609.344 : distance.quantity) : undefined),
      fcMoy: arrondi(fc?.averageQuantity?.quantity),
      fcMax: arrondi(fc?.maximumQuantity?.quantity),
      calories: arrondi(energie ? (energie.unit === 'kJ' ? energie.quantity / 4.184 : energie.quantity) : undefined),
      appareil: appareil.slice(0, 200),
    });
  }
  return sortie;
}
