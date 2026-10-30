import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { depot } from '@/data';
import { jourLocal } from '@/domain/crm';
import { formaterDate, lireDate } from '@/domain/programmes';
import { unRm } from '@/domain/entrainement';
import { erreursRecord, formaterNombre, formaterRecord, lireNombre, meilleuresChargesDesSeances, meilleursRecords, UNITES_RECORD } from '@/domain/suivi';
import type { RecordPerso, UniteRecord } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, Puce, Puces, SousTitre, Texte } from '../composants';
import { ChoixExercice } from '../programmes/choix-exercice';
import { couleurs, espace } from '../theme';
import { Courbe } from './courbe';

type Brouillon = {
  libelle: string;
  exerciceId?: string;
  unite: UniteRecord;
  valeur: string;
  repetitions: string;
  date: string;
  note: string;
  reference: boolean;
};
const vide = (): Brouillon => ({ libelle: '', unite: 'kg', valeur: '', repetitions: '1', date: formaterDate(jourLocal(new Date())), note: '', reference: false });

function Saisie({ clientId, onAjoute }: { clientId: string; onAjoute: () => void }) {
  const realisations = useCharger(() => depot.realisationsDuClient(clientId), clientId);
  const [b, setB] = useState<Brouillon>(vide);
  const [choix, setChoix] = useState(false);
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);
  const pistes = realisations.donnee ? meilleuresChargesDesSeances(realisations.donnee).slice(0, 6) : [];

  async function enregistrer() {
    const date = lireDate(b.date);
    const r: Partial<RecordPerso> = {
      id: nouvelId(),
      clientId,
      exerciceId: b.exerciceId,
      libelle: b.libelle.trim(),
      unite: b.unite,
      valeur: lireNombre(b.valeur),
      repetitions: b.unite === 'kg' ? lireNombre(b.repetitions) : undefined,
      date,
      note: b.note.trim() || undefined,
      reference: b.reference && b.unite === 'kg' && !!b.exerciceId,
    };
    const liste = erreursRecord(r);
    if (!date) liste.push('Date illisible : écris-la comme 20/10/2026.');
    setErreurs(liste);
    if (liste.length) return;
    setEnCours(true);
    try {
      await depot.ajouterRecord(r as RecordPerso);
      setB(vide());
      onAjoute();
    } catch (e) {
      setErreurs([e instanceof Error ? e.message : 'Enregistrement impossible']);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Carte>
      <SousTitre>Nouveau record</SousTitre>
      {pistes.length > 0 && (
        <View style={{ gap: espace(2) }}>
          <Texte doux style={{ fontSize: 14 }}>Tes meilleures charges en séance (touche pour préremplir) :</Texte>
          <Puces>
            {pistes.map((p) => (
              <Puce
                key={p.exerciceId}
                libelle={`${p.nom} · ${String(p.charge).replace('.', ',')} kg${p.repetitions ? ` × ${p.repetitions}` : ''}`}
                onPress={() =>
                  setB({ ...b, libelle: p.nom, unite: 'kg', valeur: String(p.charge), repetitions: String(p.repetitions ?? 1), date: formaterDate(p.date) })
                }
              />
            ))}
          </Puces>
        </View>
      )}
      <ChampTexte libelle="Exercice" valeur={b.libelle} onChange={(libelle) => setB({ ...b, libelle, exerciceId: undefined })} placeholder="Squat, traction, 5 km…" />
      {choix ? (
        <ChoixExercice
          titre="Choisir l’exercice"
          onFermer={() => setChoix(false)}
          onChoisir={(e) => {
            setB({ ...b, libelle: e.nom, exerciceId: e.id, unite: e.mesures.includes('charge') ? 'kg' : e.mesures.includes('repetitions') ? 'reps' : 's' });
            setChoix(false);
          }}
        />
      ) : (
        <Bouton variante="discret" libelle="Choisir dans la liste des exercices" onPress={() => setChoix(true)} />
      )}
      <Puces>
        {UNITES_RECORD.map((u) => (
          <Puce key={u.cle} libelle={u.libelle} actif={b.unite === u.cle} onPress={() => setB({ ...b, unite: u.cle })} />
        ))}
      </Puces>
      <View style={{ flexDirection: 'row', gap: espace(3) }}>
        <View style={{ flex: 1 }}>
          <ChampTexte libelle="Performance" type="nombre" valeur={b.valeur} onChange={(valeur) => setB({ ...b, valeur })} />
        </View>
        {b.unite === 'kg' && (
          <View style={{ flex: 1 }}>
            <ChampTexte libelle="Répétitions" type="nombre" valeur={b.repetitions} onChange={(repetitions) => setB({ ...b, repetitions })} />
          </View>
        )}
      </View>
      <ChampTexte libelle="Date" valeur={b.date} onChange={(date) => setB({ ...b, date })} />
      <ChampTexte libelle="Note (facultatif)" valeur={b.note} onChange={(note) => setB({ ...b, note })} />
      {b.unite === 'kg' && (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: b.reference, disabled: !b.exerciceId }}
          disabled={!b.exerciceId}
          onPress={() => setB({ ...b, reference: !b.reference })}
          style={{ flexDirection: 'row', gap: espace(2), alignItems: 'flex-start', opacity: b.exerciceId ? 1 : 0.6 }}
        >
          <Texte style={{ fontSize: 18 }}>{b.reference ? '☑' : '☐'}</Texte>
          <View style={{ flex: 1 }}>
            <Texte style={{ fontSize: 15 }}>Utiliser cette performance comme référence pour mes programmes</Texte>
            <Texte doux style={{ fontSize: 13 }}>
              {b.exerciceId
                ? 'Elle sert au calcul des charges en % du 1RM de cet exercice seulement.'
                : 'Choisis d’abord l’exercice dans la liste : une référence ne s’applique qu’à son mouvement.'}
            </Texte>
          </View>
        </Pressable>
      )}
      {erreurs.length > 0 && <Erreur message={erreurs.join('\n')} />}
      <Bouton libelle="Enregistrer le record" onPress={enregistrer} chargement={enCours} />
    </Carte>
  );
}

