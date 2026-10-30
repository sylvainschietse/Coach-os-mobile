import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { depot } from '@/data';
import { alimentation } from '@/data/alimentation';
import { jourLocal } from '@/domain/crm';
import { formaterDate, lireDate } from '@/domain/programmes';
import { CHAMPS_MENSURATIONS, erreursMensuration, erreursTaille, evolution, formaterNombre, imc, lireNombre } from '@/domain/suivi';
import type { Mensuration } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, Puce, Puces, SousTitre, Texte } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { Courbe } from './courbe';

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

/**
 * Taille : rangée dans le profil (elle sert aussi aux besoins caloriques), pas à chaque mesure puisqu'elle ne bouge pas.
 * Avec la dernière pesée, elle donne l'IMC.
 */
function Taille({ clientId, saisie, poidsKg }: { clientId: string; saisie: boolean; poidsKg?: number }) {
  // Enveloppé : un profil absent (null) ne doit pas se confondre avec un chargement en cours.
  const { donnee, erreur: erreurChargement, recharger } = useCharger(() => alimentation.profil(clientId).then((p) => ({ p })), `taille-${clientId}`);
  const profil = donnee?.p;
  const [texte, setTexte] = useState<string>();
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);
  if (!donnee && !erreurChargement) return null;
  const taille = profil?.tailleCm;
  const valeurIMC = imc(poidsKg, taille);

  async function enregistrer() {
    const cm = lireNombre(texte ?? '');
    const liste = erreursTaille(cm);
    setErreur(liste.join('\n'));
    if (liste.length) return;
    setEnCours(true);
    try {
      await alimentation.enregistrerProfil({ ...(profil ?? { clientId, regimes: [] }), tailleCm: cm });
      setTexte(undefined);
      recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Carte>
      <SousTitre>Taille</SousTitre>
      {erreurChargement && <Erreur message={erreurChargement} />}
      <Texte style={{ fontSize: 15 }}>
        {taille ? `${formaterNombre(taille)} cm` : 'Pas encore renseignée.'}
        {valeurIMC !== undefined && (
          <Texte doux style={{ fontSize: 14 }}>
            {'  '}· IMC {formaterNombre(valeurIMC)} (avec la dernière pesée)
          </Texte>
        )}
      </Texte>
      {saisie && (
        <>
          <ChampTexte
            libelle={taille ? 'Corriger la taille (cm)' : 'Taille (cm)'}
            type="nombre"
            valeur={texte ?? ''}
            placeholder={taille ? String(taille) : '170'}
            onChange={setTexte}
          />
          {erreur !== '' && <Erreur message={erreur} />}
          <Bouton libelle="Enregistrer la taille" variante="discret" desactive={!texte?.trim()} onPress={enregistrer} chargement={enCours} />
        </>
      )}
    </Carte>
  );
}

function Ligne({ m, onSupprime }: { m: Mensuration; onSupprime: () => void }) {
  const [confirmer, setConfirmer] = useState(false);
  const valeurs = CHAMPS_MENSURATIONS.filter((c) => m[c.cle] !== undefined).map((c) => `${c.libelle} ${formaterNombre(m[c.cle] as number)} ${c.unite}`);
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: espace(2), gap: espace(1) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Texte style={{ fontWeight: '600' }}>{formaterDate(m.date)}</Texte>
        {!confirmer ? (
          <Pressable accessibilityRole="button" onPress={() => setConfirmer(true)} hitSlop={8}>
            <Texte doux style={{ fontSize: 13 }}>
              Supprimer
            </Texte>
          </Pressable>
        ) : (
          <View style={{ flexDirection: 'row', gap: espace(4) }}>
            <Pressable accessibilityRole="button" onPress={onSupprime} hitSlop={8}>
              <Texte style={{ fontSize: 13, color: couleurs.rouge }}>Confirmer</Texte>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setConfirmer(false)} hitSlop={8}>
              <Texte doux style={{ fontSize: 13 }}>
                Annuler
              </Texte>
            </Pressable>
          </View>
        )}
      </View>
      <Texte doux style={{ fontSize: 14 }}>
        {valeurs.join(' · ')}
      </Texte>
      {m.note && <Texte style={{ fontSize: 14 }}>« {m.note} »</Texte>}
    </View>
  );
}

type EvolutionChamp = { c: (typeof CHAMPS_MENSURATIONS)[number]; e: NonNullable<ReturnType<typeof evolution>> };

/** Une courbe à la fois : le client choisit la mesure, l'écart depuis la première mesure est en tête. */
function Evolution({ evolutions }: { evolutions: EvolutionChamp[] }) {
  const [cle, setCle] = useState(evolutions[0].c.cle);
  const { c, e } = evolutions.find((x) => x.c.cle === cle) ?? evolutions[0];
  return (
    <Carte>
      <SousTitre>Évolution</SousTitre>
      <Puces>
        {evolutions.map((x) => (
          <Puce key={x.c.cle} libelle={x.c.libelle} actif={x.c.cle === c.cle} onPress={() => setCle(x.c.cle)} />
        ))}
      </Puces>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: espace(2), flexWrap: 'wrap' }}>
        <Texte style={{ fontSize: 26, fontFamily: polices.texteGras }}>
          {formaterNombre(e.dernier.valeur)} {c.unite}
        </Texte>
        <Texte doux style={{ fontSize: 14 }}>
          {signe(e.ecart)} {c.unite} depuis le {formaterDate(e.premier.date)}
        </Texte>
      </View>
      <Courbe key={c.cle} points={e.points} unite={c.unite} libelle={c.libelle} />
    </Carte>
  );
}

/** Mensurations : saisie, évolution depuis la première mesure, historique. Le coach voit la même chose. */
export function Mensurations({ clientId, saisie = true }: { clientId: string; saisie?: boolean }) {
  const { donnee, erreur, recharger } = useCharger(() => depot.mensurations(clientId), clientId);
  const evolutions = donnee
    ? CHAMPS_MENSURATIONS.flatMap((c): EvolutionChamp[] => {
        const e = evolution(donnee, c.cle);
        return e && e.points.length > 1 ? [{ c, e }] : [];
      })
    : [];

  return (
    <View style={{ gap: espace(4) }}>
      <Taille clientId={clientId} saisie={saisie} poidsKg={donnee ? evolution(donnee, 'poidsKg')?.dernier.valeur : undefined} />
      {saisie && <Saisie clientId={clientId} onAjoute={recharger} />}
      {erreur && <Erreur message={erreur} />}
      {!donnee && !erreur && <Chargement />}
      {evolutions.length > 0 && <Evolution evolutions={evolutions} />}
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
