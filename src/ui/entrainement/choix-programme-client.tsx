// Fiche client › Programme : choisir un programme de la bibliothèque par critères (niveau, objectif, séances par semaine)
// et l'attribuer à ce client, ou en créer un (à la main ou avec l'assistant) puis l'attribuer.
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { entrainement } from '@/data/entrainement';
import { correspondRecherche, NIVEAUX, OBJECTIFS, titreClient } from '@/domain/entrainement';
import type { ModeleResume } from '@/domain/entrainement-etat';
import { useCharger } from '@/lib/useCharger';

import { Carte, Puce as Filtre, Puces, SousTitre } from '../composants';
import { Recherche } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { AttributionClient } from './attribution';
import { Action, Ligne, PhotoProgramme, Puce, ts } from './commun';
import { CreationEntrainement } from './creation';

const PAR_PAGE = 12;

export function ChoixProgrammeClient({ coachId, clientId }: { coachId: string; clientId: string }) {
  const { donnee, erreur, recharger } = useCharger(() => entrainement.bibliotheque(coachId), `bibliotheque-${coachId}`);
  const [q, setQ] = useState('');
  const [niveau, setNiveau] = useState('');
  const [objectif, setObjectif] = useState('');
  const [frequence, setFrequence] = useState(0);
  const [nombre, setNombre] = useState(PAR_PAGE);
  const [creation, setCreation] = useState(false);
  const [cree, setCree] = useState<{ id: string; titre: string }>();
  const [attribution, setAttribution] = useState<{ id: string; titre: string }>();

  const programmes = useMemo(() => (donnee ?? []).filter((p) => !p.seanceSeule), [donnee]);
  const frequences = useMemo(() => [...new Set(programmes.map((p) => p.seancesParSemaine ?? 0).filter(Boolean))].sort((a, b) => a - b), [programmes]);
  const liste = programmes.filter(
    (p) =>
      (!niveau || p.niveau === niveau) &&
      (!objectif || p.objectif === objectif) &&
      (!frequence || p.seancesParSemaine === frequence) &&
      correspondRecherche(p.titre, q),
  );
  const filtrer = (f: () => void) => {
    f();
    setNombre(PAR_PAGE);
  };

  return (
    <Carte>
      <SousTitre>Lui attribuer un programme</SousTitre>
      <Ligne>
        <Action libelle="Créer un programme" onPress={() => setCreation(true)} />
      </Ligne>
      {cree && (
        <View style={{ gap: 8, borderRadius: 12, padding: 12, backgroundColor: couleurs.vertClair }}>
          <Text style={[ts.texte, { fontFamily: polices.texteMoyen }]}>« {titreClient(cree.titre)} » est créé dans ta bibliothèque.</Text>
          <Ligne>
            <Action petit libelle="L’attribuer à ce client" onPress={() => setAttribution(cree)} />
            <Action
              petit
              variante="contour"
              libelle="Le modifier d’abord"
              onPress={() => router.setParams({ onglet: 'airtable', programme: cree.id, seance: undefined, contact: undefined, volet: undefined })}
            />
          </Ligne>
        </View>
      )}

      <Text style={ts.titreChamp}>Ou choisis dans ta bibliothèque</Text>
      <View style={{ flexDirection: 'row' }}>
        <Recherche valeur={q} onChange={(v) => filtrer(() => setQ(v))} libelle="Rechercher un programme" placeholder="Rechercher un programme…" />
      </View>
      <Criteres libelle="Niveau" options={NIVEAUX} valeur={niveau} onChange={(v) => filtrer(() => setNiveau(v))} />
      <Criteres libelle="Objectif" options={OBJECTIFS} valeur={objectif} onChange={(v) => filtrer(() => setObjectif(v))} />
      {frequences.length > 1 && (
        <Criteres
          libelle="Séances par semaine"
          options={frequences.map(String)}
          valeur={frequence ? String(frequence) : ''}
          onChange={(v) => filtrer(() => setFrequence(Number(v) || 0))}
        />
      )}

      {erreur && (
        <Text accessibilityRole="alert" style={ts.erreur} onPress={recharger}>
          {erreur} (toucher pour réessayer)
        </Text>
      )}
      {!donnee && !erreur && <Text style={ts.doux}>Chargement de la bibliothèque…</Text>}
      {donnee && (
        <Text style={[ts.doux, { fontSize: 13 }]}>
          {liste.length} programme{liste.length > 1 ? 's' : ''}
        </Text>
      )}
      {donnee && liste.length === 0 && <Text style={ts.doux}>Aucun programme ne correspond. Élargis les critères ou crée-en un.</Text>}
      {liste.slice(0, nombre).map((p) => (
        <LigneProgramme key={p.id} p={p} onAttribuer={() => setAttribution({ id: p.id, titre: p.titre })} />
      ))}
      {liste.length > nombre && <Action variante="contour" libelle={`Voir plus (${liste.length - nombre})`} onPress={() => setNombre(nombre + PAR_PAGE)} />}

      {creation && (
        <CreationEntrainement
          coachId={coachId}
          action="programme"
          onFermer={() => setCreation(false)}
          onEnregistre={async (r) => {
            recharger();
            const { programme } = await entrainement.programme(r.programmeId).catch(() => ({ programme: { titre: 'Le programme' } }));
            setCree({ id: r.programmeId, titre: programme.titre });
          }}
        />
      )}
      {attribution && (
        <AttributionClient
          coachId={coachId}
          clientId={clientId}
          source={{ programmeId: attribution.id }}
          nom={titreClient(attribution.titre)}
          onFermer={() => {
            setAttribution(undefined);
            setCree(undefined);
          }}
        />
      )}
    </Carte>
  );
}

function Criteres({ libelle, options, valeur, onChange }: { libelle: string; options: string[]; valeur: string; onChange: (v: string) => void }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[ts.doux, { fontSize: 13 }]}>{libelle}</Text>
      <Puces>
        {options.map((o) => (
          <Filtre key={o} libelle={o} actif={valeur === o} onPress={() => onChange(valeur === o ? '' : o)} />
        ))}
      </Puces>
    </View>
  );
}

function LigneProgramme({ p, onAttribuer }: { p: ModeleResume; onAttribuer: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Attribuer ${titreClient(p.titre)}`}
      onPress={onAttribuer}
      style={(e) => [
        { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 12, padding: 8 },
        ((e as { hovered?: boolean }).hovered || e.pressed) && { borderColor: 'rgba(195,24,30,0.4)' },
      ]}
    >
      <PhotoProgramme programme={p} hauteur={72} style={{ width: 88 }} />
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text numberOfLines={2} style={{ fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte }}>
          {titreClient(p.titre)}
        </Text>
        <Ligne style={{ gap: 4 }}>
          {p.niveau && <Puce libelle={p.niveau} />}
          {p.objectif && <Puce libelle={p.objectif} variante="accent" />}
          {!!p.seancesParSemaine && <Puce libelle={`${p.seancesParSemaine}×/sem.`} />}
          {!!p.dureeSemaines && <Puce libelle={`${p.dureeSemaines} sem.`} />}
        </Ligne>
        <Text style={[ts.doux, { fontSize: 13 }]}>
          {p.nbSeances} séance{p.nbSeances > 1 ? 's' : ''} · <Text style={{ color: couleurs.rouge, fontFamily: polices.texteMoyen }}>Attribuer</Text>
        </Text>
      </View>
    </Pressable>
  );
}
