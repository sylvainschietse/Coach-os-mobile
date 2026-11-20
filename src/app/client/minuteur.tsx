import { useKeepAwake } from 'expo-keep-awake';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { garderSonPrefere, lireSonPrefere } from '@/data/formats-minuteur';
import { compiler, depuisSeance, dureeTotale, etatA, NOMS_SONNERIES, SON_DEFAUT, type Son, type Sonnerie } from '@/domain/formats-minuteur';
import { ecoule, lireMinuteur, resumeMinuteur, TABATA, type ConfigMinuteur } from '@/domain/minuteur';
import { annulerSonneries, ecouter, jouer, preparerSons, programmerAlertes, useSignauxMinuteur, useSortieEveillee } from '@/lib/sons-minuteur';
import { maintenantMs } from '@/lib/temps';
import { Bouton, Carte, Ecran, Texte } from '@/ui/composants';
import { couleurs, espace, polices } from '@/ui/theme';

type Marche = { debutMs: number; pausesMs: number; pauseDepuisMs?: number; alertes: (string | null)[] };

const REGLAGES: { cle: keyof ConfigMinuteur; libelle: string; pas: number; min: number; unite: string }[] = [
  { cle: 'exercices', libelle: 'Exercices', pas: 1, min: 1, unite: '' },
  { cle: 'travailS', libelle: 'Travail', pas: 5, min: 5, unite: 's' },
  { cle: 'reposS', libelle: 'Repos', pas: 5, min: 0, unite: 's' },
  { cle: 'tours', libelle: 'Tours', pas: 1, min: 1, unite: '' },
  { cle: 'reposEntreToursS', libelle: 'Repos entre tours', pas: 15, min: 0, unite: 's' },
];

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.ceil(s % 60) === 60 ? 0 : Math.ceil(s % 60)).padStart(2, '0')}`;

export default function Minuteur() {
  useKeepAwake();
  // Ouvert depuis une séance : le chrono réglé par le coach arrive en paramètre.
  const params = useLocalSearchParams<{ config?: string; titre?: string; noms?: string }>();
  const [prevu] = useState(() => lireMinuteur(params.config));
  const [noms] = useState(() => lireNoms(params.noms));
  const [config, setConfig] = useState<ConfigMinuteur>(prevu ?? TABATA);
  const [marche, setMarche] = useState<Marche | null>(null);
  const [maintenant, setMaintenant] = useState(maintenantMs);
  // Le son réglé dans « Mes minuteurs » : sonnerie, décompte de départ, bips 3, 2, 1.
  const [son, setSon] = useState<Son>(SON_DEFAUT);
  useEffect(() => {
    lireSonPrefere().then(setSon);
  }, []);
  const phases = useMemo(() => compiler(depuisSeance(config), son), [config, son]);
  /** Nom de l'exercice n quand le coach a prévu un circuit en alternance (même nombre d'exercices qu'au réglage). */
  const nomDe = (n: number) => (noms.length === config.exercices ? noms[n - 1] : undefined);

  useEffect(() => {
    if (!marche || marche.pauseDepuisMs) return;
    const t = setInterval(() => setMaintenant(maintenantMs()), 200);
    return () => clearInterval(t);
  }, [marche]);

  const ecouleS = marche ? ecoule(marche.debutMs, maintenant, marche.pausesMs, marche.pauseDepuisMs) : null;
  const etat = ecouleS !== null ? etatA(phases, ecouleS) : null;
  useSignauxMinuteur(phases, son, marche && !marche.pauseDepuisMs ? ecouleS : null);
  useSortieEveillee(!!marche && !marche.pauseDepuisMs && etat?.statut === 'en_cours');

  /** Une alerte par fin de phase : la sonnerie passe écran verrouillé ou sur une autre appli. */
  const programmer = (depuisS: number) => programmerAlertes(phases, son, depuisS, nomDe);

  async function demarrer() {
    preparerSons();
    if (!phases.some((p) => p.type === 'preparation')) jouer(son.sonnerie);
    const t0 = maintenantMs();
    setMaintenant(t0);
    setMarche({ debutMs: t0, pausesMs: 0, alertes: [] });
    const alertes = await programmer(0);
    setMarche((m) => (m && m.debutMs === t0 ? { ...m, alertes } : m));
  }

  async function basculerPause() {
    if (!marche) return;
    const t = maintenantMs();
    if (marche.pauseDepuisMs) {
      const pausesMs = marche.pausesMs + (t - marche.pauseDepuisMs);
      const depuis = ecoule(marche.debutMs, t, pausesMs);
      setMarche({ debutMs: marche.debutMs, pausesMs, alertes: await programmer(depuis) });
    } else {
      await annulerSonneries(marche.alertes);
      setMarche({ ...marche, pauseDepuisMs: t, alertes: [] });
    }
    setMaintenant(t);
  }

  async function arreter() {
    if (marche) await annulerSonneries(marche.alertes);
    setMarche(null);
  }

  if (!marche || !etat) {
    return (
      <Ecran>
        {params.titre && <Stack.Screen options={{ title: params.titre }} />}
        {prevu ? (
          <Texte doux>Chrono prévu par ton coach : {resumeMinuteur(prevu)}. Tu peux l’ajuster avant de lancer.</Texte>
        ) : (
          <Texte doux>Tabata, circuit ou fractionné : règle le format puis lance.</Texte>
        )}
        <Carte>
          {REGLAGES.map((r) => (
            <View key={r.cle} style={styles.reglage}>
              <Texte style={{ flex: 1 }}>{r.libelle}</Texte>
              <Pas libelle="−" onPress={() => setConfig((c) => ({ ...c, [r.cle]: Math.max(r.min, c[r.cle] - r.pas) }))} />
              <Text style={styles.valeur}>
                {config[r.cle]}
                {r.unite}
              </Text>
              <Pas libelle="+" onPress={() => setConfig((c) => ({ ...c, [r.cle]: c[r.cle] + r.pas }))} />
            </View>
          ))}
        </Carte>
        <Carte>
          <Texte>Sonnerie</Texte>
          <View style={styles.sons}>
            {(Object.keys(NOMS_SONNERIES) as Sonnerie[]).map((x) => (
              <Pressable
                key={x}
                accessibilityRole="button"
                accessibilityState={{ selected: son.sonnerie === x }}
                onPress={() => {
                  const s = { ...son, sonnerie: x };
                  setSon(s);
                  garderSonPrefere(s);
                  ecouter(x);
                }}
                style={[styles.son, son.sonnerie === x && styles.sonChoisi]}
              >
                <Text style={[styles.texteSon, son.sonnerie === x && { color: '#FFFFFF' }]}>{NOMS_SONNERIES[x]}</Text>
              </Pressable>
            ))}
          </View>
          <Texte doux>
            {son.preparationS ? `Décompte de ${son.preparationS} s avant le départ` : 'Départ immédiat'}
            {son.bipsTravail || son.bipsRepos ? ', bips 3, 2, 1 avant la fin des phases.' : '.'} Réglable dans Minuteurs.
          </Texte>
        </Carte>
        <Texte doux style={{ textAlign: 'center' }}>Durée totale {mmss(dureeTotale(phases))}</Texte>
        <Bouton libelle="Démarrer" onPress={demarrer} />
        {prevu ? (
          <Bouton variante="discret" libelle="Revenir au réglage du coach" onPress={() => setConfig(prevu)} />
        ) : (
          <Bouton variante="discret" libelle="Revenir au Tabata (8 × 20 s / 10 s)" onPress={() => setConfig(TABATA)} />
        )}
      </Ecran>
    );
  }

  const travail = etat.statut === 'en_cours' && etat.phase.type === 'travail';
  const preparation = etat.statut === 'en_cours' && etat.phase.type === 'preparation';
  const fond = etat.statut === 'termine' ? couleurs.noir : travail ? couleurs.rouge : '#2A2A30';

  return (
    <View style={[styles.plein, { backgroundColor: fond }]}>
      {etat.statut === 'termine' ? (
        <Text style={styles.phase}>Terminé</Text>
      ) : (
        <>
          <Text style={styles.phase}>{travail ? 'Travail' : preparation ? 'Prêt ?' : 'Repos'}</Text>
          <Text style={styles.compte}>{mmss(etat.restantS)}</Text>
          {nomDe(etat.phase.exercice) && (
            <Text style={styles.detail}>{travail ? nomDe(etat.phase.exercice) : `Ensuite : ${nomDe(suivant(phases, etat.index)) ?? ''}`}</Text>
          )}
          <Text style={styles.detail}>
            Exercice {etat.phase.exercice}/{config.exercices} · Tour {etat.phase.tour}/{config.tours}
          </Text>
        </>
      )}
      <View style={styles.actions}>
        {etat.statut !== 'termine' && (
          <Bouton variante="secondaire" libelle={marche.pauseDepuisMs ? 'Reprendre' : 'Pause'} onPress={basculerPause} />
        )}
        {etat.statut === 'termine' && prevu ? (
          <Bouton variante="contour" libelle="Retour à la séance" onPress={() => router.back()} />
        ) : (
          <Bouton variante="contour" libelle={etat.statut === 'termine' ? 'Nouveau minuteur' : 'Arrêter'} onPress={arreter} />
        )}
      </View>
    </View>
  );
}

/** Exercice du prochain intervalle de travail. */
const suivant = (phases: { type: string; exercice: number }[], i: number) => phases.slice(i + 1).find((p) => p.type === 'travail')?.exercice ?? 0;

function lireNoms(brut?: string): string[] {
  try {
    const v = JSON.parse(brut ?? '[]');
    return Array.isArray(v) && v.every((x) => typeof x === 'string') ? v : [];
  } catch {
    return [];
  }
}

function Pas({ libelle, onPress }: { libelle: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.pas} accessibilityRole="button">
      <Text style={styles.pasTexte}>{libelle}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  reglage: { flexDirection: 'row', alignItems: 'center', gap: espace(3), paddingVertical: espace(1) },
  valeur: { width: 56, textAlign: 'center', fontFamily: polices.texteGras, fontSize: 18, color: couleurs.texte },
  pas: { width: 40, height: 40, borderRadius: 10, backgroundColor: couleurs.fond, alignItems: 'center', justifyContent: 'center' },
  pasTexte: { fontSize: 22, fontFamily: polices.texteGras, color: couleurs.texte },
  plein: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espace(6), gap: espace(2) },
  phase: { fontFamily: polices.titre, fontSize: 48, color: '#FFFFFF', letterSpacing: 2 },
  compte: { fontFamily: polices.chiffres, fontSize: 112, lineHeight: 130, color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  detail: { fontFamily: polices.texteMoyen, fontSize: 18, color: '#FFFFFFCC' },
  sons: { flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) },
  son: { borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 999, paddingHorizontal: espace(3), paddingVertical: espace(2) },
  sonChoisi: { backgroundColor: couleurs.rouge, borderColor: couleurs.rouge },
  texteSon: { fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.texte },
  actions: { width: '100%', maxWidth: 360, gap: espace(3), marginTop: espace(10) },
});
