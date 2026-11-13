// Bilan postural dans un test client : vues à photographier ou filmer, repères à toucher, puis constats chiffrés,
// déséquilibres probables et exercices, avec la comparaison au bilan précédent.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  AVERTISSEMENT,
  constats,
  pistes,
  VUES,
  vueComplete,
  vuesCompletes,
  type BilanPostural,
  type DefinitionVue,
  type Niveau,
  type SaisieVue,
} from '@/domain/bilan-postural';

import { Bouton } from '../composants';
import { ChoixMultiple, Libelle, Modale } from '../crm/dossier';
import { obtenirMedia, PointeurReperes } from '../pointeur-reperes';
import { couleurs, espace, polices } from '../theme';

const COULEUR: Record<Niveau, { fond: string; texte: string; libelle: string }> = {
  normal: { fond: couleurs.vertClair, texte: couleurs.vert, libelle: 'Dans la norme' },
  leger: { fond: couleurs.orangeClair, texte: couleurs.orange, libelle: 'Léger' },
  marque: { fond: couleurs.rougeClair, texte: couleurs.rougeTexte, libelle: 'Marqué' },
};

export function BilanPosturalSection({
  bilan,
  avant,
  dateAvant,
  onChange,
}: {
  bilan: BilanPostural | undefined;
  /** Bilan postural du test précédent, pour l'écart. */
  avant?: BilanPostural;
  dateAvant?: string;
  onChange: (b: BilanPostural) => void;
}) {
  const [vue, setVue] = useState<DefinitionVue>();
  const liste = constats(bilan);
  const listeAvant = new Map(constats(avant).map((c) => [c.id, c]));
  const pistesBilan = pistes(bilan);
  return (
    <View style={{ gap: espace(3) }}>
      <Libelle>Bilan postural</Libelle>
      <Text style={styles.aide}>
        {`${vuesCompletes(bilan)} vue${vuesCompletes(bilan) > 1 ? 's' : ''} sur ${VUES.length}. Fais celles qui t’intéressent : chaque vue complète donne ses résultats.`}
      </Text>
      {VUES.map((v) => {
        const s = bilan?.vues[v.id];
        const fait = vueComplete(v, s);
        return (
          <Pressable key={v.id} accessibilityRole="button" onPress={() => setVue(v)} style={[styles.vue, fait && styles.vueFaite]}>
            <Text style={styles.vueTitre}>{`${v.media === 'photo' ? '📷' : '🎥'}  ${v.titre}`}</Text>
            <Text style={styles.vueEtat}>{fait ? 'Fait · toucher pour refaire' : 'À faire'}</Text>
          </Pressable>
        );
      })}

      {liste.length > 0 && (
        <View style={{ gap: espace(2), marginTop: espace(2) }}>
          <Libelle>Résultats</Libelle>
          {liste.map((c) => {
            const a = listeAvant.get(c.id);
            const couleur = COULEUR[c.niveau];
            return (
              <View key={c.id} style={[styles.constat, { backgroundColor: couleur.fond }]}>
                <View style={styles.constatLigne}>
                  <Text style={styles.constatTitre}>{c.titre}</Text>
                  <Text style={[styles.constatValeur, { color: couleur.texte }]}>{`${c.valeur}°`}</Text>
                </View>
                <Text style={styles.constatTexte}>{`${c.texte} Repère : ${c.repere}.`}</Text>
                {a && <Text style={styles.avant}>{`Avant${dateAvant ? ` (${dateAvant})` : ''} : ${a.valeur}° · écart ${c.valeur - a.valeur > 0 ? '+' : ''}${Math.round((c.valeur - a.valeur) * 10) / 10}°`}</Text>}
              </View>
            );
          })}
        </View>
      )}

      {pistesBilan.length > 0 && (
        <View style={{ gap: espace(2), marginTop: espace(2) }}>
          <Libelle>Déséquilibres probables et exercices</Libelle>
          {pistesBilan.map((p) => (
            <View key={p.titre} style={styles.piste}>
              <Text style={styles.pisteTitre}>{p.titre}</Text>
              {p.raccourcis.length > 0 && <Text style={styles.pisteTexte}>{`Souvent raides : ${p.raccourcis.join(', ')}.`}</Text>}
              <Text style={styles.pisteTexte}>{`Souvent faibles : ${p.faibles.join(', ')}.`}</Text>
              <Text style={styles.pisteTexte}>{`Exercices : ${p.exercices.join(' · ')}.`}</Text>
              {p.prudence && <Text style={[styles.pisteTexte, { color: couleurs.rougeTexte }]}>{p.prudence}</Text>}
            </View>
          ))}
        </View>
      )}
      {liste.length > 0 && <Text style={styles.aide}>{AVERTISSEMENT}</Text>}

      {vue && (
        <VueModale
          vue={vue}
          saisie={bilan?.vues[vue.id]}
          onFermer={() => setVue(undefined)}
          onValider={(s) => {
            onChange({ vues: { ...(bilan?.vues ?? {}), [vue.id]: s } });
            setVue(undefined);
          }}
        />
      )}
    </View>
  );
}

