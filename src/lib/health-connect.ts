// Lecture de Health Connect (Android) : séances de sport, pas et sommeil.
// Garmin Connect, Strava, Samsung Health, Google Fit… y déposent leurs données ; on ne fait que lire, avec l'accord du client.
// Le module natif est chargé à la demande : sur le web, sur iPhone ou sur une ancienne version de l'APK, tout renvoie « indisponible ».

import { Platform } from 'react-native';
import type * as HC from 'react-native-health-connect';

import { heuresDeSommeil, heureParis, plageJourParis, sportHealthConnect, SPORTS_IMPORTES, type NouvelleActivite, type PeriodeSommeil } from '@/domain/activites';
import { ajouterJours } from '@/domain/entrainement';

type Module = typeof HC;
let module: Module | null | undefined;
let pret: Promise<boolean> | undefined;

function charger(): Module | null {
  if (module !== undefined) return module;
  if (Platform.OS !== 'android') return (module = null);
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- chargement à la demande, voir plus haut
    module = require('react-native-health-connect') as Module;
  } catch {
    // APK fabriqué avant l'ajout du module : il faut installer la nouvelle version.
    module = null;
  }
  return module;
}

export type EtatHealthConnect = 'indisponible' | 'a_installer' | 'disponible';

/** Health Connect est-il utilisable sur ce téléphone ? */
export async function etatHealthConnect(): Promise<EtatHealthConnect> {
  const hc = charger();
  if (!hc) return 'indisponible';
  try {
    const s = await hc.getSdkStatus();
    if (s === hc.SdkAvailabilityStatus.SDK_AVAILABLE) return 'disponible';
    if (s === hc.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return 'a_installer';
    return 'indisponible';
  } catch {
    return 'indisponible';
  }
}

async function initialiser(hc: Module) {
  pret ??= hc.initialize().catch(() => {
    pret = undefined;
    return false;
  });
  return pret;
}

/** Tout ce que CoachGo lit. Les mêmes lignes sont déclarées dans app.json (android.permissions). */
const LECTURES = ['ExerciseSession', 'Distance', 'ElevationGained', 'HeartRate', 'TotalCaloriesBurned', 'Steps', 'SleepSession'] as const;
type Lecture = (typeof LECTURES)[number];

/** Demande l'accès (fenêtre de Health Connect) et renvoie les types accordés. */
export async function demanderAcces(): Promise<Lecture[]> {
  const hc = charger();
  if (!hc || !(await initialiser(hc))) return [];
  const accordees = await hc.requestPermission(LECTURES.map((recordType) => ({ accessType: 'read' as const, recordType })));
  return accesDepuis(accordees);
}

/** Types déjà accordés, sans rien afficher. */
export async function accesAccordes(): Promise<Lecture[]> {
  const hc = charger();
  if (!hc || !(await initialiser(hc))) return [];
  try {
    return accesDepuis(await hc.getGrantedPermissions());
  } catch {
    return [];
  }
}

function accesDepuis(liste: { accessType: string; recordType?: string }[]) {
  return LECTURES.filter((t) => liste.some((p) => p.accessType === 'read' && p.recordType === t));
}

/** Ouvre les réglages de Health Connect (pour retirer l'accès ou choisir les applis sources). */
export function ouvrirReglages() {
  charger()?.openHealthConnectSettings();
}

async function accesPret(types: Lecture[]): Promise<Module | null> {
  const hc = charger();
  if (!hc || !(await initialiser(hc))) return null;
  const ok = await accesAccordes();
  return types.every((t) => ok.includes(t)) ? hc : null;
}

/** Nombre total de pas d'un jour (heure de Paris). Health Connect fusionne montre et téléphone sans doublon. */
export async function lirePas(jour: string): Promise<number | null> {
  const hc = await accesPret(['Steps']);
  if (!hc) return null;
  const { debut, fin } = plageJourParis(jour);
  const r = await hc.aggregateRecord({ recordType: 'Steps', timeRangeFilter: { operator: 'between', startTime: debut, endTime: fin } });
  return r.dataOrigins.length ? r.COUNT_TOTAL : null;
}

/** Heures dormies la nuit qui se termine le matin de `jour` (null si rien n'est enregistré). */
export async function lireSommeil(jour: string): Promise<number | null> {
  const hc = await accesPret(['SleepSession']);
  if (!hc) return null;
  const { records } = await hc.readRecords('SleepSession', {
    timeRangeFilter: { operator: 'between', startTime: heureParis(ajouterJours(jour, -1), 12), endTime: heureParis(jour, 14) },
  });
  const eveil = [hc.SleepStageType.AWAKE, hc.SleepStageType.OUT_OF_BED] as number[];
  const periodes: PeriodeSommeil[] = records.map((s) => ({
    debut: s.startTime,
    fin: s.endTime,
    origine: s.metadata?.dataOrigin ?? '',
    eveils: (s.stages ?? []).filter((x) => eveil.includes(x.stage)).map((x) => ({ debut: x.startTime, fin: x.endTime })),
  }));
  return heuresDeSommeil(periodes, jour);
}

/**
 * Séances de sport commencées depuis `depuis` (ISO). Distance, dénivelé, FC et calories sont totalisés sur la durée de la séance,
 * en ne gardant que l'appli qui l'a enregistrée (sinon le téléphone ajouterait ses propres pas et distances).
 */
export async function lireSeances(depuis: string): Promise<NouvelleActivite[]> {
  const hc = await accesPret(['ExerciseSession']);
  if (!hc) return [];
  const accordes = await accesAccordes();
  const seances: HC.RecordResult<'ExerciseSession'>[] = [];
  let pageToken: string | undefined;
  do {
    const r = await hc.readRecords('ExerciseSession', {
      timeRangeFilter: { operator: 'between', startTime: depuis, endTime: new Date().toISOString() },
      pageSize: 200,
      pageToken,
    });
    seances.push(...r.records);
    pageToken = r.pageToken || undefined;
  } while (pageToken && seances.length < 1000);

  const sortie: NouvelleActivite[] = [];
  for (const s of seances) {
    const sport = sportHealthConnect(s.exerciseType);
    if (!SPORTS_IMPORTES.includes(sport) || !s.metadata?.id) continue;
    const origine = s.metadata.dataOrigin;
    const plage = { timeRangeFilter: { operator: 'between' as const, startTime: s.startTime, endTime: s.endTime }, dataOriginFilter: origine ? [origine] : undefined };
    const total = async <T extends 'Distance' | 'ElevationGained' | 'HeartRate' | 'TotalCaloriesBurned'>(t: T) =>
      accordes.includes(t) ? hc.aggregateRecord({ recordType: t, ...plage }).catch(() => null) : null;
    const [distance, denivele, fc, calories] = await Promise.all([total('Distance'), total('ElevationGained'), total('HeartRate'), total('TotalCaloriesBurned')]);
    const arrondi = (n: number | undefined) => (n && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined);
    sortie.push({
      source: 'health_connect',
      idExterne: s.metadata.id,
      sport,
      titre: s.title?.trim() || '',
      debut: s.startTime,
      dureeS: Math.round((Date.parse(s.endTime) - Date.parse(s.startTime)) / 1000),
      distanceM: arrondi(distance?.DISTANCE?.inMeters),
      deniveleM: arrondi(denivele?.ELEVATION_GAINED_TOTAL?.inMeters),
      fcMoy: arrondi(fc?.BPM_AVG),
      fcMax: arrondi(fc?.BPM_MAX),
      calories: arrondi(calories?.ENERGY_TOTAL?.inKilocalories),
      appareil: origine,
    });
  }
  return sortie;
}
