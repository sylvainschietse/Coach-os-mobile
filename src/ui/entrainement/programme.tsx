// AirtableProgramme.tsx d'origine (C10) : en-tête du programme, actions, badges, adaptation d'une référence publique,
// descriptif (répartition des séances, matériel, consignes) et « Séances type de la semaine ».
import { ArrowLeft, ChevronRight } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';

import { entrainement } from '@/data/entrainement';
import { codeModele, sourceEntrainement, titreClient } from '@/domain/entrainement';
import type { ElementCorbeille, ProgrammeDetail } from '@/domain/entrainement-etat';

import { Kicker, TitreDisplay } from '../coque';
import { Repliable } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { AttributionClient } from './attribution';
import { Action, CaseSelection, Etat, Ligne, Puce, TexteLong, ts, PhotoProgramme } from './commun';
import { SuppressionEntrainement } from './corbeille';
import { CreationEntrainement, type DemandeCreation } from './creation';
import { RepriseSeance } from './reprise';

export function DetailProgramme({
  coachId,
  id,
  onRetour,
  onOuvrirSeance,
}: {
  coachId: string;
  id: string;
  onRetour: () => void;
  onOuvrirSeance: (id: string) => void;
}) {
  const [donnee, setDonnee] = useState<ProgrammeDetail | null>(null);
  const [erreur, setErreur] = useState('');
  const [dialogue, setDialogue] = useState<DemandeCreation>();
  const [selection, setSelection] = useState(false);
  const [choisis, setChoisis] = useState<string[]>([]);
  const [suppression, setSuppression] = useState<ElementCorbeille[]>();
  const [message, setMessage] = useState('');
  const [reprise, setReprise] = useState(false);
  const [attribution, setAttribution] = useState(false);

  const charger = useCallback(
    () =>
      entrainement
        .programme(id)
        .then((d) => {
          setDonnee(d);
          setErreur('');
        })
        .catch((e) => setErreur(e instanceof Error ? e.message : 'Lecture impossible')),
    [id],
  );
  useEffect(() => {
    charger();
  }, [charger]);

  const retour = (
    <View style={{ alignSelf: 'flex-start', marginLeft: -8, marginBottom: 12 }}>
      <Action petit variante="fantome" icone={ArrowLeft} libelle="Retour" onPress={onRetour} />
    </View>
  );
  if (erreur && !donnee)
    return (
      <View>
        {retour}
        <View accessibilityRole="alert" style={[ts.carte, { borderStyle: 'dashed', alignItems: 'center' }]}>
          <Text style={ts.titre}>Programme indisponible</Text>
          <Text style={ts.texte}>{erreur}</Text>
          <Action libelle="Réessayer" onPress={charger} />
        </View>
      </View>
    );
  if (!donnee)
    return (
      <View>
        {retour}
        <View style={{ height: 192, borderRadius: 12, backgroundColor: couleurs.discret }} />
      </View>
    );

  const p = donnee.programme;
  const source = sourceEntrainement(p.titre);
  const descriptif =
    [
      p.objectif ? `Objectif : ${p.objectif}.` : '',
      p.niveau ? `Niveau : ${p.niveau}.` : '',
      p.seancesParSemaine ? `${p.seancesParSemaine} séance${p.seancesParSemaine > 1 ? 's' : ''} par semaine.` : '',
      p.dureeSemaines ? `Durée : ${p.dureeSemaines} semaines.` : '',
    ]
      .filter(Boolean)
      .join(' ') || 'Complétez les critères depuis Modifier pour préciser le profil et l’objectif.';
  const modifier = () =>
    setDialogue({
      action: 'editProgramme',
      id,
      initial: {
        nom: p.titre,
        niveau: p.niveau,
        objectif: p.objectif,
        frequence: p.seancesParSemaine,
        duree: p.dureeSemaines,
        materiel: p.materiel,
        consignes: p.consignes,
      },
    });

  return (
    <View>
      {retour}
      <Kicker>Programme · espace coach</Kicker>
      <TitreDisplay taille={30}>{titreClient(p.titre)}</TitreDisplay>
      {codeModele(p.titre) && <Text style={[ts.doux, { fontSize: 12 }]}>Réf. {codeModele(p.titre)}</Text>}
      <PhotoProgramme programme={p} hauteur={320} style={{ marginTop: 12, maxWidth: 768 }} />
      <Ligne style={{ marginTop: 12, alignItems: 'flex-start' }}>
        <Action libelle="Créer une séance" onPress={() => setDialogue({ action: 'seance', programmeId: id })} />
        <Action libelle="Reprendre une séance existante" variante="contour" onPress={() => setReprise(true)} />
        <Action libelle="Modifier" variante="contour" onPress={modifier} />
        {!p.clientId && <Action libelle="Attribuer à un client" variante="contour" onPress={() => setAttribution(true)} />}
        <Repliable resume="Autres actions" style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 10, paddingHorizontal: 10, backgroundColor: couleurs.carte }}>
          <Ligne style={{ paddingBottom: 10 }}>
            <Action variante="contour" libelle="Dupliquer le programme" onPress={() => setDialogue({ action: 'copyProgramme', id, initial: { nom: `${p.titre} · Copie` } })} />
            <Action variante="danger" libelle="Supprimer le programme" onPress={() => setSuppression([{ kind: 'programme', id, nom: p.titre }])} />
          </Ligne>
        </Repliable>
      </Ligne>
      <View style={{ marginTop: 8 }}>
        <Etat message={message} />
      </View>

      <Ligne style={{ marginTop: 12, gap: 6 }}>
        {p.objectif && <Puce libelle={p.objectif} variante="accent" />}
        {p.niveau && <Puce libelle={p.niveau} />}
        {!!p.seancesParSemaine && <Puce libelle={`${p.seancesParSemaine} séances / semaine`} />}
        {!!p.dureeSemaines && <Puce libelle={`${p.dureeSemaines} semaines`} />}
        {p.environnement && <Puce libelle={p.environnement} />}
        {p.statut && <Puce libelle={p.statut} />}
        {(p.priorites ?? []).map((x) => (
          <Puce key={x} libelle={x} variante="secondaire" />
        ))}
      </Ligne>

      {source && (
        <View style={{ marginTop: 16, maxWidth: 768, borderWidth: 1, borderColor: 'rgba(195,24,30,0.2)', backgroundColor: 'rgba(195,24,30,0.05)', borderRadius: 12, padding: 16, gap: 8 }}>
          <Text style={[ts.texte, { fontFamily: polices.texteGras }]}>Adaptation Coach OS · {source.author}</Text>
          <Text style={[ts.texte, { color: couleurs.texteDoux }]}>{source.changes}</Text>
          <Text accessibilityRole="link" onPress={() => Linking.openURL(source.url)} style={[ts.texte, { color: couleurs.rouge, fontFamily: polices.texteMoyen, textDecorationLine: 'underline' }]}>
            Voir la référence publique
          </Text>
          <Text style={ts.doux}>Séries, cycles et consignes adaptés par Coach OS. Modèle indépendant, sans affiliation au créateur.</Text>
        </View>
      )}

      <View accessibilityLabel="Descriptif du programme" style={[ts.carte, { marginTop: 20, maxWidth: 768, gap: 8 }]}>
        <Text style={{ fontFamily: polices.titre, fontSize: 20, letterSpacing: 0.7, color: couleurs.texte }}>Descriptif du programme</Text>
        <Text style={[ts.texte, { lineHeight: 22 }]}>{descriptif}</Text>
        {!!p.priorites?.length && (
          <Text style={ts.texte}>
            <Text style={{ fontFamily: polices.texteMoyen }}>Priorités musculaires : </Text>
            {p.priorites.join(', ')}.
          </Text>
        )}
        {donnee.seances.length > 0 && (
          <View style={{ marginTop: 8, gap: 8 }}>
            <Text style={[ts.texte, { fontFamily: polices.texteMoyen }]}>Répartition des séances</Text>
            {donnee.seances.map((s, i) => (
              <View key={s.id}>
                <Text style={[ts.texte, { fontFamily: polices.texteMoyen }]}>
                  {s.ordre || i + 1} · {titreClient(s.titre)}
                </Text>
                {s.objectif && <Text style={[ts.texte, { color: couleurs.texteDoux }]}>{s.objectif}</Text>}
              </View>
            ))}
          </View>
        )}
        {p.materiel && (
          <Text style={[ts.texte, { marginTop: 4 }]}>
            <Text style={{ fontFamily: polices.texteMoyen }}>Matériel : </Text>
            {p.materiel}
          </Text>
        )}
        <View style={{ marginTop: 8 }}>
          <TexteLong texte={p.consignes} libelle="Déroulement et consignes" />
        </View>
        {!p.consignes && <Text style={[ts.texte, { color: couleurs.texteDoux }]}>Ajoutez le déroulement, la progression et les adaptations depuis Modifier → Descriptif et consignes.</Text>}
        <View style={{ alignSelf: 'flex-start', marginTop: 8 }}>
          <Action petit variante="contour" libelle="Modifier le descriptif" onPress={modifier} />
        </View>
      </View>
      <View style={{ marginTop: 8, maxWidth: 672 }}>
        <TexteLong texte={p.contraintes} libelle="Contraintes" style={{ color: couleurs.texteDoux }} />
      </View>

      <Text style={[ts.titreSection, { marginTop: 32 }]}>Séances type de la semaine</Text>
      <Ligne style={{ marginTop: 12 }}>
        <Action
          petit
          variante="contour"
          libelle={selection ? 'Fin de sélection' : 'Sélectionner des séances'}
          onPress={() => {
            setSelection(!selection);
            setChoisis([]);
          }}
        />
        {selection && (
          <Action
            petit
            variante="danger"
            libelle={`Supprimer (${choisis.length})`}
            desactive={!choisis.length}
            onPress={() => setSuppression(donnee.seances.filter((s) => choisis.includes(s.id)).map((s) => ({ kind: 'seance', id: s.id, nom: s.titre })))}
          />
        )}
      </Ligne>
      <View style={{ marginTop: 12, borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 12, overflow: 'hidden', backgroundColor: couleurs.carte }}>
        {donnee.seances.length === 0 && <Text style={[ts.texte, { padding: 20, color: couleurs.texteDoux }]}>Aucune séance liée.</Text>}
        {donnee.seances.map((s, i) => (
          <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', borderTopWidth: i ? 1 : 0, borderTopColor: couleurs.bordure }}>
            {selection && (
              <View style={{ marginLeft: 6 }}>
                <CaseSelection
                  nom={`Sélectionner ${s.titre}`}
                  valeur={choisis.includes(s.id)}
                  desactive={!choisis.includes(s.id) && choisis.length >= 50}
                  onChange={(v) => setChoisis((c) => (v ? [...c, s.id] : c.filter((x) => x !== s.id)))}
                />
              </View>
            )}
            <Pressable
              accessibilityRole="button"
              onPress={() => onOuvrirSeance(s.id)}
              style={(e) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 16, padding: 16 }, ((e as { hovered?: boolean }).hovered || e.pressed) && { backgroundColor: 'rgba(237,239,242,0.6)' }]}
            >
              <View style={ts.pastilleJour}>
                <Text style={ts.pastilleJourTexte}>J{s.ordre || '?'}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[ts.texte, { fontFamily: polices.texteMoyen }]}>{titreClient(s.titre)}</Text>
                <Text style={ts.doux}>{[s.dominante, s.dureeMin ? `${s.dureeMin} min` : '', `${s.nbExercices} exercices`].filter(Boolean).join(' · ')}</Text>
              </View>
              <ChevronRight size={20} color={couleurs.texteDoux} />
            </Pressable>
          </View>
        ))}
      </View>

      {suppression && (
        <SuppressionEntrainement
          items={suppression}
          onFermer={() => setSuppression(undefined)}
          onSupprime={() => {
            if (suppression.some((x) => x.kind === 'programme')) onRetour();
            else {
              setMessage('Sélection déplacée dans la corbeille.');
              setChoisis([]);
              setSelection(false);
              charger();
            }
          }}
        />
      )}
      {attribution && <AttributionClient coachId={coachId} source={{ programmeId: id }} nom={titreClient(p.titre)} onFermer={() => setAttribution(false)} />}
      {reprise && (
        <RepriseSeance
          coachId={coachId}
          programmeId={id}
          onFermer={() => setReprise(false)}
          onReprise={() => {
            setMessage('Séance copiée dans ce programme. Vous pouvez la modifier sans toucher à l’originale.');
            charger();
          }}
        />
      )}
      {dialogue && (
        <CreationEntrainement
          coachId={coachId}
          {...dialogue}
          onFermer={() => setDialogue(undefined)}
          onEnregistre={(r) => {
            if (dialogue.action === 'seance') onOuvrirSeance(r.id);
            else if (dialogue.action === 'copyProgramme') onRetour();
            charger();
          }}
        />
      )}
    </View>
  );
}
