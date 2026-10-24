// AirtableLibrary.tsx d'origine (C09) : « Mes programmes et séances », recherche, collection, niveau, objectif,
// séances par semaine, cartes à badges, sélection pour supprimer (50 au plus) et corbeille.
import { ChevronRight } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { entrainement } from '@/data/entrainement';
import { collectionDe, COLLECTIONS, correspondRecherche, NIVEAUX, sourceEntrainement } from '@/domain/entrainement';
import type { ElementCorbeille, ModeleResume } from '@/domain/entrainement-etat';
import { useCharger } from '@/lib/useCharger';

import { TitreDisplay } from '../coque';
import { Choix, Recherche } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { Action, CaseSelection, Ligne, Puce, ts } from './commun';
import { Corbeille, SuppressionEntrainement } from './corbeille';
import { CreationEntrainement } from './creation';

const TOUS = '';

function Filtre({ libelle, valeur, options, onChange }: { libelle: string; valeur: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 180, minWidth: 0 }}>
      <Choix libelle={libelle} sansLibelle choix={options} valeur={valeur || undefined} vide={`${libelle} : tous`} onChange={(v) => onChange(v ?? TOUS)} />
    </View>
  );
}

export function Bibliotheque({ coachId, onOuvrir }: { coachId: string; onOuvrir: (id: string) => void }) {
  const { width } = useWindowDimensions();
  const { donnee, erreur, recharger } = useCharger(() => entrainement.bibliotheque(coachId), `bibliotheque-${coachId}`);
  const [creation, setCreation] = useState<'programme' | 'seance'>();
  const [selection, setSelection] = useState(false);
  const [choisis, setChoisis] = useState<string[]>([]);
  const [suppression, setSuppression] = useState<ElementCorbeille[]>();
  const [message, setMessage] = useState('');
  const [q, setQ] = useState('');
  const [collection, setCollection] = useState(TOUS);
  const [niveau, setNiveau] = useState(TOUS);
  const [objectif, setObjectif] = useState(TOUS);
  const [frequence, setFrequence] = useState(TOUS);

  const options = (k: 'niveau' | 'objectif' | 'seancesParSemaine') => {
    const vals = [...new Set((donnee ?? []).map((p) => String(p[k] ?? '')).filter((v) => v && v !== '0'))];
    return k === 'niveau' ? NIVEAUX.filter((n) => vals.includes(n)) : k === 'seancesParSemaine' ? vals.sort((a, b) => +a - +b) : vals.sort();
  };
  const liste = useMemo(
    () =>
      (donnee ?? []).filter(
        (p) =>
          (!collection || collectionDe(p.titre) === collection) &&
          (!niveau || p.niveau === niveau) &&
          (!objectif || p.objectif === objectif) &&
          (!frequence || String(p.seancesParSemaine ?? '') === frequence) &&
          correspondRecherche(p.titre, q),
      ),
    [donnee, q, collection, niveau, objectif, frequence],
  );
  const deuxColonnes = width >= 768;

  return (
    <View>
      <TitreDisplay taille={30}>Mes programmes et séances</TitreDisplay>
      <Ligne style={{ marginTop: 12 }}>
        <Action libelle="Créer un programme" onPress={() => setCreation('programme')} />
        <Action libelle="Créer une séance seule" variante="contour" onPress={() => setCreation('seance')} />
      </Ligne>
      <Ligne style={{ marginTop: 12 }}>
        <Action
          petit
          variante="contour"
          libelle={selection ? 'Fin de sélection' : 'Sélectionner pour supprimer'}
          onPress={() => {
            setSelection(!selection);
            setChoisis([]);
          }}
        />
        {selection && (
          <>
            <Action petit variante="fantome" libelle="Sélectionner les éléments affichés (max. 50)" onPress={() => setChoisis(liste.slice(0, 50).map((p) => p.id))} />
            <Action
              petit
              variante="danger"
              libelle={`Supprimer (${choisis.length})`}
              desactive={!choisis.length}
              onPress={() => setSuppression((donnee ?? []).filter((p) => choisis.includes(p.id)).map((p) => ({ kind: 'programme', id: p.id, nom: p.titre })))}
            />
          </>
        )}
      </Ligne>
      {message ? (
        <Text accessibilityRole={'status' as never} style={[ts.doux, { color: couleurs.vert, marginTop: 8 }]}>
          {message}
        </Text>
      ) : null}
      <Text style={[ts.doux, { marginTop: 4, fontSize: 14 }]}>
        Modèles et créations libres · {donnee ? `${liste.length} / ${donnee.length} modèles` : 'chargement…'}
      </Text>

      <View style={{ marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <View style={{ flexGrow: 1, flexBasis: 180, minWidth: 0, flexDirection: 'row' }}>
          <Recherche valeur={q} onChange={setQ} libelle="Rechercher un programme" placeholder="Rechercher un programme…" />
        </View>
        <Filtre libelle="Collection" valeur={collection} options={COLLECTIONS} onChange={setCollection} />
        <Filtre libelle="Niveau" valeur={niveau} options={options('niveau')} onChange={setNiveau} />
        <Filtre libelle="Objectif" valeur={objectif} options={options('objectif')} onChange={setObjectif} />
        <Filtre libelle="Séances/sem." valeur={frequence} options={options('seancesParSemaine')} onChange={setFrequence} />
      </View>

      {erreur && (
        <Text accessibilityRole="alert" style={[ts.erreur, { marginTop: 20, borderWidth: 1, borderColor: 'rgba(195,24,30,0.4)', borderRadius: 12, padding: 16, fontSize: 14 }]}>
          {erreur}
        </Text>
      )}
      <View style={{ marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {!donnee && !erreur && [0, 1, 2, 3].map((i) => <View key={i} style={{ height: 128, borderRadius: 12, backgroundColor: couleurs.discret, flexBasis: deuxColonnes ? '48%' : '100%', flexGrow: 1 }} />)}
        {donnee && liste.length === 0 && <Text style={[ts.doux, { fontSize: 14 }]}>Aucun modèle ne correspond aux filtres.</Text>}
        {liste.map((p) => (
          <CarteModele
            key={p.id}
            p={p}
            demi={deuxColonnes}
            selection={selection}
            choisi={choisis.includes(p.id)}
            plein={choisis.length >= 50}
            onChoisir={(v) => setChoisis((c) => (v ? [...c, p.id] : c.filter((id) => id !== p.id)))}
            onOuvrir={() => onOuvrir(p.id)}
          />
        ))}
      </View>
      <Corbeille
        coachId={coachId}
        onRestaure={() => {
          recharger();
          setChoisis([]);
        }}
      />

      {suppression && (
        <SuppressionEntrainement
          items={suppression}
          onFermer={() => setSuppression(undefined)}
          onSupprime={() => {
            setMessage('Sélection déplacée dans la corbeille.');
            setChoisis([]);
            setSelection(false);
            recharger();
          }}
        />
      )}
      {creation && (
        <CreationEntrainement
          coachId={coachId}
          action={creation}
          onFermer={() => setCreation(undefined)}
          onEnregistre={(r) => {
            recharger();
            onOuvrir(r.programmeId);
          }}
        />
      )}
    </View>
  );
}

function CarteModele({
  p,
  demi,
  selection,
  choisi,
  plein,
  onChoisir,
  onOuvrir,
}: {
  p: ModeleResume;
  demi: boolean;
  selection: boolean;
  choisi: boolean;
  plein: boolean;
  onChoisir: (v: boolean) => void;
  onOuvrir: () => void;
}) {
  const source = sourceEntrainement(p.titre);
  return (
    <View style={{ flexBasis: demi ? '48%' : '100%', flexGrow: 1, minWidth: 0 }}>
      <Pressable
        accessibilityRole="button"
        onPress={onOuvrir}
        style={(e) => [
          ts.carte,
          { gap: 0, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
          ((e as { hovered?: boolean }).hovered || e.pressed) && { borderColor: 'rgba(195,24,30,0.4)', shadowOpacity: 0.1, shadowRadius: 8 },
        ]}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ flex: 1, fontFamily: polices.texteGras, fontSize: 16, lineHeight: 21, color: couleurs.texte, paddingRight: selection ? 32 : 0 }}>{p.titre}</Text>
          {!selection && <ChevronRight size={20} color={couleurs.texteDoux} />}
        </View>
        <Ligne style={{ marginTop: 12, gap: 6 }}>
          <Puce libelle={collectionDe(p.titre)} variante="secondaire" />
          {p.objectif && <Puce libelle={p.objectif} variante="accent" />}
          {p.niveau && <Puce libelle={p.niveau} />}
          {!!p.seancesParSemaine && <Puce libelle={`${p.seancesParSemaine}×/sem.`} />}
          {!!p.dureeSemaines && <Puce libelle={`${p.dureeSemaines} sem.`} />}
          {p.environnement && <Puce libelle={p.environnement} />}
        </Ligne>
        {source && <Text style={[ts.doux, { marginTop: 8 }]}>{source.author} · Adaptation Coach OS</Text>}
        <Text style={[ts.doux, { marginTop: 12 }]}>
          {p.nbSeances} séance(s){p.statut ? ` · ${p.statut}` : ''}
        </Text>
      </Pressable>
      {selection && (
        <View style={{ position: 'absolute', right: 6, top: 8 }}>
          <CaseSelection nom={`Sélectionner ${p.titre}`} valeur={choisi} desactive={!choisi && plein} onChange={onChoisir} />
        </View>
      )}
    </View>
  );
}
