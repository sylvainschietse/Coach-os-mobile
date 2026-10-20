import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';

import { depot } from '@/data';
import { enregistrerSeance } from '@/data/file-envoi';
import { useSession } from '@/data/session';
import { champsPertinents, LIBELLES } from '@/domain/mesures';
import { resumeMinuteur, type ConfigMinuteur } from '@/domain/minuteur';
import { annulerValidation, construireRealisation, modifierSerie, validerSerie } from '@/domain/realisation';
import { preparerSeries } from '@/domain/suggestions';
import type { LignePrescription, Seance, SerieSaisie } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';
import { dansSecondes, maintenantMs } from '@/lib/temps';
import { annulerAlertes, autoriserNotifications, programmerAlerte } from '@/lib/notifications';
import { vibrer } from '@/lib/vibrer';
import { Bouton, Carte, Chargement, ChampNombre, Ecran, Erreur, SousTitre, Texte, Titre } from '@/ui/composants';
import { couleurs, espace, polices } from '@/ui/theme';

type Repos = { finMs: number; libelle: string; alerte: string | null };

function prescriptionLisible(l: LignePrescription): string {
  const morceaux = [`${l.series} × `];
  if (l.repetitionsMin !== undefined) {
    morceaux.push(l.repetitionsMax && l.repetitionsMax !== l.repetitionsMin ? `${l.repetitionsMin}–${l.repetitionsMax} rép.` : `${l.repetitionsMin} rép.`);
  } else if (l.dureeS !== undefined) {
    morceaux.push(l.dureeS >= 60 ? `${Math.round(l.dureeS / 60)} min` : `${l.dureeS} s`);
  }
  const details = [
    l.recuperationS ? `récup ${l.recuperationS} s` : null,
    l.rir !== undefined ? `RIR ${l.rir}` : null,
    l.tempo ? `tempo ${l.tempo}` : null,
  ].filter(Boolean);
  return morceaux.join('') + (details.length ? ` · ${details.join(' · ')}` : '');
}

