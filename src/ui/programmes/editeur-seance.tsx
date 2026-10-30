import { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { deplacer, erreursSeance, formaterDate, lireDate, nettoyerSeance, nouveauBloc, nouvelleLigne, resumeLigne } from '@/domain/programmes';
import type { Bloc, LignePrescription, SeanceModele } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';

import { Bouton, Carte, ChampNombre, ChampTexte, Erreur, Texte } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { ChoixExercice } from './choix-exercice';

function Nombre({ libelle, valeur, onChange }: { libelle: string; valeur?: number; onChange: (v?: number) => void }) {
  return <ChampNombre libelle={libelle} valeur={valeur} suggestion={undefined} onChange={onChange} valide={false} />;
}

function Lien({ libelle, onPress, danger, desactive }: { libelle: string; onPress: () => void; danger?: boolean; desactive?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={desactive} hitSlop={8} style={{ opacity: desactive ? 0.3 : 1 }}>
      <Texte style={{ fontSize: 14, color: danger ? couleurs.rouge : couleurs.texteDoux }}>{libelle}</Texte>
    </Pressable>
  );
}

function EditeurLigne({
  ligne,
  onChange,
  onMonter,
  onDescendre,
  onRetirer,
  premiere,
  derniere,
}: {
  ligne: LignePrescription;
  onChange: (l: LignePrescription) => void;
  onMonter: () => void;
  onDescendre: () => void;
  onRetirer: () => void;
  premiere: boolean;
  derniere: boolean;
}) {
  const [ouverte, setOuverte] = useState(false);
  const m = ligne.exercice.mesures;
  const maj = (patch: Partial<LignePrescription>) => onChange({ ...ligne, ...patch });
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espace(2), gap: espace(2) }}>
      <Pressable accessibilityRole="button" onPress={() => setOuverte(!ouverte)}>
        <Texte style={{ fontWeight: '600' }}>{ligne.exercice.nom}</Texte>
        <Texte doux style={{ fontSize: 14 }}>
          {resumeLigne(ligne)} {ouverte ? '' : ' · modifier'}
        </Texte>
      </Pressable>
      {ouverte && (
        <View style={{ gap: espace(2) }}>
          <View style={{ flexDirection: 'row', gap: espace(2), flexWrap: 'wrap' }}>
            <Nombre libelle="Séries" valeur={ligne.series} onChange={(v) => maj({ series: v ?? 0 })} />
            {m.includes('repetitions') && (
              <>
                <Nombre libelle="Reps min" valeur={ligne.repetitionsMin} onChange={(v) => maj({ repetitionsMin: v })} />
                <Nombre libelle="Reps max" valeur={ligne.repetitionsMax} onChange={(v) => maj({ repetitionsMax: v })} />
              </>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: espace(2), flexWrap: 'wrap' }}>
            {m.includes('charge') && <Nombre libelle="Charge (kg)" valeur={ligne.chargeIndicative} onChange={(v) => maj({ chargeIndicative: v })} />}
            {(m.includes('duree') || !m.includes('repetitions')) && (
              <Nombre libelle="Durée (s)" valeur={ligne.dureeS} onChange={(v) => maj({ dureeS: v })} />
            )}
            <Nombre libelle="Récup (s)" valeur={ligne.recuperationS} onChange={(v) => maj({ recuperationS: v })} />
            {m.includes('repetitions') && <Nombre libelle="RIR" valeur={ligne.rir} onChange={(v) => maj({ rir: v })} />}
          </View>
          {m.includes('repetitions') && (
            <ChampTexte libelle="Tempo" valeur={ligne.tempo ?? ''} onChange={(t) => maj({ tempo: t || undefined })} placeholder="3-0-1" />
          )}
          <ChampTexte
            libelle="Consignes pour le client"
            valeur={ligne.consignes ?? ''}
            onChange={(t) => maj({ consignes: t || undefined })}
            multiligne
          />
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: espace(5) }}>
        <Lien libelle="↑ Monter" onPress={onMonter} desactive={premiere} />
        <Lien libelle="↓ Descendre" onPress={onDescendre} desactive={derniere} />
        <Lien libelle="Retirer" onPress={onRetirer} danger />
      </View>
    </View>
  );
}

/**
 * Création et modification d'une séance : blocs, exercices du catalogue, séries, répétitions,
 * charge, durée, récupération, RIR, tempo et consignes.
 */
