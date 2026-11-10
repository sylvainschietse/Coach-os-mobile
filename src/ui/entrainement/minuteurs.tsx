// Le minuteur du client, ouvert depuis l'en-tête ou l'onglet Programme : formats tout prêts (Tabata, EMOM, AMRAP…),
// ses formats enregistrés (nommés, renommés, relancés d'un appui) et le son (sonnerie au choix, décompte avant départ,
// bips 3, 2, 1). En cours, il passe en plein écran ; fermé, une mini-barre reste au-dessus des onglets. Le repos entre
// les séries d'une séance passe par le même minuteur. Le minuteur en cours reste sur l'appareil.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { ChevronLeft, MoreHorizontal, Pause, Play, Plus, RotateCcw, Timer, Volume2, X } from 'lucide-react-native';
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { enregistrerFormat, formatsLocaux, garderSonPrefere, lireSonPrefere, listerFormats, supprimerFormat } from '@/data/formats-minuteur';
import {
  CHAMPS,
  compiler,
  dureeTotale,
  etatA,
  FORMATS,
  horloge,
  infoFormat,
  lireReglage,
  lireSon,
  NOMS_SONNERIES,
  resume,
  resumeSon,
  SON_DEFAUT,
  type Champ,
  type FormatEnregistre,
  type Phase,
  type Reglage,
  type Son,
  type Sonnerie,
} from '@/domain/formats-minuteur';
import { nouvelId } from '@/lib/identifiant';
import { annulerSonneries, ecouter, jouer, preparerSons, programmerAlertes, useSignauxMinuteur } from '@/lib/sons-minuteur';
import { maintenantMs } from '@/lib/temps';

import { BoutonIcone } from '../coque';
import { couleurs, polices, univers } from '../theme';
import { Action, Confirmation, ts } from './commun';

interface Contexte {
  actif: boolean;
  ouvrir: () => void;
  repos: (secondes: number, libelle: string) => void;
}
const ContexteMinuteurs = createContext<Contexte | null>(null);
export const useMinuteurs = () => useContext(ContexteMinuteurs);

/** En haut de l'onglet Programme. */
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
      <Text style={[ts.texte, { fontFamily: polices.texteMoyen }]}>Minuteurs · Tabata, EMOM, AMRAP…</Text>
    </Pressable>
  );
}

/** Bouton de l'en-tête. */
export function LanceurMinuteurs() {
  const m = useMinuteurs();
  return m ? <BoutonIcone icone={Timer} nom="Ouvrir les minuteurs" onPress={m.ouvrir} /> : null;
}

interface Marche {
  reglage: Reglage;
  son: Son;
  nom: string;
  statut: 'running' | 'paused' | 'done';
  ecouleMs: number;
  departLe: number;
  alertes: string[];
  /** AMRAP : tours comptés par le client. */
  tours: number;
}

function relireMarche(brut: unknown, maintenant: number): Marche | null {
  if (!brut || typeof brut !== 'object') return null;
  const m = brut as Partial<Marche>;
  const reglage = lireReglage(m.reglage);
  if (!reglage || !['running', 'paused', 'done'].includes(m.statut ?? '') || !Number.isFinite(m.ecouleMs) || !Number.isFinite(m.departLe)) return null;
  const son = lireSon(m.son);
  const marche: Marche = {
    reglage,
    son,
    nom: typeof m.nom === 'string' ? m.nom.slice(0, 60) : '',
    statut: m.statut!,
    ecouleMs: Math.max(0, m.ecouleMs!),
    departLe: m.departLe!,
    alertes: Array.isArray(m.alertes) ? m.alertes.filter((x) => typeof x === 'string') : [],
    tours: Number.isInteger(m.tours) ? m.tours! : 0,
  };
  return ecouleS(marche, maintenant) >= dureeTotale(compiler(reglage, son)) ? { ...marche, statut: 'done' } : marche;
}

const ecouleS = (m: Marche, maintenant: number) => (m.ecouleMs + (m.statut === 'running' ? Math.max(0, maintenant - m.departLe) : 0)) / 1000;

const SCENE = { backgroundColor: '#121318', backgroundImage: univers.rouge.scene };
const C = { carte: '#1F2027', carte2: '#272932', trait: '#33353F', texte: '#F4F4F6', doux: '#A1A4AF', rouge: '#D9252B', kicker: '#FF7A7E', vert: '#3BC17A' };
const SONNERIES = Object.keys(NOMS_SONNERIES) as Sonnerie[];

type Vue = { ecran: 'liste' } | { ecran: 'reglage'; edition?: FormatEnregistre };