export default function RealiserSeance() {
  useKeepAwake();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profil } = useSession();
  const [seance, setSeance] = useState<Seance | null>(null);
  const [series, setSeries] = useState<Record<string, SerieSaisie[]>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [commentaire, setCommentaire] = useState('');
  const [repos, setRepos] = useState<Repos | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const debut = useRef(new Date().toISOString());
  // Identifiant fixé à l'ouverture : un double appui sur « Terminer » envoie la même séance.
  const idRealisation = useRef(nouvelId());

  useEffect(() => {
    if (profil?.role !== 'client') return;
    (async () => {
      try {
        const s = await depot.seance(id);
        const exerciceIds = s.blocs.flatMap((b) => b.lignes.map((l) => l.exercice.id));
        const historique = await depot.historique(profil.clientId, exerciceIds);
        const initiales: Record<string, SerieSaisie[]> = {};
        s.blocs.forEach((b) => b.lignes.forEach((l) => (initiales[l.id] = preparerSeries(l, historique[l.exercice.id]))));
        setSeance(s);
        setSeries(initiales);
      } catch (e) {
        setErreur(e instanceof Error ? e.message : 'Séance introuvable');
      }
    })();
    autoriserNotifications();
  }, [id, profil]);

  const toutes = useMemo(() => Object.values(series).flat(), [series]);
  const nbValidees = toutes.filter((s) => s.validee).length;

  function changer(ligneId: string, index: number, maj: (s: SerieSaisie) => SerieSaisie) {
    setSeries((avant) => ({ ...avant, [ligneId]: avant[ligneId].map((s) => (s.index === index ? maj(s) : s)) }));
  }

  async function lancerRepos(ligne: LignePrescription) {
    if (!ligne.recuperationS) return;
    if (repos) await annulerAlertes([repos.alerte]);
    const alerte = await programmerAlerte(ligne.recuperationS, 'Repos terminé', `Série suivante : ${ligne.exercice.nom}`);
    setRepos({ finMs: dansSecondes(ligne.recuperationS), libelle: ligne.exercice.nom, alerte });
  }

  async function arreterRepos() {
    if (repos) await annulerAlertes([repos.alerte]);
    setRepos(null);
  }

  async function terminer() {
    if (!seance || profil?.role !== 'client') return;
    setEnvoi(true);
    await arreterRepos();
    const realisation = construireRealisation(toutes, {
      id: idRealisation.current,
      seanceId: seance.id,
      clientId: profil.clientId,
      debut: debut.current,
      fin: new Date().toISOString(),
      commentaire,
      nouvelId,
    });
    await enregistrerSeance(realisation);
    setEnvoi(false);
    router.back();
  }

  if (erreur) return <Ecran><Erreur message={erreur} /></Ecran>;
  if (!seance) return <Ecran><Chargement /></Ecran>;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: seance.titre }} />
      <Ecran>
        <Titre>{seance.titre}</Titre>
        {seance.consignes && <Texte doux>{seance.consignes}</Texte>}
        <View style={styles.legende}>
          <Text style={styles.legendeSuggestion}>40</Text>
          <Texte doux style={{ flex: 1, fontSize: 13 }}>
            Les valeurs grisées sont des suggestions. Corrige-les si besoin, puis valide la série.
          </Texte>
        </View>

        {seance.blocs.map((bloc) => (
          <View key={bloc.id} style={{ gap: espace(3) }}>
            <Text style={styles.bloc}>{bloc.titre}</Text>
            {bloc.minuteur && <LancerChrono config={bloc.minuteur} titre={bloc.titre} />}
            {bloc.lignes.map((ligne) => {
              const champs = champsPertinents(ligne.exercice);
              return (
                <Carte key={ligne.id}>
                  <SousTitre>{ligne.exercice.nom}</SousTitre>
                  <Texte doux style={{ fontSize: 14 }}>{prescriptionLisible(ligne)}</Texte>
                  {ligne.consignes && <Texte style={{ fontSize: 14 }}>{ligne.consignes}</Texte>}
                  {ligne.exercice.videoUrl && (
                    <Pressable accessibilityRole="link" onPress={() => Linking.openURL(ligne.exercice.videoUrl!)} hitSlop={8}>
                      <Texte style={{ fontSize: 14, color: couleurs.rouge }}>▶ Voir la démonstration</Texte>
                    </Pressable>
                  )}
                  {ligne.minuteur && <LancerChrono config={ligne.minuteur} titre={ligne.exercice.nom} />}
                  {series[ligne.id]?.map((serie) => (
                    <View key={serie.index} style={styles.serie}>
                      <Text style={styles.numero}>{serie.index + 1}</Text>
                      {champs.map((m) => (
                        <ChampNombre
                          key={m}
                          libelle={`${LIBELLES[m].libelle} (${LIBELLES[m].unite})`}
                          valeur={serie.valeurs[m]}
                          suggestion={serie.suggestion[m]}
                          valide={serie.validee}
                          afficherLibelle={serie.index === 0}
                          onChange={(v) => changer(ligne.id, serie.index, (s) => modifierSerie(s, m, v))}
                        />
                      ))}
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: serie.validee }}
                        accessibilityLabel={`Valider la série ${serie.index + 1}`}
                        onPress={() => {
                          if (serie.validee) changer(ligne.id, serie.index, annulerValidation);
                          else {
                            changer(ligne.id, serie.index, validerSerie);
                            vibrer();
                            lancerRepos(ligne);
                          }
                        }}
                        style={[styles.valider, serie.validee && styles.validee]}
                      >
                        <Text style={[styles.validerTexte, serie.validee && { color: '#FFFFFF' }]}>✓</Text>
                      </Pressable>
                    </View>
                  ))}
                </Carte>
              );
            })}
          </View>
        ))}

        <Carte>
          <SousTitre>Ton ressenti</SousTitre>
          <TextInput
            style={styles.commentaire}
            multiline
            placeholder="Un mot pour ton coach (facultatif)"
            placeholderTextColor={couleurs.suggestion}
            value={commentaire}
            onChangeText={setCommentaire}
          />
        </Carte>
        <Texte doux style={{ textAlign: 'center' }}>
          {nbValidees} / {toutes.length} séries validées
        </Texte>
        <Bouton libelle="Terminer la séance" onPress={terminer} chargement={envoi} desactive={nbValidees === 0} />
        <View style={{ height: repos ? 80 : 0 }} />
      </Ecran>
      {repos && <BandeauRepos repos={repos} onFin={() => setRepos(null)} onPasser={arreterRepos} />}
    </View>
  );
}

