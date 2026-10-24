import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { depot } from '@/data';
import { jourLocal } from '@/domain/crm';
import { formaterDate, lireDate } from '@/domain/programmes';
import { erreursRecord, formaterRecord, lireNombre, meilleuresChargesDesSeances, meilleursRecords, UNITES_RECORD } from '@/domain/suivi';
import type { RecordPerso, UniteRecord } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, Puce, Puces, SousTitre, Texte } from '../composants';
import { ChoixExercice } from '../programmes/choix-exercice';
import { couleurs, espace } from '../theme';

type Brouillon = { libelle: string; exerciceId?: string; unite: UniteRecord; valeur: string; repetitions: string; date: string; note: string };
const vide = (): Brouillon => ({ libelle: '', unite: 'kg', valeur: '', repetitions: '1', date: formaterDate(jourLocal(new Date())), note: '' });

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
      {erreurs.length > 0 && <Erreur message={erreurs.join('\n')} />}
      <Bouton libelle="Enregistrer le record" onPress={enregistrer} chargement={enCours} />
    </Carte>
  );
}

/** Records personnels (PR) : le meilleur par exercice et son historique. */
export function Records({ clientId, saisie = true }: { clientId: string; saisie?: boolean }) {
  const { donnee, erreur, recharger } = useCharger(() => depot.records(clientId), clientId);
  const [confirmer, setConfirmer] = useState<string>();
  return (
    <View style={{ gap: espace(4) }}>
      {saisie && <Saisie clientId={clientId} onAjoute={recharger} />}
      {erreur && <Erreur message={erreur} />}
      {!donnee && !erreur && <Chargement />}
      {donnee?.length === 0 && <Texte doux>Aucun record enregistré pour l’instant.</Texte>}
      {donnee &&
        meilleursRecords(donnee).map(({ meilleur, historique }) => (
          <Carte key={meilleur.id}>
            <SousTitre>{meilleur.libelle}</SousTitre>
            <Texte style={{ fontSize: 18, fontWeight: '600' }}>
              {formaterRecord(meilleur)}
              <Texte doux style={{ fontSize: 14 }}>
                {'  '}le {formaterDate(meilleur.date)}
              </Texte>
            </Texte>
            {historique.map((r) => (
              <View key={r.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espace(2) }}>
                <Texte doux style={{ fontSize: 14, flex: 1 }}>
                  {formaterDate(r.date)} · {formaterRecord(r)}
                  {r.note ? ` · ${r.note}` : ''}
                </Texte>
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
        ))}
    </View>
  );
}