export function Minuteurs({ utilisateurId, children }: { utilisateurId: string; children: ReactNode }) {
  const cle = `coachos-minuteur:${utilisateurId}`;
  const [marche, setMarche] = useState<Marche | null>(null);
  const [maintenant, setMaintenant] = useState(maintenantMs);
  const [ouvert, setOuvert] = useState(false);
  const [vue, setVue] = useState<Vue>({ ecran: 'liste' });
  const [reglage, setReglage] = useState<Reglage>(FORMATS[0].defaut);
  const [son, setSon] = useState<Son>(SON_DEFAUT);
  const [formats, setFormats] = useState<FormatEnregistre[]>([]);
  const [nommer, setNommer] = useState<{ nom: string; erreur?: string; occupe?: boolean } | null>(null);
  const [actionsDe, setActionsDe] = useState<FormatEnregistre | null>(null);
  const [renommer, setRenommer] = useState<{ format: FormatEnregistre; nom: string } | null>(null);
  const [supprimer, setSupprimer] = useState<FormatEnregistre | null>(null);
  const [remplacer, setRemplacer] = useState<{ reglage: Reglage; son: Son; nom: string } | null>(null);
  const [charge, setCharge] = useState(false);
  const [message, setMessage] = useState('');

  // Minuteur en cours, son préféré et formats relus à l'ouverture de l'espace.
  useEffect(() => {
    let annule = false;
    (async () => {
      const [brut, prefere, locaux] = await Promise.all([AsyncStorage.getItem(cle).catch(() => null), lireSonPrefere(), formatsLocaux(utilisateurId)]);
      if (annule) return;
      setSon(prefere);
      setFormats(locaux);
      try {
        const m = relireMarche(brut ? JSON.parse(brut) : null, maintenantMs());
        if (m) setMarche(m);
      } catch {
        // Minuteur illisible : on repart de zéro.
      }
      setCharge(true);
      const distants = await listerFormats(utilisateurId).catch(() => null);
      if (!annule && distants) setFormats(distants);
    })();
    return () => {
      annule = true;
    };
  }, [cle, utilisateurId]);

  useEffect(() => {
    if (charge) AsyncStorage.setItem(cle, JSON.stringify(marche)).catch(() => {});
  }, [charge, cle, marche]);

  const enCours = marche?.statut === 'running';
  useEffect(() => {
    if (!enCours) return;
    const t = setInterval(() => {
      const n = maintenantMs();
      setMaintenant(n);
      // Fin du minuteur : il s'arrête et reste affiché « Terminé ».
      setMarche((m) => {
        if (m?.statut !== 'running') return m;
        const total = dureeTotale(compiler(m.reglage, m.son));
        return ecouleS(m, n) >= total ? { ...m, statut: 'done', ecouleMs: total * 1000, alertes: [] } : m;
      });
    }, 100);
    activateKeepAwakeAsync('minuteurs').catch(() => {});
    return () => {
      clearInterval(t);
      deactivateKeepAwake('minuteurs').catch(() => {});
    };
  }, [enCours]);

  const phases = useMemo(() => (marche ? compiler(marche.reglage, marche.son) : []), [marche?.reglage, marche?.son]); // eslint-disable-line react-hooks/exhaustive-deps
  const temps = marche ? ecouleS(marche, enCours ? Math.max(maintenant, marche.departLe) : maintenant) : 0;
  const etat = marche ? etatA(phases, temps) : null;
  const fini = !!marche && (marche.statut === 'done' || etat?.statut === 'termine');
  // Terminé compte aussi : la sonnerie finale part quand le minuteur passe à « Terminé ».
  useSignauxMinuteur(phases, marche?.son ?? SON_DEFAUT, marche && marche.statut !== 'paused' ? temps : null);


  /** plein : passe en plein écran ; le repos lancé depuis une séance reste en mini-barre. */
  const demarrer = async (r: Reglage, s: Son, nom: string, force = false, plein = true) => {
    if (marche && !fini && !force) return setRemplacer({ reglage: r, son: s, nom });
    preparerSons();
    if (marche) annulerSonneries(marche.alertes);
    const ph = compiler(r, s);
    if (!ph.some((p) => p.type === 'preparation')) jouer(s.sonnerie);
    const n = maintenantMs();
    setMaintenant(n);
    setMarche({ reglage: r, son: s, nom, statut: 'running', ecouleMs: 0, departLe: n, alertes: [], tours: 0 });
    setOuvert(plein);
    const ids = await programmerAlertes(ph, s, 0);
    setMarche((m) => (m && m.departLe === n ? { ...m, alertes: ids.filter((x): x is string => !!x) } : m));
  };

  const basculer = async () => {
    if (!marche || fini) return;
    const n = maintenantMs();
    setMaintenant(n);
    if (marche.statut === 'running') {
      annulerSonneries(marche.alertes);
      setMarche({ ...marche, statut: 'paused', ecouleMs: ecouleS(marche, n) * 1000, departLe: n, alertes: [] });
    } else {
      preparerSons();
      setMarche({ ...marche, statut: 'running', departLe: n, alertes: [] });
      const ids = await programmerAlertes(phases, marche.son, marche.ecouleMs / 1000);
      setMarche((m) => (m && m.departLe === n ? { ...m, alertes: ids.filter((x): x is string => !!x) } : m));
    }
  };

  const arreter = () => {
    if (marche) annulerSonneries(marche.alertes);
    setMarche(null);
  };

  const lancerRef = useRef(demarrer);
  const sonRef = useRef(son);
  useEffect(() => {
    lancerRef.current = demarrer;
    sonRef.current = son;
  });
  const contexte = useMemo<Contexte>(
    () => ({
      actif: !!marche,
      ouvrir: () => {
        setMessage('');
        setVue({ ecran: 'liste' });
        setOuvert(true);
      },
      repos: (secondes, libelle) =>
        lancerRef.current(
          { ...infoFormat('repos').defaut, dureeS: Math.min(3600, Math.max(1, Math.round(secondes))) },
          { ...sonRef.current, preparationS: 0 },
          libelle.slice(0, 60) || 'Repos',
          false,
          false,
        ),
    }),
    [marche],
  );

  const changerSon = (s: Son) => {
    setSon(s);
    garderSonPrefere(s);
  };

  const ouvrirFormat = (r: Reglage, edition?: FormatEnregistre) => {
    setReglage(r);
    if (edition) setSon(edition.son);
    setMessage('');
    setVue({ ecran: 'reglage', edition });
  };

  const sauver = async (f: FormatEnregistre) => {
    const liste = await enregistrerFormat(utilisateurId, f);
    setFormats(liste);
  };

  const enregistrer = async () => {
    if (!nommer) return;
    const nom = nommer.nom.trim();
    if (!nom) return setNommer({ ...nommer, erreur: 'Donne un nom à ton format.' });
    setNommer({ ...nommer, occupe: true, erreur: undefined });
    const edition = vue.ecran === 'reglage' ? vue.edition : undefined;
    try {
      const f = { id: edition?.id ?? nouvelId(), nom, reglage, son, majLe: '' };
      await sauver(f);
      setNommer(null);
      setVue({ ecran: 'reglage', edition: { ...f, majLe: new Date().toISOString() } });
      setMessage(`« ${nom} » est enregistré dans Mes formats.`);
    } catch (e) {
      setNommer({ ...nommer, occupe: false, erreur: e instanceof Error ? e.message : 'Enregistrement impossible' });
    }
  };

  const enPause = marche?.statut === 'paused' && !fini;
  const titre = etat?.statut !== 'en_cours' || fini ? 'Terminé' : etat.phase.type === 'preparation' ? 'Prêt ?' : etat.phase.type === 'travail' ? 'Travail' : 'Repos';
  const affiche = etat?.statut === 'en_cours' ? (etat.phase.montant ? Math.floor(etat.ecouleDansPhaseS) : Math.ceil(etat.restantS)) : 0;

  return (
    <ContexteMinuteurs.Provider value={contexte}>
      <View style={{ flex: 1 }}>
        {children}
        {marche && etat && !ouvert && (
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
                {marche.nom || resume(marche.reglage)}
              </Text>
              <Text numberOfLines={1} style={[ts.texte, { fontFamily: polices.texteGras, color: etat.statut === 'en_cours' && etat.phase.type === 'travail' ? couleurs.rouge : couleurs.texte }]}>
                {enPause ? `En pause · ${titre}` : titre}
                {'  '}
                <Text role="timer" style={{ fontFamily: polices.chiffres, fontSize: 22 }}>
                  {horloge(affiche)}
                </Text>
              </Text>
            </Pressable>
            {!fini && <Action variante="contour" icone={enCours ? Pause : Play} nom={enCours ? 'Mettre en pause' : 'Reprendre'} onPress={basculer} />}
            <Action variante="fantome" icone={X} nom="Arrêter et fermer le minuteur" onPress={arreter} />
          </View>
        )}
      </View>

      <Modal visible={ouvert} animationType="slide" onRequestClose={() => setOuvert(false)}>
        {marche && etat ? (
          <EnCours
            marche={marche}
            phases={phases}
            titre={titre}
            affiche={affiche}
            fini={fini}
            enPause={enPause}
            etatPhase={etat.statut === 'en_cours' ? etat.phase : null}
            onBasculer={basculer}
            onRecommencer={() => demarrer(marche.reglage, marche.son, marche.nom, true)}
            onArreter={arreter}
            onReduire={() => setOuvert(false)}
            onTour={(d) => setMarche((m) => (m ? { ...m, tours: Math.max(0, m.tours + d) } : m))}
          />
        ) : vue.ecran === 'liste' ? (
          <Liste
            formats={formats}
            onFermer={() => setOuvert(false)}
            onNouveau={(r) => ouvrirFormat(r)}
            onLancer={(f) => demarrer(f.reglage, f.son, f.nom)}
            onActions={setActionsDe}
          />
        ) : (
          <Reglages
            reglage={reglage}
            son={son}
            edition={vue.edition}
            message={message}
            onReglage={setReglage}
            onSon={changerSon}
            onRetour={() => setVue({ ecran: 'liste' })}
            onDemarrer={() => demarrer(reglage, son, vue.edition?.nom ?? '')}
            onEnregistrer={() => setNommer({ nom: vue.edition?.nom ?? '' })}
          />
        )}

        {nommer && (
          <Feuille titre={vue.ecran === 'reglage' && vue.edition ? 'Mettre à jour ce format' : 'Enregistrer ce format'} onFermer={() => setNommer(null)}>
            <Text style={s.doux}>Nom</Text>
            <TextInput
              autoFocus
              value={nommer.nom}
              maxLength={60}
              placeholder="Abdos du mardi"
              placeholderTextColor={C.doux}
              onChangeText={(nom) => setNommer({ ...nommer, nom, erreur: undefined })}
              onSubmitEditing={enregistrer}
              style={s.champ}
              accessibilityLabel="Nom du format"
            />
            <Text style={s.doux}>
              {resume(reglage)} · {horloge(dureeTotale(compiler(reglage, son)))}
              {'\n'}
              {resumeSon(son)}
            </Text>
            {!!nommer.erreur && (
              <Text accessibilityRole="alert" style={s.erreur}>
                {nommer.erreur}
              </Text>
            )}
            <Bouton libelle={nommer.occupe ? 'Enregistrement…' : 'Enregistrer'} onPress={enregistrer} desactive={nommer.occupe} />
            <Bouton libelle="Annuler" contour onPress={() => setNommer(null)} />
          </Feuille>
        )}

        {actionsDe && (
          <Feuille titre={actionsDe.nom} onFermer={() => setActionsDe(null)}>
            <Text style={s.doux}>
              {resume(actionsDe.reglage)} · {resumeSon(actionsDe.son)}
            </Text>
            <Bouton
              libelle="Lancer"
              onPress={() => {
                const f = actionsDe;
                setActionsDe(null);
                demarrer(f.reglage, f.son, f.nom);
              }}
            />
            <Bouton
              libelle="Modifier les réglages"
              contour
              onPress={() => {
                const f = actionsDe;
                setActionsDe(null);
                ouvrirFormat(f.reglage, f);
              }}
            />
            <Bouton
              libelle="Renommer"
              contour
              onPress={() => {
                setRenommer({ format: actionsDe, nom: actionsDe.nom });
                setActionsDe(null);
              }}
            />
            <Bouton
              libelle="Dupliquer"
              contour
              onPress={async () => {
                const f = actionsDe;
                setActionsDe(null);
                await sauver({ ...f, id: nouvelId(), nom: `${f.nom} (copie)`.slice(0, 60) }).catch(() => {});
              }}
            />
            <Bouton
              libelle="Supprimer"
              danger
              onPress={() => {
                setSupprimer(actionsDe);
                setActionsDe(null);
              }}
            />
          </Feuille>
        )}

        {renommer && (
          <Confirmation titre="Renommer le format" action="Renommer" onFermer={() => setRenommer(null)} onConfirmer={() => sauver({ ...renommer.format, nom: renommer.nom })}>
            <TextInput
              autoFocus
              value={renommer.nom}
              maxLength={60}
              onChangeText={(nom) => setRenommer({ ...renommer, nom })}
              style={[s.champ, { backgroundColor: couleurs.carte, color: couleurs.texte, borderColor: couleurs.saisie }]}
              accessibilityLabel="Nouveau nom"
            />
          </Confirmation>
        )}
        {supprimer && (
          <Confirmation
            titre={`Supprimer « ${supprimer.nom} » ?`}
            texte="Le format disparaît de Mes formats, sur tous tes appareils."
            action="Supprimer"
            danger
            onFermer={() => setSupprimer(null)}
            onConfirmer={async () => setFormats(await supprimerFormat(utilisateurId, supprimer.id))}
          />
        )}
        {remplacer && (
          <Confirmation
            titre="Un minuteur est déjà en cours. Le remplacer ?"
            action="Remplacer"
            onFermer={() => setRemplacer(null)}
            onConfirmer={() => demarrer(remplacer.reglage, remplacer.son, remplacer.nom, true)}
          />
        )}
      </Modal>
    </ContexteMinuteurs.Provider>
  );
}