/** Chrono réglé par le coach, sous un exercice ou un circuit : un appui ouvre le minuteur déjà configuré. */
function LancerChrono({ config, titre }: { config: ConfigMinuteur; titre: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Lancer le chrono : ${resumeMinuteur(config)}`}
      onPress={() => router.push({ pathname: '/client/minuteur', params: { config: JSON.stringify(config), titre } })}
      style={({ pressed }) => [styles.chrono, pressed && { opacity: 0.85 }]}
    >
      <Text style={styles.chronoIcone}>⏱</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.chronoTitre}>Lancer le chrono</Text>
        <Text style={styles.chronoDetail}>{resumeMinuteur(config)}</Text>
      </View>
      <Text style={styles.chronoFleche}>›</Text>
    </Pressable>
  );
}

function BandeauRepos({ repos, onFin, onPasser }: { repos: Repos; onFin: () => void; onPasser: () => void }) {
  const [maintenant, setMaintenant] = useState(maintenantMs);
  useEffect(() => {
    const t = setInterval(() => setMaintenant(maintenantMs()), 250);
    return () => clearInterval(t);
  }, []);
  // Calculé depuis l'heure de fin : reste juste même si l'app a été mise en arrière-plan.
  const restant = Math.max(0, Math.ceil((repos.finMs - maintenant) / 1000));
  useEffect(() => {
    if (restant === 0) {
      vibrer();
      onFin();
    }
  }, [restant, onFin]);
  return (
    <View style={styles.bandeau}>
      <View style={{ flex: 1 }}>
        <Text style={styles.bandeauLibelle}>Repos · {repos.libelle}</Text>
        <Text style={styles.bandeauTemps}>
          {Math.floor(restant / 60)}:{String(restant % 60).padStart(2, '0')}
        </Text>
      </View>
      <Pressable onPress={onPasser} style={styles.passer} accessibilityRole="button">
        <Text style={styles.passerTexte}>Passer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  legende: { flexDirection: 'row', gap: espace(3), alignItems: 'center' },
  legendeSuggestion: {
    fontFamily: polices.texteMoyen,
    fontStyle: 'italic',
    color: couleurs.suggestion,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: 8,
    paddingHorizontal: espace(2),
    paddingVertical: espace(1),
    backgroundColor: '#FFFFFF',
  },
  bloc: { fontFamily: polices.texteGras, color: couleurs.rouge, textTransform: 'uppercase', letterSpacing: 1, marginTop: espace(2) },
  serie: { flexDirection: 'row', alignItems: 'flex-end', gap: espace(2) },
  numero: { width: 20, fontFamily: polices.texteGras, color: couleurs.texteDoux, paddingBottom: espace(3.5) },
  valider: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: couleurs.bordure,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  validee: { backgroundColor: couleurs.vert, borderColor: couleurs.vert },
  validerTexte: { fontSize: 22, color: couleurs.bordure, fontFamily: polices.texteGras },
  commentaire: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: couleurs.bordure,
    borderRadius: 10,
    padding: espace(3),
    fontFamily: polices.texte,
    fontSize: 16,
    textAlignVertical: 'top',
    color: couleurs.texte,
  },
  chrono: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espace(3),
    backgroundColor: couleurs.noir,
    borderRadius: 12,
    paddingHorizontal: espace(4),
    paddingVertical: espace(3),
  },
  chronoIcone: { fontSize: 22, color: '#FFFFFF' },
  chronoTitre: { color: '#FFFFFF', fontFamily: polices.texteGras, fontSize: 15 },
  chronoDetail: { color: '#C9C9CF', fontFamily: polices.texte, fontSize: 13 },
  chronoFleche: { color: couleurs.rouge, fontFamily: polices.texteGras, fontSize: 26 },
  bandeau: {
    position: 'absolute',
    left: espace(3),
    right: espace(3),
    bottom: espace(6),
    backgroundColor: couleurs.noir,
    borderRadius: 16,
    padding: espace(4),
    flexDirection: 'row',
    alignItems: 'center',
    gap: espace(3),
  },
  bandeauLibelle: { color: '#C9C9CF', fontFamily: polices.texte, fontSize: 13 },
  bandeauTemps: { color: '#FFFFFF', fontFamily: polices.titre, fontSize: 40, lineHeight: 42 },
  passer: { backgroundColor: couleurs.rouge, borderRadius: 10, paddingHorizontal: espace(4), paddingVertical: espace(3) },
  passerTexte: { color: '#FFFFFF', fontFamily: polices.texteGras },
});