export function EditeurSeance<T extends SeanceModele>({
  initiale,
  coachId,
  avecDate = true,
  onEnregistrer,
  libelleEnregistrer = 'Enregistrer la séance',
}: {
  initiale: T;
  coachId: string;
  avecDate?: boolean;
  onEnregistrer: (s: T) => Promise<void>;
  libelleEnregistrer?: string;
}) {
  const [seance, setSeance] = useState<T>(initiale);
  const [date, setDate] = useState(formaterDate(initiale.datePrevue));
  const [choixPour, setChoixPour] = useState<string>();
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [enregistree, setEnregistree] = useState(false);

  const majBlocs = (f: (blocs: Bloc[]) => Bloc[]) => {
    setEnregistree(false);
    setSeance((s) => ({ ...s, blocs: f(s.blocs) }));
  };
  const majBloc = (id: string, f: (b: Bloc) => Bloc) => majBlocs((blocs) => blocs.map((b) => (b.id === id ? f(b) : b)));

  async function enregistrer() {
    const datePrevue = avecDate && date.trim() ? lireDate(date) : undefined;
    const aVerifier = { ...seance, datePrevue };
    const liste = erreursSeance(aVerifier);
    if (avecDate && date.trim() && !datePrevue) liste.push('Date illisible : écris-la comme 26/10.');
    setErreurs(liste);
    if (liste.length) return;
    setEnCours(true);
    try {
      await onEnregistrer(nettoyerSeance(aVerifier));
      setEnregistree(true);
    } catch (e) {
      setErreurs([e instanceof Error ? e.message : 'Enregistrement impossible']);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <View style={{ gap: espace(4) }}>
      <ChampTexte
        libelle="Titre de la séance"
        valeur={seance.titre}
        onChange={(titre) => {
          setEnregistree(false);
          setSeance({ ...seance, titre });
        }}
        placeholder="Haut du corps · Force"
      />
      {avecDate && <ChampTexte libelle="Date prévue (facultatif)" valeur={date} onChange={setDate} placeholder="26/10" />}
      <ChampTexte
        libelle="Consignes générales"
        valeur={seance.consignes ?? ''}
        onChange={(consignes) => setSeance({ ...seance, consignes: consignes || undefined })}
        multiligne
      />

      {seance.blocs.map((bloc, bi) => (
        <Carte key={bloc.id}>
          <TextInput
            accessibilityLabel="Nom du bloc"
            value={bloc.titre}
            onChangeText={(titre) => majBloc(bloc.id, (b) => ({ ...b, titre }))}
            style={{ fontFamily: polices.titre, fontSize: 24, color: couleurs.noir, paddingVertical: espace(1) }}
          />
          {bloc.minuteur && (
            <Texte doux style={{ fontSize: 13 }}>
              Circuit chronométré : {bloc.minuteur.travailS} s d’effort, {bloc.minuteur.reposS} s de repos, {bloc.minuteur.tours} tours.
            </Texte>
          )}
          {bloc.lignes.length === 0 && <Texte doux style={{ fontSize: 14 }}>Pas encore d’exercice dans ce bloc.</Texte>}
          {bloc.lignes.map((l, li) => (
            <EditeurLigne
              key={l.id}
              ligne={l}
              premiere={li === 0}
              derniere={li === bloc.lignes.length - 1}
              onChange={(nouvelle) => majBloc(bloc.id, (b) => ({ ...b, lignes: b.lignes.map((x) => (x.id === l.id ? nouvelle : x)) }))}
              onMonter={() => majBloc(bloc.id, (b) => ({ ...b, lignes: deplacer(b.lignes, li, -1) }))}
              onDescendre={() => majBloc(bloc.id, (b) => ({ ...b, lignes: deplacer(b.lignes, li, 1) }))}
              onRetirer={() => majBloc(bloc.id, (b) => ({ ...b, lignes: b.lignes.filter((x) => x.id !== l.id) }))}
            />
          ))}
          {choixPour === bloc.id ? (
            <ChoixExercice
              coachId={coachId}
              onFermer={() => setChoixPour(undefined)}
              onChoisir={(e) => {
                majBloc(bloc.id, (b) => ({ ...b, lignes: [...b.lignes, nouvelleLigne(e, nouvelId)] }));
                setChoixPour(undefined);
              }}
            />
          ) : (
            <Bouton variante="discret" libelle="+ Ajouter un exercice" onPress={() => setChoixPour(bloc.id)} />
          )}
          <View style={{ flexDirection: 'row', gap: espace(5) }}>
            <Lien libelle="↑ Bloc" onPress={() => majBlocs((b) => deplacer(b, bi, -1))} desactive={bi === 0} />
            <Lien libelle="↓ Bloc" onPress={() => majBlocs((b) => deplacer(b, bi, 1))} desactive={bi === seance.blocs.length - 1} />
            <Lien libelle="Supprimer le bloc" danger onPress={() => majBlocs((b) => b.filter((x) => x.id !== bloc.id))} />
          </View>
        </Carte>
      ))}
      <Bouton variante="discret" libelle="+ Ajouter un bloc" onPress={() => majBlocs((b) => [...b, nouveauBloc(`Bloc ${b.length + 1}`, nouvelId)])} />

      {erreurs.length > 0 && <Erreur message={erreurs.join('\n')} />}
      {enregistree && (
        <Carte style={{ borderColor: couleurs.vert }}>
          <Texte>Séance enregistrée.</Texte>
        </Carte>
      )}
      <Bouton libelle={libelleEnregistrer} onPress={enregistrer} chargement={enCours} />
    </View>
  );
}