/** Records personnels (PR) : le meilleur par exercice et son historique. */
export function Records({ clientId, saisie = true }: { clientId: string; saisie?: boolean }) {
  const { donnee, erreur, recharger } = useCharger(() => depot.records(clientId), clientId);
  const [confirmer, setConfirmer] = useState<string>();
  const [erreurReference, setErreurReference] = useState<string>();
  async function choisirReference(id: string) {
    setErreurReference(undefined);
    try {
      await depot.definirReference(id);
      recharger();
    } catch (e) {
      setErreurReference(e instanceof Error ? e.message : 'Référence non enregistrée');
    }
  }
  return (
    <View style={{ gap: espace(4) }}>
      {saisie && <Saisie clientId={clientId} onAjoute={recharger} />}
      {erreur && <Erreur message={erreur} onReessayer={recharger} />}
      {erreurReference && <Erreur message={erreurReference} />}
      {!donnee && !erreur && <Chargement />}
      {donnee?.length === 0 && <Texte doux>Aucun record enregistré pour l’instant.</Texte>}
      {donnee &&
        meilleursRecords(donnee).map(({ meilleur, historique }) => {
          const charge = meilleur.unite === 'kg' && !!meilleur.exerciceId;
          const ref = charge ? donnee.find((x) => x.reference && x.exerciceId === meilleur.exerciceId) : undefined;
          return (
          <Carte key={meilleur.id}>
            <SousTitre>{meilleur.libelle}</SousTitre>
            <Texte style={{ fontSize: 18, fontWeight: '600' }}>
              {formaterRecord(meilleur)}
              <Texte doux style={{ fontSize: 14 }}>
                {'  '}le {formaterDate(meilleur.date)}
              </Texte>
            </Texte>
            {charge && (
              <Texte doux style={{ fontSize: 14 }}>
                {ref
                  ? `Référence programme : ${formaterNombre(unRm(ref.valeur, ref.repetitions ?? 1))} kg (${(ref.repetitions ?? 1) > 1 ? `estimée d’après ${formaterRecord(ref)}` : 'réalisée'} · ${formaterDate(ref.date)})`
                  : 'Aucune référence choisie : les programmes n’afficheront pas de charge calculée pour cet exercice.'}
              </Texte>
            )}
            {historique.length > 1 && (
              <Courbe
                points={[...historique].reverse().map((r) => ({ date: r.date, valeur: r.valeur }))}
                unite={meilleur.unite === 'reps' ? 'rép.' : meilleur.unite}
                libelle={meilleur.libelle}
              />
            )}
            {historique.map((r) => (
              <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espace(2), flexWrap: 'wrap' }}>
                <Texte doux style={{ fontSize: 14, flex: 1 }}>
                  {formaterDate(r.date)} · {formaterRecord(r)}
                  {r.reference ? ' · Référence programme' : ''}
                  {r.note ? ` · ${r.note}` : ''}
                </Texte>
                {r.unite === 'kg' && r.exerciceId && !r.reference && (
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => choisirReference(r.id)}>
                    <Texte style={{ fontSize: 13, color: couleurs.rouge }}>Utiliser comme référence</Texte>
                  </Pressable>
                )}
                {confirmer === r.id ? (
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={async () => {
                      await depot.supprimerRecord(r.id);
                      setConfirmer(undefined);
                      recharger();
                    }}
                  >
                    <Texte style={{ fontSize: 13, color: couleurs.rouge }}>Confirmer</Texte>
                  </Pressable>
                ) : (
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setConfirmer(r.id)}>
                    <Texte doux style={{ fontSize: 13 }}>Supprimer</Texte>
                  </Pressable>
                )}
              </View>
            ))}
          </Carte>
          );
        })}
    </View>
  );
}
