// Bilan postural dans un test client : vues à photographier ou filmer, repères à toucher, puis l'analyse
// (profil de mouvement, priorités, droite / gauche, mesures expliquées, morphologie, muscles, plan, synthèse client).
// La photo ou la vidéo est gardée : on la revoit avec les repères et les angles dessinés dessus.
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { mediasBilan } from '@/data/medias-bilan';
import type { FichierMedia } from '@/data/videos-mouvement';
import { ancre, TRACES } from '@/domain/analyse-mouvement';
import { constats, VUES, vueComplete, vuesCompletes, type BilanPostural, type DefinitionVue, type MediaVue, type SaisieVue, type VueId } from '@/domain/bilan-postural';
import { typeVideo } from '@/domain/videos-mouvement';
import { messageErreur } from '@/lib/useCharger';

import { Bouton } from '../composants';
import { ChoixMultiple, Libelle, Modale } from '../crm/dossier';
import { Camera, choisirDansGalerie, lireLocal } from '../entrainement/videos-mouvement';
import { ApercuAnnote, obtenirMedia, PointeurReperes, type CadreReperes } from '../pointeur-reperes';
import { couleurs, espace, polices } from '../theme';
import { AnalyseBilan, COULEUR_NIVEAU } from './analyse-bilan';
import { etatA11y } from '@/lib/accessibilite';

export function BilanPosturalSection({
  bilan,
  avant,
  dateAvant,
  clientId,
  prenom,
  onChange,
}: {
  bilan: BilanPostural | undefined;
  /** Bilan postural du test précédent, pour l'écart. */
  avant?: BilanPostural;
  dateAvant?: string;
  clientId: string;
  prenom?: string;
  onChange: (b: BilanPostural) => void;
}) {
  const [vue, setVue] = useState<DefinitionVue>();
  const [revoir, setRevoir] = useState<VueId>();
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
          <View key={v.id} style={[styles.vue, fait && styles.vueFaite]}>
            <Pressable accessibilityRole="button" onPress={() => setVue(v)} style={styles.vueBouton}>
              <Text style={styles.vueTitre}>{`${v.media === 'photo' ? '📷' : '🎥'}  ${v.titre}`}</Text>
              <Text style={styles.vueEtat}>{fait ? 'Fait · toucher pour refaire' : 'À faire'}</Text>
            </Pressable>
            {fait && s?.media && (
              <Pressable accessibilityRole="button" accessibilityLabel={`Revoir : ${v.titre}`} onPress={() => setRevoir(v.id)} style={styles.revoir}>
                <Text style={styles.revoirTexte}>{v.media === 'video' ? '▶ Revoir' : 'Revoir'}</Text>
              </Pressable>
            )}
          </View>
        );
      })}

      <AnalyseBilan bilan={bilan} avant={avant} dateAvant={dateAvant} prenom={prenom} onRevoir={setRevoir} />

      {vue && (
        <VueModale
          vue={vue}
          clientId={clientId}
          saisie={bilan?.vues[vue.id]}
          onFermer={() => setVue(undefined)}
          onValider={(s) => {
            const ancien = bilan?.vues[vue.id]?.media?.chemin;
            if (ancien && ancien !== s.media?.chemin) void mediasBilan.retirer(ancien);
            onChange({ vues: { ...(bilan?.vues ?? {}), [vue.id]: s } });
            setVue(undefined);
          }}
        />
      )}
      {revoir && bilan && <RevoirModale bilan={bilan} vue={revoir} onChangerVue={setRevoir} onFermer={() => setRevoir(undefined)} />}
    </View>
  );
}

// ---------- Faire une vue ----------

