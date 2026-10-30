// WorkoutTimers.tsx d'origine (U05) : « Mes minuteurs » (intervalles ou repos simple), ouvert depuis l'en-tête ou
// le bouton de l'onglet Programme, et mini-barre du minuteur actif au-dessus des onglets. Le repos entre les séries
// d'une séance passe par le même minuteur. Réglages et minuteur en cours restent sur l'appareil.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Pause, Play, RotateCcw, Timer, Volume2, VolumeX, X } from 'lucide-react-native';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { CONFIG_DEFAUT, configValide, duree, ecoule, etape, horloge, mettreEnPause, relireMarche, reprendre, type ConfigMinuteurs, type Marche } from '@/domain/minuteurs';
import { roleWeb } from '@/lib/role-web';
import { maintenantMs } from '@/lib/temps';
import { vibrer } from '@/lib/vibrer';

import { BoutonIcone } from '../coque';
import { Saisie } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { Action, Confirmation, Ligne, ts } from './commun';

interface Contexte {
  actif: boolean;
  ouvrir: () => void;
  repos: (secondes: number, libelle: string) => void;
}
const ContexteMinuteurs = createContext<Contexte | null>(null);
export const useMinuteurs = () => useContext(ContexteMinuteurs);

/** TimerPanelButton : en haut de l'onglet Programme. */
export function BoutonPanneauMinuteurs() {
  const m = useMinuteurs();
  if (!m) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={m.ouvrir}
      style={{ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: couleurs.saisie, borderRadius: 10, backgroundColor: couleurs.carte, paddingHorizontal: 16 }}
    >
      <Timer size={20} color={couleurs.rouge} />
      <Text style={[ts.texte, { fontFamily: polices.texteMoyen }]}>Minuteurs · repos et intervalles</Text>
    </Pressable>
  );
}

/** TimerLauncher : bouton de l'en-tête. */
export function LanceurMinuteurs() {
  const m = useMinuteurs();
  return m ? <BoutonIcone icone={Timer} nom="Ouvrir les minuteurs" onPress={m.ouvrir} /> : null;
}

type Champs = { exercices: string; tours: string; travail: string; repos: string };
const champs = (c: ConfigMinuteurs): Champs => ({ exercices: String(c.exercices), tours: String(c.tours), travail: String(c.travail), repos: String(c.repos) });
const CHAMPS = [
  { nom: 'exercices', libelle: 'Nombre d’exercices' },
  { nom: 'travail', libelle: 'Travail (secondes)' },
  { nom: 'repos', libelle: 'Repos (secondes)' },
  { nom: 'tours', libelle: 'Nombre de tours' },
] as const;
type Audio = { state: string; currentTime: number; destination: unknown; resume: () => Promise<void>; close: () => Promise<void>; createOscillator: () => any; createGain: () => any };