function Plein({ children, scene = true }: { children: ReactNode; scene?: boolean }) {
  const { top, bottom } = useSafeAreaInsets();
  return <View style={[{ flex: 1, paddingTop: top, paddingBottom: bottom }, scene && SCENE]}>{children}</View>;
}

function Liste({
  formats,
  onFermer,
  onNouveau,
  onLancer,
  onActions,
}: {
  formats: FormatEnregistre[];
  onFermer: () => void;
  onNouveau: (r: Reglage) => void;
  onLancer: (f: FormatEnregistre) => void;
  onActions: (f: FormatEnregistre) => void;
}) {
  return (
    <Plein>
      <ScrollView contentContainerStyle={s.page}>
        <View style={s.barre}>
          <Text accessibilityRole="header" style={s.grandTitre}>
            Minuteurs
          </Text>
          <Pressable accessibilityRole="button" onPress={onFermer} hitSlop={12}>
            <Text style={s.lien}>Fermer</Text>
          </Pressable>
        </View>

        <Text style={s.kicker}>Mes formats</Text>
        {formats.length === 0 ? (
          <Text style={s.doux}>Règle un format puis « Enregistrer ce format » : il apparaîtra ici, prêt à relancer d’un appui.</Text>
        ) : (
          formats.map((f) => (
            <View key={f.id} style={s.perso}>
              <Pressable accessibilityRole="button" accessibilityLabel={`Options de ${f.nom}`} onPress={() => onActions(f)} style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={s.nomPerso}>
                  {f.nom}
                </Text>
                <Text numberOfLines={1} style={s.doux}>
                  {resume(f.reglage)} · {horloge(dureeTotale(compiler(f.reglage, f.son)))}
                </Text>
                <Text numberOfLines={1} style={[s.doux, { fontSize: 12 }]}>
                  {resumeSon(f.son)}
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Renommer, modifier ou supprimer ${f.nom}`} onPress={() => onActions(f)} hitSlop={8} style={{ padding: 4 }}>
                <MoreHorizontal size={22} color={C.doux} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Lancer ${f.nom}`} onPress={() => onLancer(f)} style={s.lancer}>
                <Play size={18} color="#FFFFFF" fill="#FFFFFF" />
              </Pressable>
            </View>
          ))
        )}

        <Text style={s.kicker}>Nouveau minuteur</Text>
        <View style={s.grille}>
          {FORMATS.map((f) => (
            <Pressable key={f.cle} accessibilityRole="button" onPress={() => onNouveau(f.defaut)} style={({ pressed }) => [s.format, pressed && { borderColor: C.rouge }]}>
              <Text style={s.nomFormat}>{f.nom}</Text>
              <Text style={[s.doux, { fontSize: 12.5 }]}>{f.quoi}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </Plein>
  );
}

function Reglages({
  reglage,
  son,
  edition,
  message,
  onReglage,
  onSon,
  onRetour,
  onDemarrer,
  onEnregistrer,
}: {
  reglage: Reglage;
  son: Son;
  edition?: FormatEnregistre;
  message: string;
  onReglage: (r: Reglage) => void;
  onSon: (s: Son) => void;
  onRetour: () => void;
  onDemarrer: () => void;
  onEnregistrer: () => void;
}) {
  const info = infoFormat(reglage.format);
  const total = dureeTotale(compiler(reglage, son));
  return (
    <Plein>
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
        <View style={s.barre}>
          <Pressable accessibilityRole="button" onPress={onRetour} hitSlop={12} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <ChevronLeft size={18} color={C.doux} />
            <Text style={s.lien}>Minuteurs</Text>
          </Pressable>
        </View>
        <View>
          <Text accessibilityRole="header" style={s.grandTitre}>
            {edition?.nom ?? info.nom}
          </Text>
          <Text style={s.doux}>{edition ? info.nom : info.quoi}</Text>
        </View>

        {CHAMPS[reglage.format].map((c) => (
          <Reglette key={c.cle} champ={c} valeur={reglage[c.cle]} onChange={(v) => onReglage({ ...reglage, [c.cle]: v, ...(c.cle === 'travailS' && reglage.sommetS < v ? { sommetS: v } : {}) })} />
        ))}

        <Text style={s.kicker}>Sonnerie</Text>
        <View style={s.sons}>
          {SONNERIES.map((x) => {
            const choisi = son.sonnerie === x;
            return (
              <Pressable
                key={x}
                accessibilityRole="button"
                accessibilityState={{ selected: choisi }}
                accessibilityHint="Fait entendre la sonnerie"
                onPress={() => {
                  onSon({ ...son, sonnerie: x });
                  ecouter(x);
                }}
                style={[s.puceSon, choisi && { backgroundColor: C.rouge, borderColor: C.rouge }]}
              >
                {x !== 'vibreur' && <Volume2 size={14} color="#FFFFFF" />}
                <Text style={s.textePuce}>{NOMS_SONNERIES[x]}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={s.ligne}>
          <Text style={s.libelle}>Décompte avant départ</Text>
          <View style={s.choix}>
            {([0, 3, 5, 10] as const).map((v) => (
              <Pressable
                key={v}
                accessibilityRole="button"
                accessibilityState={{ selected: son.preparationS === v }}
                onPress={() => onSon({ ...son, preparationS: v })}
                style={[s.option, son.preparationS === v && { backgroundColor: C.texte }]}
              >
                <Text style={[s.texteOption, son.preparationS === v && { color: '#111216', fontFamily: polices.texteGras }]}>{v ? `${v} s` : 'Non'}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Interrupteur libelle="Bips 3, 2, 1 avant la fin" aide="de chaque phase de travail" valeur={son.bipsTravail} onChange={(v) => onSon({ ...son, bipsTravail: v })} />
        <Interrupteur libelle="Bips 3, 2, 1 avant la fin" aide="de chaque repos" valeur={son.bipsRepos} onChange={(v) => onSon({ ...son, bipsRepos: v })} />
        <Interrupteur libelle="Vibrer aussi" valeur={son.vibrer} onChange={(v) => onSon({ ...son, vibrer: v })} />

        <Text style={[s.doux, { textAlign: 'center' }]}>
          Durée totale <Text style={{ fontFamily: polices.chiffres, color: C.texte }}>{horloge(total)}</Text>
        </Text>
        {!!message && (
          <Text accessibilityRole="alert" style={[s.doux, { color: C.vert, textAlign: 'center' }]}>
            {message}
          </Text>
        )}
        <Bouton libelle="Démarrer" onPress={onDemarrer} />
        <Bouton libelle={edition ? 'Mettre à jour ce format' : 'Enregistrer ce format'} contour onPress={onEnregistrer} />
        <Text style={[s.doux, { fontSize: 12.5, textAlign: 'center' }]}>
          Écran verrouillé ou sur une autre appli, la sonnerie et les bips passent par les notifications : autorise-les quand le téléphone le demande. En mode Ne
          pas déranger, elles restent muettes.
        </Text>
      </ScrollView>
    </Plein>
  );
}

function EnCours({
  marche,
  phases,
  titre,
  affiche,
  fini,
  enPause,
  etatPhase,
  onBasculer,
  onRecommencer,
  onArreter,
  onReduire,
  onTour,
}: {
  marche: Marche;
  phases: Phase[];
  titre: string;
  affiche: number;
  fini: boolean;
  enPause: boolean;
  etatPhase: Phase | null;
  onBasculer: () => void;
  onRecommencer: () => void;
  onArreter: () => void;
  onReduire: () => void;
  onTour: (d: number) => void;
}) {
  const r = marche.reglage;
  const type = fini ? 'fin' : (etatPhase?.type ?? 'fin');
  const fond =
    type === 'travail'
      ? { backgroundColor: '#B3161C', backgroundImage: 'radial-gradient(circle at 50% 0%, #F03A40 0%, #B3161C 70%)' }
      : type === 'repos'
        ? { backgroundColor: '#1D232E', backgroundImage: 'radial-gradient(circle at 50% 0%, #2F3D52 0%, #1D232E 75%)' }
        : { backgroundColor: '#1B1C21', backgroundImage: 'radial-gradient(circle at 50% 0%, #3A3B44 0%, #1B1C21 75%)' };
  const travaux = phases.filter((p) => p.type === 'travail');
  const detail = (() => {
    if (fini) return r.format === 'amrap' ? `${marche.tours} tour${marche.tours > 1 ? 's' : ''} faits` : 'Bravo, minuteur terminé';
    if (!etatPhase) return '';
    if (etatPhase.type === 'preparation') return resume(r);
    if (r.format === 'tabata' || r.format === 'intervalles')
      return `Intervalle ${etatPhase.exercice}/${r.exercices}${r.tours > 1 ? ` · Tour ${etatPhase.tour}/${r.tours}` : ''}`;
    if (r.format === 'emom') return `Minute ${etatPhase.tour}/${r.tours}`;
    if (r.format === 'pyramide') return `Palier ${etatPhase.exercice}/${travaux.length}`;
    if (r.format === 'fortime') return `Temps limite ${horloge(r.dureeS)}`;
    return marche.nom || infoFormat(r.format).nom;
  })();
  const derniers = !fini && etatPhase && !etatPhase.montant && affiche <= 3 && affiche >= 1;
  return (
    <Plein scene={false}>
      <View style={[{ flex: 1 }, fond]}>
        <View style={[s.barre, { paddingHorizontal: 16, paddingTop: 12 }]}>
          <Pressable accessibilityRole="button" onPress={onReduire} hitSlop={12} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <ChevronLeft size={18} color="#FFFFFFCC" />
            <Text style={[s.lien, { color: '#FFFFFFCC' }]}>Réduire</Text>
          </Pressable>
          <Text numberOfLines={1} style={[s.lien, { color: '#FFFFFFCC', flexShrink: 1 }]}>
            {marche.nom || infoFormat(r.format).nom}
          </Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 }}>
          <Text accessibilityLiveRegion="polite" style={s.phase}>
            {enPause ? `Pause · ${titre}` : titre}
          </Text>
          <Text role="timer" style={[s.compte, derniers && { transform: [{ scale: 1.08 }] }]}>
            {horloge(affiche)}
          </Text>
          <View style={{ flexDirection: 'row', gap: 10, height: 14 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[3, 2, 1].map((n) => (
              <View key={n} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: derniers && affiche <= n ? '#FFFFFF' : '#FFFFFF33' }} />
            ))}
          </View>
          <Text style={s.detail}>{detail}</Text>
          {r.format === 'amrap' && !fini && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Retirer un tour" onPress={() => onTour(-1)} style={s.rond}>
                <Text style={s.texteRond}>−</Text>
              </Pressable>
              <Text style={[s.detail, { minWidth: 110, textAlign: 'center' }]}>
                {marche.tours} tour{marche.tours > 1 ? 's' : ''}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Ajouter un tour" onPress={() => onTour(1)} style={[s.rond, { backgroundColor: '#FFFFFF' }]}>
                <Plus size={22} color="#B3161C" />
              </Pressable>
            </View>
          )}
        </View>
        <View style={{ padding: 24, gap: 10, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          {!fini && <Bouton libelle={enPause ? 'Reprendre' : 'Pause'} blanc onPress={onBasculer} icone={enPause ? Play : Pause} />}
          {fini && <Bouton libelle="Recommencer" blanc onPress={onRecommencer} icone={RotateCcw} />}
          <Bouton libelle={fini ? 'Fermer' : 'Arrêter'} contour onPress={onArreter} />
        </View>
      </View>
    </Plein>
  );
}

function Reglette({ champ, valeur, onChange }: { champ: Champ; valeur: number; onChange: (v: number) => void }) {
  const borne = (v: number) => Math.min(champ.max, Math.max(champ.min, v));
  return (
    <View style={s.ligne}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.libelle}>{champ.libelle}</Text>
        {!!champ.aide && <Text style={[s.doux, { fontSize: 12 }]}>{champ.aide}</Text>}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`${champ.libelle} : moins`} onPress={() => onChange(borne(valeur - champ.pas))} style={s.pas}>
        <Text style={s.textePas}>−</Text>
      </Pressable>
      <Text style={s.valeur}>{champ.temps ? horloge(valeur) : valeur}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${champ.libelle} : plus`} onPress={() => onChange(borne(valeur + champ.pas))} style={s.pas}>
        <Text style={s.textePas}>+</Text>
      </Pressable>
    </View>
  );
}

function Interrupteur({ libelle, aide, valeur, onChange }: { libelle: string; aide?: string; valeur: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: valeur }} accessibilityLabel={aide ? `${libelle} ${aide}` : libelle} onPress={() => onChange(!valeur)} style={s.ligne}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.libelle}>{libelle}</Text>
        {!!aide && <Text style={[s.doux, { fontSize: 12 }]}>{aide}</Text>}
      </View>
      <View style={[s.bascule, valeur && { backgroundColor: C.vert }]}>
        <View style={[s.pastille, valeur && { transform: [{ translateX: 18 }], backgroundColor: '#FFFFFF' }]} />
      </View>
    </Pressable>
  );
}

function Bouton({
  libelle,
  onPress,
  contour,
  blanc,
  danger,
  desactive,
  icone: Icone,
}: {
  libelle: string;
  onPress: () => void;
  contour?: boolean;
  blanc?: boolean;
  danger?: boolean;
  desactive?: boolean;
  icone?: typeof Play;
}) {
  const couleur = blanc ? '#B3161C' : danger ? '#FF7A7E' : '#FFFFFF';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!desactive }}
      disabled={desactive}
      onPress={onPress}
      style={({ pressed }) => [
        s.bouton,
        contour || danger ? { borderWidth: 1, borderColor: blanc ? '#FFFFFF' : '#FFFFFF40' } : blanc ? { backgroundColor: '#FFFFFF' } : { backgroundColor: C.rouge, backgroundImage: univers.rouge.degrade },
        (pressed || desactive) && { opacity: 0.75 },
      ]}
    >
      {Icone && <Icone size={18} color={couleur} />}
      <Text style={[s.texteBouton, { color: couleur }]}>{libelle}</Text>
    </Pressable>
  );
}

function Feuille({ titre, onFermer, children }: { titre: string; onFermer: () => void; children: ReactNode }) {
  const { bottom } = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onFermer}>
      <Pressable accessibilityLabel="Fermer" onPress={onFermer} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} />
      <View style={[s.feuille, { paddingBottom: 18 + bottom }]}>
        <Text accessibilityRole="header" style={[s.grandTitre, { fontSize: 26 }]}>
          {titre}
        </Text>
        {children}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  page: { padding: 16, gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center', paddingBottom: 40 },
  barre: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 40 },
  grandTitre: { fontFamily: polices.titre, fontSize: 34, letterSpacing: 1.2, color: C.texte },
  lien: { fontFamily: polices.texteMoyen, fontSize: 15, color: C.doux },
  kicker: { fontFamily: polices.texteGras, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: C.kicker, marginTop: 8 },
  doux: { fontFamily: polices.texte, fontSize: 13.5, color: C.doux, lineHeight: 19 },
  erreur: { fontFamily: polices.texteMoyen, fontSize: 14, color: '#FF7A7E' },
  perso: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.carte, borderWidth: 1, borderColor: C.trait, borderRadius: 14, padding: 12 },
  nomPerso: { fontFamily: polices.texteGras, fontSize: 16, color: C.texte },
  lancer: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.rouge, alignItems: 'center', justifyContent: 'center' },
  grille: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  format: { flexBasis: '46%', flexGrow: 1, backgroundColor: C.carte, borderWidth: 1, borderColor: C.trait, borderRadius: 14, padding: 12, gap: 4, minHeight: 84 },
  nomFormat: { fontFamily: polices.titre, fontSize: 24, letterSpacing: 0.8, color: C.texte },
  ligne: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.carte, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 56 },
  libelle: { fontFamily: polices.texteMoyen, fontSize: 15, color: C.texte },
  pas: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.carte2, alignItems: 'center', justifyContent: 'center' },
  textePas: { fontSize: 22, fontFamily: polices.texteGras, color: C.texte },
  valeur: { width: 62, textAlign: 'center', fontFamily: polices.chiffres, fontSize: 17, color: C.texte, fontVariant: ['tabular-nums'] },
  sons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  puceSon: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.trait, backgroundColor: C.carte, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, minHeight: 40 },
  textePuce: { fontFamily: polices.texteMoyen, fontSize: 14, color: C.texte },
  choix: { flexDirection: 'row', gap: 4, backgroundColor: C.carte2, padding: 3, borderRadius: 10 },
  option: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 8, minWidth: 40, alignItems: 'center' },
  texteOption: { fontFamily: polices.texteMoyen, fontSize: 13.5, color: C.doux },
  bascule: { width: 44, height: 26, borderRadius: 13, backgroundColor: C.carte2, padding: 4 },
  pastille: { width: 18, height: 18, borderRadius: 9, backgroundColor: C.doux },
  bouton: { minHeight: 52, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  texteBouton: { fontFamily: polices.texteGras, fontSize: 16 },
  feuille: { backgroundColor: '#15161B', borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTopWidth: 1, borderColor: C.trait, padding: 18, gap: 10, width: '100%', maxWidth: 560, alignSelf: 'center' },
  champ: { backgroundColor: C.carte, borderWidth: 1, borderColor: C.rouge, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontFamily: polices.texte, fontSize: 16, color: C.texte },
  phase: { fontFamily: polices.titre, fontSize: 52, letterSpacing: 2, color: '#FFFFFF' },
  compte: { fontFamily: polices.chiffres, fontSize: 104, lineHeight: 124, color: '#FFFFFF', fontVariant: ['tabular-nums'] },
  detail: { fontFamily: polices.texteMoyen, fontSize: 18, color: '#FFFFFFCC', textAlign: 'center' },
  rond: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, borderColor: '#FFFFFF66', alignItems: 'center', justifyContent: 'center' },
  texteRond: { fontSize: 26, color: '#FFFFFF', fontFamily: polices.texteGras },
});