function VueModale({
  vue,
  clientId,
  saisie,
  onFermer,
  onValider,
}: {
  vue: DefinitionVue;
  clientId: string;
  saisie?: SaisieVue;
  onFermer: () => void;
  onValider: (s: SaisieVue) => void;
}) {
  const [fichier, setFichier] = useState<FichierMedia | null>(null);
  const [camera, setCamera] = useState(false);
  const [points, setPoints] = useState<SaisieVue['points']>({});
  const [cadre, setCadre] = useState<CadreReperes>();
  const [observations, setObservations] = useState<string[]>(saisie?.observations ?? []);
  const [erreur, setErreur] = useState<string>();
  const [envoi, setEnvoi] = useState(false);
  const [refusEnvoi, setRefusEnvoi] = useState<string>();
  const complet = vue.reperes.every((r) => r.optionnel || points[r.cle]);
  const nouveau = (f: FichierMedia | null) => {
    if (!f) return;
    setFichier(f);
    setPoints({});
    setRefusEnvoi(undefined);
  };
  const choisir = async (source: 'camera' | 'galerie') => {
    setErreur(undefined);
    try {
      if (vue.media === 'video') {
        // Filmé dans l'appli : 720p compressé, la vidéo reste sous 25 Mo et peut être gardée.
        if (source === 'camera' && Platform.OS !== 'web') return setCamera(true);
        return nouveau(await choisirDansGalerie());
      }
      const uri = await obtenirMedia('photo', source);
      if (uri) nouveau(await lireLocal(uri, 'image/jpeg'));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Fichier impossible à ouvrir.');
    }
  };
  const valider = async (garder: boolean) => {
    if (!fichier) return;
    const base: SaisieVue = { points, observations };
    if (!garder || !cadre) return onValider(base);
    setEnvoi(true);
    setRefusEnvoi(undefined);
    try {
      const type = vue.media === 'video' ? typeVideo(fichier.type, fichier.uri) : fichier.type || 'image/jpeg';
      const chemin = await mediasBilan.deposer(clientId, vue.media, { ...fichier, type });
      const media: MediaVue = { chemin, type, instant: cadre.instant, cadre: { largeur: cadre.largeur, hauteur: cadre.hauteur } };
      onValider({ ...base, media });
    } catch (e) {
      setRefusEnvoi(messageErreur(e));
      setEnvoi(false);
    }
  };
  return (
    <Modale titre={vue.titre} onFermer={onFermer}>
      <View style={{ gap: espace(3) }}>
        <Text style={styles.consigne}>{vue.consigne}</Text>
        {!fichier ? (
          <View style={{ gap: espace(2) }}>
            <Bouton libelle={vue.media === 'photo' ? 'Prendre la photo' : 'Filmer'} onPress={() => choisir('camera')} />
            <Bouton variante="discret" libelle={vue.media === 'photo' ? 'Choisir une photo du téléphone' : 'Choisir une vidéo du téléphone'} onPress={() => choisir('galerie')} />
            {saisie && <Text style={styles.aide}>Cette vue est déjà faite : une nouvelle photo ou vidéo remplacera ses repères.</Text>}
            {!!erreur && <Text style={styles.erreur}>{erreur}</Text>}
          </View>
        ) : (
          <>
            <PointeurReperes media={vue.media} uri={fichier.uri ?? ''} reperes={vue.reperes} points={points} onChange={setPoints} onCadre={setCadre} />
            {vue.observations && <ChoixMultiple libelle="Ce que tu observes" choix={vue.observations} valeurs={observations} onChange={setObservations} />}
            {!!refusEnvoi && (
              <View style={{ gap: espace(2) }}>
                <Text style={styles.erreur}>{`${vue.media === 'video' ? 'Vidéo' : 'Photo'} non gardée : ${refusEnvoi}`}</Text>
                <Bouton variante="discret" libelle="Valider sans la garder (repères seulement)" onPress={() => void valider(false)} />
              </View>
            )}
            <Bouton
              libelle={complet ? 'Valider cette vue' : `Place les ${vue.reperes.filter((r) => !r.optionnel).length} repères`}
              desactive={!complet || envoi}
              chargement={envoi}
              onPress={() => void valider(true)}
            />
            <Bouton variante="discret" libelle="Autre photo ou vidéo" desactive={envoi} onPress={() => setFichier(null)} />
          </>
        )}
      </View>
      {camera && (
        <Camera
          visible
          onFermer={() => setCamera(false)}
          onFilmee={(f) => {
            setCamera(false);
            nouveau(f);
          }}
        />
      )}
    </Modale>
  );
}

// ---------- Revoir une vue ----------

function RevoirModale({ bilan, vue, onChangerVue, onFermer }: { bilan: BilanPostural; vue: VueId; onChangerVue: (v: VueId) => void; onFermer: () => void }) {
  const { width } = useWindowDimensions();
  const [reperes, setReperes] = useState(true);
  const [comparer, setComparer] = useState(false);
  const def = VUES.find((v) => v.id === vue)!;
  const autreJambe: VueId | undefined = vue === 'unipodalDroit' ? 'unipodalGauche' : vue === 'unipodalGauche' ? 'unipodalDroit' : undefined;
  const peutComparer = !!autreJambe && !!bilan.vues[autreJambe]?.media;
  const largeur = Math.min(width - 64, 520);
  const mesures = constats({ vues: { [vue]: bilan.vues[vue] } });
  return (
    <Modale titre={def.titre} onFermer={onFermer}>
      <View style={{ gap: espace(3) }}>
        {comparer && autreJambe ? (
          <View style={{ flexDirection: 'row', gap: espace(2), justifyContent: 'center' }}>
            {(['unipodalDroit', 'unipodalGauche'] as VueId[]).map((v) => (
              <View key={v} style={{ gap: espace(1), alignItems: 'center' }}>
                <MediaRevu bilan={bilan} vue={v} largeur={(largeur - espace(2)) / 2} reperes={reperes} />
                <Text style={styles.vueTitre}>{v === 'unipodalDroit' ? 'Jambe droite' : 'Jambe gauche'}</Text>
              </View>
            ))}
          </View>
        ) : (
          <MediaRevu bilan={bilan} vue={vue} largeur={largeur} reperes={reperes} />
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) }}>
          <Bascule libelle="Repères et angles" actif={reperes} onPress={() => setReperes(!reperes)} />
          {peutComparer && <Bascule libelle="Droite et gauche côte à côte" actif={comparer} onPress={() => setComparer(!comparer)} />}
        </View>
        {comparer && <Text style={styles.aide}>Les deux images figées au moment où les repères ont été posés : l’argument le plus parlant à montrer au client.</Text>}
        {!comparer &&
          mesures.map((c) => (
            <View key={c.id} style={styles.ligneMesure}>
              <Text style={[styles.vueTitre, { flex: 1 }]}>{c.titre}</Text>
              <Text style={[styles.chiffre, { color: COULEUR_NIVEAU[c.niveau].texte }]}>{`${String(c.valeur).replace('.', ',')}°`}</Text>
            </View>
          ))}
        {!comparer && autreJambe && !peutComparer && (
          <Bouton variante="discret" libelle={`Voir la jambe ${autreJambe === 'unipodalDroit' ? 'droite' : 'gauche'}`} desactive={!bilan.vues[autreJambe]} onPress={() => onChangerVue(autreJambe)} />
        )}
      </View>
    </Modale>
  );
}