export function Minuteurs({ utilisateurId, children }: { utilisateurId: string; children: ReactNode }) {
  const cle = `coachos-timer:${utilisateurId}`;
  const [marche, setMarche] = useState<Marche | null>(null);
  const [maintenant, setMaintenant] = useState(maintenantMs);
  const [ouvert, setOuvert] = useState(false);
  const [mode, setMode] = useState<'interval' | 'rest'>('interval');
  const [form, setForm] = useState<Champs>(champs(CONFIG_DEFAUT));
  const [reposSimple, setReposSimple] = useState('60');
  const [son, setSon] = useState(true);
  const [erreur, setErreur] = useState('');
  const [charge, setCharge] = useState(false);
  const [remplacer, setRemplacer] = useState<ConfigMinuteurs | null>(null);
  const audio = useRef<Audio | null>(null);
  const cleEtape = useRef('');

  const configure: ConfigMinuteurs =
    mode === 'rest'
      ? { ...CONFIG_DEFAUT, mode: 'rest', repos: Number(reposSimple), preparation: 0, libelle: 'Repos' }
      : { ...CONFIG_DEFAUT, exercices: Number(form.exercices), tours: Number(form.tours), travail: Number(form.travail), repos: Number(form.repos) };
  const valide = configValide(configure) && (mode === 'rest' ? reposSimple.trim() !== '' : Object.values(form).every((v) => v.trim() !== ''));

  const deverrouiller = () => {
    if (Platform.OS !== 'web') return;
    try {
      const w = window as unknown as { AudioContext?: new () => Audio; webkitAudioContext?: new () => Audio };
      const AC = w.AudioContext || w.webkitAudioContext;
      if (AC) {
        audio.current ??= new AC();
        audio.current.resume().catch(() => {});
      }
    } catch {
      // Pas de son sur ce navigateur.
    }
  };
  const signal = (fin = false) => {
    if (!son) return;
    try {
      const a = audio.current;
      if (a?.state === 'running') {
        const osc = a.createOscillator();
        const gain = a.createGain();
        osc.connect(gain);
        gain.connect(a.destination);
        osc.frequency.value = fin ? 1000 : 750;
        gain.gain.setValueAtTime(0.15, a.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.35);
        osc.start();
        osc.stop(a.currentTime + 0.4);
      }
      if (Platform.OS === 'web') (navigator as { vibrate?: (p: number | number[]) => void }).vibrate?.(fin ? [150, 100, 150] : 100);
      else vibrer();
    } catch {
      // Le signal est un confort : le minuteur continue sans lui.
    }
  };

  // Réglages et minuteur en cours relus à l'ouverture de l'espace.
  useEffect(() => {
    let annule = false;
    AsyncStorage.getItem(cle)
      .then((brut) => {
        if (annule || !brut) return;
        const s = JSON.parse(brut) as { config?: ConfigMinuteurs; run?: Marche; sound?: boolean };
        if (configValide(s.config)) {
          setMode(s.config.mode);
          setForm(champs(s.config));
          setReposSimple(String(s.config.repos));
        }
        if (typeof s.sound === 'boolean') setSon(s.sound);
        const m = relireMarche(s.run, maintenantMs());
        if (m) {
          cleEtape.current = etape(m.config, ecoule(m, maintenantMs())).cle;
          setMarche(m);
        }
      })
      .catch(() => {})
      .finally(() => !annule && setCharge(true));
    return () => {
      annule = true;
      audio.current?.close().catch(() => {});
      audio.current = null;
    };
  }, [cle]);

  const aGarder = JSON.stringify({ config: valide ? configure : CONFIG_DEFAUT, run: marche, sound: son });
  useEffect(() => {
    if (charge) AsyncStorage.setItem(cle, aGarder).catch(() => {});
  }, [charge, cle, aGarder]);

  const enCours = marche?.statut === 'running';
  const departLe = marche?.departLe;
  useEffect(() => {
    if (!enCours) return;
    const t = setInterval(() => setMaintenant(maintenantMs()), 150);
    return () => clearInterval(t);
  }, [enCours, departLe]);

  useEffect(() => {
    if (!enCours) return;
    activateKeepAwakeAsync('minuteurs').catch(() => {});
    return () => {
      deactivateKeepAwake('minuteurs').catch(() => {});
    };
  }, [enCours]);

  const temps = marche ? ecoule(marche, enCours ? Math.max(maintenant, marche.departLe) : maintenant) : 0;
  const courant = marche ? etape(marche.config, temps) : null;
  const fini = !!marche && (marche.statut === 'done' || courant?.type === 'done');
  const cleCourante = enCours ? courant?.cle : undefined;
  useEffect(() => {
    if (!cleCourante || cleCourante === cleEtape.current) return;
    cleEtape.current = cleCourante;
    signal(cleCourante === 'done');
    // signal ne dépend que du réglage du son, relu à chaque changement d'étape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleCourante]);

  const lancer = (c: ConfigMinuteurs, force = false) => {
    if (!configValide(c)) return setErreur('Vérifiez les valeurs du minuteur.');
    if (marche && !fini && !force) return setRemplacer(c);
    deverrouiller();
    setMode(c.mode);
    setReposSimple(String(c.repos));
    if (c.mode === 'interval') setForm(champs(c));
    const n = maintenantMs();
    cleEtape.current = etape(c, 0).cle;
    setMaintenant(n);
    setMarche({ config: c, statut: 'running', ecouleMs: 0, departLe: n });
    setErreur('');
    setOuvert(false);
  };
  const basculer = () => {
    deverrouiller();
    const n = maintenantMs();
    setMaintenant(n);
    setMarche((m) => (m ? (m.statut === 'running' ? mettreEnPause(m, n) : reprendre(m, n)) : null));
  };
  const recommencer = () => {
    if (!marche) return;
    deverrouiller();
    const n = maintenantMs();
    cleEtape.current = etape(marche.config, 0).cle;
    setMaintenant(n);
    setMarche({ ...marche, statut: 'running', ecouleMs: 0, departLe: n });
  };
  const arreter = () => {
    setMarche(null);
    cleEtape.current = '';
  };

  const titre = fini ? 'Terminé' : courant?.type === 'prepare' ? 'Préparez-vous' : courant?.type === 'work' ? 'Travail' : 'Repos';
  const enPause = marche?.statut === 'paused' && !fini;
  const detail = (sep: string) =>
    marche && courant
      ? marche.config.mode === 'rest'
        ? marche.config.libelle
        : `Exercice ${courant.exercice}${sep}${marche.config.exercices} · Tour ${courant.tour}${sep}${marche.config.tours}`
      : '';

  const lancerRef = useRef(lancer);
  useEffect(() => {
    lancerRef.current = lancer;
  });
  const contexte = useMemo<Contexte>(
    () => ({
      actif: !!marche,
      ouvrir: () => {
        setErreur('');
        setOuvert(true);
      },
      repos: (secondes, libelle) =>
        lancerRef.current({ ...CONFIG_DEFAUT, mode: 'rest', repos: Math.min(3600, Math.max(1, Math.round(secondes))), preparation: 0, libelle: libelle.slice(0, 200) }),
    }),
    [marche],
  );

  return (
    <ContexteMinuteurs.Provider value={contexte}>
      <View style={{ flex: 1 }}>
        {children}
        {marche && courant && (
          <View
            accessibilityLabel="Minuteur actif"
            style={[
              ts.carte,
              { position: 'absolute', left: 12, right: 12, bottom: 84, zIndex: 40, maxWidth: 576, marginHorizontal: 'auto' },
              { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 16, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 16 },
            ]}
          >
            <Pressable accessibilityRole="button" onPress={() => setOuvert(true)} style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={ts.doux}>
                {detail('/')}
              </Text>
              <Text numberOfLines={1} style={[ts.texte, { fontFamily: polices.texteGras, color: courant.type === 'work' ? couleurs.rouge : couleurs.texte }]}>
                {enPause ? `En pause · ${titre}` : titre}
                {'  '}
                <Text role="timer" style={{ fontFamily: polices.chiffres, fontSize: 22 }}>
                  {horloge(courant.restant)}
                </Text>
              </Text>
            </Pressable>
            {!fini && <Action variante="contour" icone={enCours ? Pause : Play} nom={enCours ? 'Mettre en pause' : 'Reprendre'} onPress={basculer} />}
            <Action variante="contour" icone={RotateCcw} nom="Recommencer le minuteur" onPress={recommencer} />
            <Action variante="fantome" icone={X} nom="Arrêter et fermer le minuteur" onPress={arreter} />
          </View>
        )}
      </View>

      <Modal visible={ouvert} transparent animationType="fade" onRequestClose={() => setOuvert(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 }}>
          <View {...roleWeb('dialog')} accessibilityLabel="Mes minuteurs" style={{ width: '100%', maxWidth: 512, maxHeight: '90%', alignSelf: 'center', backgroundColor: couleurs.carte, borderRadius: 16 }}>
            <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Timer size={20} color={couleurs.rouge} />
                    <Text accessibilityRole="header" style={[ts.titre, { fontSize: 18 }]}>
                      Mes minuteurs
                    </Text>
                  </View>
                  <Text style={[ts.texte, { color: couleurs.texteDoux }]}>Repos entre les séries ou intervalles de travail et de récupération.</Text>
                </View>
                <Action variante="fantome" petit icone={X} nom="Fermer" onPress={() => setOuvert(false)} />
              </View>

              {marche && courant && (
                <View
                  style={{
                    borderRadius: 12,
                    borderWidth: 1,
                    padding: 16,
                    alignItems: 'center',
                    borderColor: courant.type === 'work' ? 'rgba(195,24,30,0.4)' : couleurs.bordure,
                    backgroundColor: courant.type === 'work' ? 'rgba(195,24,30,0.05)' : 'rgba(237,239,242,0.4)',
                  }}
                >
                  <Text {...roleWeb('status')} style={[ts.texte, { fontFamily: polices.texteGras }]}>
                    {enPause ? `En pause · ${titre}` : titre}
                  </Text>
                  <Text role="timer" style={{ fontFamily: polices.chiffres, fontSize: 60, color: couleurs.texte, marginVertical: 8 }}>
                    {horloge(courant.restant)}
                  </Text>
                  <Text style={ts.doux}>{detail(' / ')}</Text>
                  <Ligne style={{ justifyContent: 'center', marginTop: 16 }}>
                    {!fini && <Action icone={enCours ? Pause : Play} libelle={enCours ? 'Pause' : 'Reprendre'} onPress={basculer} />}
                    <Action variante="contour" icone={RotateCcw} libelle="Recommencer" onPress={recommencer} />
                  </Ligne>
                  <View style={{ marginTop: 8 }}>
                    <Action variante="fantome" petit libelle="Arrêter" onPress={arreter} />
                  </View>
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 4, borderRadius: 12, backgroundColor: couleurs.discret, padding: 4 }}>
                {(['interval', 'rest'] as const).map((m) => (
                  <Pressable
                    key={m}
                    accessibilityRole="button"
                    accessibilityState={{ selected: mode === m }}
                    onPress={() => {
                      setMode(m);
                      setErreur('');
                    }}
                    style={{ flex: 1, minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: mode === m ? couleurs.carte : 'transparent' }}
                  >
                    <Text style={[ts.texte, { fontFamily: polices.texteGras, color: mode === m ? couleurs.rouge : couleurs.texteDoux }]}>
                      {m === 'interval' ? 'Intervalles' : 'Repos simple'}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {mode === 'interval' ? (
                <>
                  <Ligne>
                    <Action petit variante="contour" libelle="Tabata · 20 / 10" onPress={() => setForm(champs(CONFIG_DEFAUT))} />
                    <Action petit variante="contour" libelle="Circuit · 40 / 20" onPress={() => setForm(champs({ ...CONFIG_DEFAUT, exercices: 6, travail: 40, repos: 20 }))} />
                  </Ligne>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                    {CHAMPS.map((f) => (
                      <View key={f.nom} style={{ flexBasis: '45%', flexGrow: 1, minWidth: 0 }}>
                        <Saisie
                          libelle={f.libelle}
                          type="nombre"
                          valeur={form[f.nom]}
                          onChange={(v) => {
                            setForm((s) => ({ ...s, [f.nom]: v }));
                            setErreur('');
                          }}
                        />
                      </View>
                    ))}
                  </View>
                  <Text style={ts.doux}>
                    Chaque tour enchaîne les exercices avec le même temps de travail et de repos. Départ après 5 secondes de préparation ; le dernier repos est inclus.
                  </Text>
                </>
              ) : (
                <Saisie
                  libelle="Temps de repos (secondes)"
                  type="nombre"
                  valeur={reposSimple}
                  onChange={(v) => {
                    setReposSimple(v);
                    setErreur('');
                  }}
                />
              )}

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <Text style={ts.texte}>{valide ? `Durée totale : ${horloge(duree(configure))}` : 'Vérifiez les valeurs'}</Text>
                <Action
                  petit
                  variante="fantome"
                  icone={son ? Volume2 : VolumeX}
                  libelle={son ? 'Son activé' : 'Silencieux'}
                  onPress={() => {
                    deverrouiller();
                    setSon(!son);
                  }}
                />
              </View>
              {!!erreur && (
                <Text accessibilityRole="alert" style={ts.erreur}>
                  {erreur}
                </Text>
              )}
              <Action icone={Play} libelle={marche && !fini ? 'Lancer un nouveau minuteur' : 'Démarrer'} desactive={!valide} onPress={() => lancer(configure)} />
              <Text style={ts.doux}>
                Gardez l’application au premier plan pour entendre les alertes. La vibration dépend du téléphone. Le temps se recale à votre retour si l’écran a été
                verrouillé.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {remplacer && (
        <Confirmation
          titre="Un minuteur est déjà en cours. Le remplacer ?"
          action="Remplacer"
          onFermer={() => setRemplacer(null)}
          onConfirmer={() => lancer(remplacer, true)}
        />
      )}
    </ContexteMinuteurs.Provider>
  );
}
