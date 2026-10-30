// LigneAirtableDialog.tsx d'origine : ajouter, modifier ou remplacer un exercice d'une séance, avec un format
// de travail (séries / répétitions, travail chronométré, objectif cardio ou déplacement) selon le type d'exercice.
import { useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { depot } from '@/data';
import {
  formatDeLigne,
  LIBELLES_OBJECTIF,
  LIBELLES_TYPE,
  lireObjectif,
  lireRepetitions,
  objectifsPour,
  objectifValide,
  remplacerExercice,
  texteObjectif,
  typeDe,
  typeDeLigne,
  UNITES_OBJECTIF,
  type Format,
  type Objectif,
  type TypeExercice,
} from '@/domain/entrainement';
import { rechercherExercices } from '@/domain/programmes';
import type { Exercice, LignePrescription } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { Choix, Modale, Repliable, Recherche, Saisie } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { Action, Ligne, ListeChoix, ts } from './commun';

export type ModeLigne = 'add' | 'edit' | 'replace';
const TITRES: Record<ModeLigne, string> = { add: 'Ajouter un exercice', edit: 'Modifier la prescription', replace: 'Remplacer l’exercice' };
const FORMATS: Record<Format, string> = { reps: 'Séries / répétitions', temps: 'Travail chronométré', objectif: 'Objectif cardio / déplacement' };
const TYPES = Object.keys(LIBELLES_TYPE) as TypeExercice[];

const entier = (v: string, max: number) => v.trim() === '' || (/^\d+$/.test(v.trim()) && +v <= max);
const nombre = (v: string) => (v.trim() === '' ? undefined : Number(v));
const texte = (v?: number) => (v === undefined || v === null ? '' : String(v));

export function DialogueLigne({
  mode,
  ligne,
  blocs,
  blocInitial,
  onFermer,
  onEnregistrer,
}: {
  mode: ModeLigne;
  ligne?: LignePrescription;
  /** Blocs de la séance : la ligne est rangée dans celui choisi. */
  blocs: { id: string; titre: string }[];
  blocInitial?: string;
  onFermer: () => void;
  /** Enregistre la séance ; une erreur reste affichée dans la boîte. */
  onEnregistrer: (ligne: LignePrescription, blocId: string) => Promise<void>;
}) {
  const catalogue = useCharger(() => (mode === 'edit' ? Promise.resolve([] as Exercice[]) : depot.catalogue()), `catalogue-${mode}`);
  const objectifInitial = ligne ? lireObjectif(ligne) : { type: 'temps' as Objectif, valeur: '' };
  const typeInitial: TypeExercice = ligne ? typeDeLigne(ligne) : 'force';
  const [f, setF] = useState({
    bloc: blocInitial ?? blocs[0]?.id ?? '',
    series: texte(ligne?.series ?? (mode === 'add' ? 3 : undefined)),
    repetitions: ligne?.repetitions ?? (ligne?.repetitionsMin !== undefined ? `${ligne.repetitionsMin}${ligne.repetitionsMax !== ligne.repetitionsMin ? `-${ligne.repetitionsMax}` : ''}` : ''),
    dureeS: texte(ligne?.dureeS),
    recuperationS: texte(ligne?.recuperationS),
    rir: texte(ligne?.rir),
    tempo: ligne?.tempo ?? '',
    charge: ligne && objectifInitial.type !== 'temps' ? '' : (ligne?.chargeIntensite ?? ''),
    consignes: ligne?.consignes ?? '',
    progression: ligne?.progression ?? '',
  });
  const [exercice, setExercice] = useState<Exercice | undefined>(mode === 'replace' ? undefined : ligne?.exercice);
  const [type, setType] = useState<TypeExercice>(typeInitial);
  const [format, setFormat] = useState<Format>(() => (ligne ? formatDeLigne(ligne, typeInitial) : 'reps'));
  const [objectif, setObjectif] = useState<Objectif>(objectifInitial.type);
  const [valeurObjectif, setValeurObjectif] = useState(objectifInitial.valeur);
  const [q, setQ] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const verrou = useRef(false);

  const erreurs: Partial<Record<keyof typeof f | 'exercice', string>> = {
    ...(!exercice && { exercice: 'Choisissez un exercice' }),
    ...(!entier(f.series, 50) && { series: 'Entier 0–50' }),
    ...(f.repetitions.length > 40 && { repetitions: '40 caractères au plus' }),
    ...(!entier(f.dureeS, 36000) && { dureeS: 'Secondes (entier)' }),
    ...(!entier(f.recuperationS, 3600) && { recuperationS: 'Secondes (entier)' }),
    ...(!entier(f.rir, 10) && { rir: 'Entier 0–10' }),
    ...(f.tempo.length > 20 && { tempo: '20 caractères au plus' }),
    ...(f.charge.length > 100 && { charge: '100 caractères au plus' }),
  };
  const objectifOk =
    format !== 'objectif' || (objectifsPour(type).includes(objectif) && objectifValide(objectif, valeurObjectif) && (objectif !== 'temps' || Number(valeurObjectif) <= 36000));
  const tempsOk = format !== 'temps' || (Number(f.dureeS) > 0 && Number(f.dureeS) <= 36000);
  const valide = !Object.keys(erreurs).length && objectifOk && tempsOk && !!f.bloc;

  const liste = useMemo(() => {
    const tous = (catalogue.donnee ?? []).filter((e) => e.id !== (mode === 'replace' ? ligne?.exercice.id : ''));
    return rechercherExercices(tous, q, undefined, 60).exercices;
  }, [catalogue.donnee, q, mode, ligne]);

  const choisir = (e: Exercice) => {
    const k = typeDe(e);
    setType(k);
    setFormat(k === 'force' ? 'reps' : k === 'statique' ? 'temps' : 'objectif');
    setObjectif('temps');
    setValeurObjectif('');
    setExercice(e);
  };

  const enregistrer = async () => {
    if (!valide || !exercice || verrou.current) return;
    verrou.current = true;
    setOccupe(true);
    setErreur('');
    const reps = format === 'reps' ? f.repetitions.trim() : '';
    const bornes = lireRepetitions(reps);
    const base: LignePrescription = ligne ? (mode === 'replace' ? remplacerExercice(ligne, exercice) : ligne) : { id: nouvelId(), exercice, series: 0 };
    const suivante: LignePrescription = {
      ...base,
      exercice,
      series: nombre(f.series) ?? 0,
      repetitions: reps || undefined,
      repetitionsMin: bornes?.min,
      repetitionsMax: bornes?.max,
      dureeS: format === 'temps' ? nombre(f.dureeS) : format === 'objectif' && objectif === 'temps' ? Number(valeurObjectif) : undefined,
      distanceM: format === 'objectif' && objectif === 'distance' ? Number(valeurObjectif.replace(',', '.')) : undefined,
      recuperationS: nombre(f.recuperationS),
      rir: format === 'reps' ? nombre(f.rir) : undefined,
      tempo: format === 'reps' ? f.tempo.trim() || undefined : undefined,
      chargeIntensite: (format === 'objectif' ? texteObjectif(objectif, valeurObjectif) : f.charge.trim()) || undefined,
      chargeIndicative: undefined,
      consignes: f.consignes.trim() || undefined,
      progression: f.progression.trim() || undefined,
    };
    try {
      await onEnregistrer(suivante, f.bloc);
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec de l’enregistrement');
    } finally {
      verrou.current = false;
      setOccupe(false);
    }
  };

  const champ = (k: keyof typeof f, libelle: string, ph = '') => (
    <View style={{ flexBasis: '45%', flexGrow: 1, minWidth: 0 }}>
      <Saisie libelle={libelle} valeur={f[k]} placeholder={ph} erreur={erreurs[k]} onChange={(v) => setF({ ...f, [k]: v })} />
    </View>
  );

  return (
    <Modale
      titre={TITRES[mode]}
      largeur={576}
      onFermer={() => !occupe && onFermer()}
      pied={
        <Ligne style={{ justifyContent: 'flex-end' }}>
          <Action libelle="Annuler" variante="contour" desactive={occupe} onPress={onFermer} />
          <Action libelle="Enregistrer" desactive={!valide} chargement={occupe} onPress={enregistrer} />
        </Ligne>
      }
    >
      {mode !== 'edit' ? (
        <View style={{ gap: 8 }}>
          <Text style={ts.titreChamp}>
            Exercice{mode === 'replace' && ligne ? ` — remplace « ${ligne.exercice.nom} »` : ''}
          </Text>
          <View style={{ flexDirection: 'row' }}>
            <Recherche valeur={q} onChange={setQ} libelle="Rechercher un exercice" placeholder="Rechercher un exercice…" />
          </View>
          {catalogue.erreur ? (
            <Text accessibilityRole="alert" style={ts.erreur}>
              Exercices indisponibles : {catalogue.erreur}
            </Text>
          ) : (
            <ListeChoix
              elements={catalogue.donnee ? liste : null}
              cle={(e) => e.id}
              libelle={(e) => e.nom}
              detail={(e) => [e.famille, e.materiel?.join(', ')].filter(Boolean).join(' · ') || undefined}
              choisi={exercice?.id}
              onChoisir={choisir}
              hauteur={192}
            />
          )}
          {exercice && (
            <Text style={[ts.doux, { color: couleurs.texte }]}>
              Sélection : <Text style={{ fontFamily: polices.texteGras }}>{exercice.nom}</Text>
            </Text>
          )}
          {erreurs.exercice && <Text style={[ts.erreur, { fontSize: 12 }]}>{erreurs.exercice}</Text>}
        </View>
      ) : (
        <Text style={[ts.texte, { fontFamily: polices.texteMoyen }]}>{ligne?.exercice.nom}</Text>
      )}

      <Choix libelle="Bloc" vide={null} choix={blocs.map((b) => b.titre)} valeur={blocs.find((b) => b.id === f.bloc)?.titre} onChange={(t) => setF({ ...f, bloc: blocs.find((b) => b.titre === t)?.id ?? f.bloc })} />
      <Choix
        libelle="Format de travail"
        vide={null}
        choix={(Object.keys(FORMATS) as Format[]).filter((k) => k !== 'objectif' || objectifsPour(type).length > 1).map((k) => FORMATS[k])}
        valeur={FORMATS[format]}
        onChange={(l) => setFormat((Object.keys(FORMATS) as Format[]).find((k) => FORMATS[k] === l) ?? 'reps')}
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {champ('series', format === 'reps' ? 'Séries' : 'Séries / tours')}
        {format === 'reps' && champ('repetitions', 'Répétitions', '8-10')}
        {format === 'temps' && champ('dureeS', 'Temps de travail (secondes)', '30')}
        {champ('recuperationS', 'Repos entre séries (secondes)', '90')}
      </View>
      {format === 'temps' && !tempsOk && <Text style={[ts.erreur, { fontSize: 12 }]}>Renseignez un temps de travail supérieur à zéro.</Text>}
      {format === 'objectif' && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ flexBasis: '45%', flexGrow: 1, minWidth: 0 }}>
            <Choix
              libelle="Objectif"
              vide={null}
              choix={objectifsPour(type).map((o) => LIBELLES_OBJECTIF[o])}
              valeur={LIBELLES_OBJECTIF[objectif]}
              onChange={(l) => {
                setObjectif((Object.keys(LIBELLES_OBJECTIF) as Objectif[]).find((o) => LIBELLES_OBJECTIF[o] === l) ?? 'temps');
                setValeurObjectif('');
              }}
            />
          </View>
          <View style={{ flexBasis: '45%', flexGrow: 1, minWidth: 0 }}>
            <Saisie
              libelle={UNITES_OBJECTIF[objectif]}
              valeur={valeurObjectif}
              placeholder={objectif.startsWith('allure') ? '02:00' : ''}
              erreur={valeurObjectif && !objectifOk ? `Valeur positive requise${objectif.startsWith('allure') ? ' au format min:ss' : ''}.` : undefined}
              onChange={setValeurObjectif}
            />
          </View>
        </View>
      )}
      {format !== 'objectif' && champ('charge', 'Charge / intensité', '70 % 1RM')}
      {format === 'reps' && (
        <Repliable resume="Réglages avancés" style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 10, padding: 12 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {champ('rir', 'RIR', '2')}
            {champ('tempo', 'Tempo', '3-1-1-0')}
          </View>
          <Text style={[ts.doux, { marginTop: 8 }]}>Une charge exprimée en % 1RM utilise la référence de cet exercice dans l’espace client.</Text>
        </Repliable>
      )}
      <Repliable resume="Adapter le type d’exercice">
        <Choix
          libelle="Type d’exercice"
          sansLibelle
          vide={null}
          choix={TYPES.map((t) => LIBELLES_TYPE[t])}
          valeur={LIBELLES_TYPE[type]}
          onChange={(l) => {
            const k = TYPES.find((t) => LIBELLES_TYPE[t] === l) ?? 'force';
            setType(k);
            setObjectif('temps');
            setValeurObjectif('');
            if (objectifsPour(k).length === 1 && format === 'objectif') setFormat(k === 'statique' ? 'temps' : 'reps');
          }}
        />
      </Repliable>
      <Saisie libelle="Consignes" long valeur={f.consignes} onChange={(v) => setF({ ...f, consignes: v.slice(0, 3000) })} />
      <Saisie libelle="Progression prévue" long valeur={f.progression} onChange={(v) => setF({ ...f, progression: v.slice(0, 3000) })} />
      {erreur ? (
        <Text accessibilityRole="alert" style={ts.erreur}>
          {erreur}
        </Text>
      ) : null}
    </Modale>
  );
}
