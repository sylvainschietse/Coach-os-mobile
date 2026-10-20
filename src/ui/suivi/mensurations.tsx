import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { depot } from '@/data';
import { jourLocal } from '@/domain/crm';
import { formaterDate, lireDate } from '@/domain/programmes';
import { CHAMPS_MENSURATIONS, erreursMensuration, evolution, formaterNombre, lireNombre } from '@/domain/suivi';
import type { Mensuration } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, SousTitre, Texte } from '../composants';
import { couleurs, espace } from '../theme';

const signe = (n: number) => (n > 0 ? `+${formaterNombre(n)}` : formaterNombre(n));

function Saisie({ clientId, onAjoute }: { clientId: string; onAjoute: () => void }) {
  const [date, setDate] = useState(formaterDate(jourLocal(new Date())));
  const [valeurs, setValeurs] = useState<Record<string, string>>({});
  const [note, setNote] = useState('');
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);

  async function enregistrer() {
    const jour = lireDate(date);
    const m: Mensuration = { id: nouvelId(), clientId, date: jour ?? '', note: note.trim() || undefined };
    for (const c of CHAMPS_MENSURATIONS) m[c.cle] = lireNombre(valeurs[c.cle] ?? '');
    const liste = erreursMensuration(m);
    if (!jour) liste.unshift('Date illisible : écris-la comme 20/10/2026.');
    setErreurs(liste);
    if (liste.length) return;
    setEnCours(true);
    try {
      await depot.ajouterMensuration(m);
      setValeurs({});
      setNote('');
      onAjoute();
    } catch (e) {
      setErreurs([e instanceof Error ? e.message : 'Enregistrement impossible']);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Carte>
      <SousTitre>Nouvelle mesure</SousTitre>
      <Texte doux style={{ fontSize: 14 }}>
        Remplis seulement ce que tu as mesuré. Idéalement le matin, à jeun, toujours dans les mêmes conditions.
      </Texte>
      <ChampTexte libelle="Date" valeur={date} onChange={setDate} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(3) }}>
        {CHAMPS_MENSURATIONS.map((c) => (
          <View key={c.cle} style={{ flexBasis: '46%', flexGrow: 1 }}>
            <ChampTexte
              libelle={`${c.libelle} (${c.unite})`}
              type="nombre"
              valeur={valeurs[c.cle] ?? ''}
              onChange={(t) => setValeurs({ ...valeurs, [c.cle]: t })}
            />
          </View>
        ))}
      </View>
      <ChampTexte libelle="Note (facultatif)" valeur={note} onChange={setNote} />
      {erreurs.length > 0 && <Erreur message={erreurs.join('\n')} />}
      <Bouton libelle="Enregistrer" onPress={enregistrer} chargement={enCours} />
    </Carte>
  );
}

function Ligne({ m, onSupprime }: { m: Mensuration; onSupprime: () => void }) {
  const [confirmer, setConfirmer] = useState(false);
  const valeurs = CHAMPS_MENSURATIONS.filter((c) => m[c.cle] !== undefined).map(
    (c) => `${c.libelle} ${formaterNombre(m[c.cle] as number)} ${c.unite}`,
  );
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espace(2), gap: espace(1) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Texte style={{ fontWeight: '600' }}>{formaterDate(m.date)}</Texte>
        {!confirmer ? (
          <Pressable accessibilityRole="button" onPress={() => setConfirmer(true)} hitSlop={8}>
            <Texte doux style={{ fontSize: 13 }}>Supprimer</Texte>
          </Pressable>
        ) : (
          <View style={{ flexDirection: 'row', gap: espace(4) }}>
            <Pressable accessibilityRole="button" onPress={onSupprime} hitSlop={8}>
              <Texte style={{ fontSize: 13, color: couleurs.rouge }}>Confirmer</Texte>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setConfirmer(false)} hitSlop={8}>
              <Texte doux style={{ fontSize: 13 }}>Annuler</Texte>
            </Pressable>
          </View>
        )}
      </View>
      <Texte doux style={{ fontSize: 14 }}>{valeurs.join(' · ')}</Texte>
      {m.note && <Texte style={{ fontSize: 14 }}>« {m.note} »</Texte>}
    </View>
  );
}

/** Mensurations : saisie, évolution depuis la première mesure, historique. Le coach voit la même chose. */
export function Mensurations({ clientId, saisie = true }: { clientId: string; saisie?: boolean }) {
  const { donnee, erreur, recharger } = useCharger(() => depot.mensurations(clientId), clientId);
  const evolutions = donnee
    ? CHAMPS_MENSURATIONS.map((c) => ({ c, e: evolution(donnee, c.cle) })).filter((x) => x.e && x.e.points.length > 1)
    : [];

  return (
    <View style={{ gap: espace(4) }}>
      {saisie && <Saisie clientId={clientId} onAjoute={recharger} />}
      {erreur && <Erreur message={erreur} />}
      {!donnee && !erreur && <Chargement />}
      {evolutions.length > 0 && (
        <Carte>
          <SousTitre>Évolution</SousTitre>
          {evolutions.map(({ c, e }) => (
            <Texte key={c.cle} style={{ fontSize: 15 }}>
              {c.libelle} : {formaterNombre(e!.premier.valeur)} → {formaterNombre(e!.dernier.valeur)} {c.unite}
              <Texte doux style={{ fontSize: 14 }}>
                {'  '}({signe(e!.ecart)} {c.unite} depuis le {formaterDate(e!.premier.date)})
              </Texte>
            </Texte>
          ))}
        </Carte>
      )}
      {donnee && donnee.length === 0 && <Texte doux>Aucune mesure enregistrée pour l’instant.</Texte>}
      {donnee && donnee.length > 0 && (
        <Carte>
          <SousTitre>Historique</SousTitre>
          {donnee.map((m) => (
            <Ligne
              key={m.id}
              m={m}
              onSupprime={async () => {
                await depot.supprimerMensuration(m.id);
                recharger();
              }}
            />
          ))}
        </Carte>
      )}
    </View>
  );
}