function MediaRevu({ bilan, vue, largeur, reperes }: { bilan: BilanPostural; vue: VueId; largeur: number; reperes: boolean }) {
  const s = bilan.vues[vue];
  const def = VUES.find((v) => v.id === vue)!;
  const [lien, setLien] = useState<{ pour: string; uri?: string; erreur?: string }>();
  const chemin = s?.media?.chemin;
  useEffect(() => {
    let actif = true;
    if (chemin)
      mediasBilan
        .lien(chemin)
        .then((u) => actif && setLien({ pour: chemin, uri: u }))
        .catch((e) => actif && setLien({ pour: chemin, erreur: messageErreur(e) }));
    return () => {
      actif = false;
    };
  }, [chemin]);
  const uri = lien?.pour === chemin ? lien?.uri : undefined;
  const erreur = lien?.pour === chemin ? lien?.erreur : undefined;
  if (!s?.media) return <Text style={styles.aide}>Pas de photo ni de vidéo gardée pour cette vue.</Text>;
  if (erreur) return <Text style={styles.erreur}>{erreur}</Text>;
  if (!uri) return <Text style={styles.aide}>Chargement…</Text>;
  const etiquettes = constats({ vues: { [vue]: s } }).map((c) => ({
    cle: ancre(c),
    texte: `${String(c.valeur).replace('.', ',')}°`,
    couleur: c.niveau === 'normal' ? couleurs.vert : c.niveau === 'leger' ? couleurs.orange : couleurs.rougeTexte,
  }));
  return <ApercuAnnote media={def.media} uri={uri} cadre={s.media.cadre} points={s.points} traces={TRACES[vue]} etiquettes={etiquettes} largeur={largeur} reperesVisibles={reperes} />;
}

function Bascule({ libelle, actif, onPress }: { libelle: string; actif: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="switch" {...etatA11y({ checked: actif })} onPress={onPress} style={[styles.bascule, actif && styles.basculeActive]}>
      <Text style={[styles.basculeTexte, actif && { color: couleurs.blanc }]}>{`${actif ? '✓ ' : ''}${libelle}`}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  aide: { fontFamily: polices.texte, fontSize: 12, lineHeight: 18, color: couleurs.texteDoux },
  consigne: { fontFamily: polices.texte, fontSize: 13, lineHeight: 19, color: couleurs.texte },
  erreur: { fontFamily: polices.texte, fontSize: 13, color: couleurs.rouge },
  vue: { flexDirection: 'row', alignItems: 'center', gap: espace(2), minHeight: 48, paddingRight: 8, borderRadius: 10, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.carte },
  vueBouton: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espace(2), minHeight: 48, paddingLeft: 12 },
  vueFaite: { backgroundColor: couleurs.vertClair, borderColor: couleurs.vertClair },
  vueTitre: { fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texte, flexShrink: 1 },
  vueEtat: { fontFamily: polices.texte, fontSize: 12, color: couleurs.texteDoux },
  revoir: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, backgroundColor: couleurs.secondaire, justifyContent: 'center' },
  revoirTexte: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.blanc },
  ligneMesure: { flexDirection: 'row', alignItems: 'center', gap: espace(2), paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: couleurs.bordure },
  chiffre: { fontFamily: polices.chiffres, fontSize: 15 },
  bascule: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: couleurs.bordure, justifyContent: 'center' },
  basculeActive: { backgroundColor: couleurs.secondaire, borderColor: couleurs.secondaire },
  basculeTexte: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.texte },
});