function VueModale({ vue, saisie, onFermer, onValider }: { vue: DefinitionVue; saisie?: SaisieVue; onFermer: () => void; onValider: (s: SaisieVue) => void }) {
  const [uri, setUri] = useState<string | null>(null);
  const [points, setPoints] = useState<SaisieVue['points']>({});
  const [observations, setObservations] = useState<string[]>(saisie?.observations ?? []);
  const [erreur, setErreur] = useState<string>();
  const complet = vue.reperes.every((r) => points[r.cle]);
  const choisir = async (source: 'camera' | 'galerie') => {
    setErreur(undefined);
    try {
      const u = await obtenirMedia(vue.media, source);
      if (u) {
        setUri(u);
        setPoints({});
      }
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Fichier impossible à ouvrir.');
    }
  };
  return (
    <Modale titre={vue.titre} onFermer={onFermer}>
      <View style={{ gap: espace(3) }}>
        <Text style={styles.consigne}>{vue.consigne}</Text>
        {!uri ? (
          <View style={{ gap: espace(2) }}>
            <Bouton libelle={vue.media === 'photo' ? 'Prendre la photo' : 'Filmer'} onPress={() => choisir('camera')} />
            <Bouton variante="discret" libelle={vue.media === 'photo' ? 'Choisir une photo du téléphone' : 'Choisir une vidéo du téléphone'} onPress={() => choisir('galerie')} />
            {saisie && <Text style={styles.aide}>Cette vue est déjà faite : une nouvelle photo ou vidéo remplacera ses repères.</Text>}
            {!!erreur && <Text style={styles.erreur}>{erreur}</Text>}
          </View>
        ) : (
          <>
            <PointeurReperes media={vue.media} uri={uri} reperes={vue.reperes} points={points} onChange={setPoints} />
            {vue.observations && <ChoixMultiple libelle="Ce que tu observes" choix={vue.observations} valeurs={observations} onChange={setObservations} />}
            <Bouton libelle={complet ? 'Valider cette vue' : `Place les ${vue.reperes.length} repères`} desactive={!complet} onPress={() => onValider({ points, observations })} />
            <Bouton variante="discret" libelle="Autre photo ou vidéo" onPress={() => setUri(null)} />
          </>
        )}
      </View>
    </Modale>
  );
}

const styles = StyleSheet.create({
  aide: { fontFamily: polices.texte, fontSize: 12, lineHeight: 18, color: couleurs.texteDoux },
  consigne: { fontFamily: polices.texte, fontSize: 13, lineHeight: 19, color: couleurs.texte },
  erreur: { fontFamily: polices.texte, fontSize: 13, color: couleurs.rouge },
  vue: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espace(2), minHeight: 48, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.carte },
  vueFaite: { backgroundColor: couleurs.vertClair, borderColor: couleurs.vertClair },
  vueTitre: { fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texte, flexShrink: 1 },
  vueEtat: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
  constat: { borderRadius: 10, padding: 12, gap: 4 },
  constatLigne: { flexDirection: 'row', justifyContent: 'space-between', gap: espace(2) },
  constatTitre: { fontFamily: polices.texteGras, fontSize: 14, color: couleurs.texte, flexShrink: 1 },
  constatValeur: { fontFamily: polices.texteGras, fontSize: 16 },
  constatTexte: { fontFamily: polices.texte, fontSize: 13, lineHeight: 18, color: couleurs.texte },
  avant: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
  piste: { borderRadius: 10, padding: 12, gap: 4, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.carte },
  pisteTitre: { fontFamily: polices.texteGras, fontSize: 14, color: couleurs.texte },
  pisteTexte: { fontFamily: polices.texte, fontSize: 13, lineHeight: 19, color: couleurs.texte },
});
