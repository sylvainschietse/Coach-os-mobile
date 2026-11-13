// Séance « sans téléphone » : le client s'entraîne sans rien remplir (chrono et liste des blocs, un coup d'œil suffit),
// puis note sa séance après coup : tout comme prévu en un appui, en la racontant à voix haute (l'IA remplit les séries),
// ou juste « séance faite ». Il relit et valide bloc par bloc avant d'enregistrer. Même brouillon que la séance guidée :
// on peut passer de l'une à l'autre. Une notification le relance s'il oublie de noter.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Check, ChevronLeft, Flag, Mic, PencilLine, RotateCcw, Square, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { entrainement } from '@/data/entrainement';
import { lireSeanceDictee } from '@/data/saisie-apres';
import { prescriptionClient, titreClient } from '@/domain/entrainement';
import type { RealisationLue } from '@/domain/entrainement-etat';
import { MENTIONS, remplirDepuisDictee, type LigneADicter } from '@/domain/saisie-apres';
import { dureeSeance, enTeteBloc, titreBloc, tonnage } from '@/domain/seance-blocs';
import type { Bloc, LignePrescription, Mesure, Seance, Valeurs } from '@/domain/types';
import { ecrireBrouillon, lireBrouillon } from '@/lib/brouillon';
import { annulerAlertes, programmerAlerte } from '@/lib/notifications';
import { maintenantMs } from '@/lib/temps';
import { messageErreur } from '@/lib/useCharger';

import { DefilementClavier } from '../clavier';
import { useDictee } from '../dictee';
import { Jauge, useProgression } from '../motivation/badges';
import { polices } from '../theme';
import { Lueur, nuit, Principal } from './seance-blocs';
import { champsSaisie, invalide, seriesDuBrouillon, validerSeries, vide, type Brouillon, type Champ, type SaisieLibre } from './seance-log';

/** Délai du rappel après le début : une séance dure souvent une heure, on relance une heure plus tard. */
const RAPPEL_S = 2 * 3600;
/** Le ressenti en mots, rangé sur l'échelle de 1 à 10 de la séance guidée. */
const RESSENTIS = [
  { libelle: 'Facile', note: 3 },
  { libelle: 'Bien', note: 5 },
  { libelle: 'Dur', note: 7 },
  { libelle: 'Très dur', note: 8 },
  { libelle: 'Limite', note: 10 },
];

/** La façon de démarrer choisie la dernière fois (guidée ou sans téléphone) : l'accueil la propose en premier. */
export function useModeSeance(clientId: string): ['guidee' | 'libre', (m: 'guidee' | 'libre') => void] {
  const cle = `coachgo-mode-seance:${clientId}`;
  const [mode, setMode] = useState<'guidee' | 'libre'>('guidee');
  useEffect(() => {
    let annule = false;
    AsyncStorage.getItem(cle)
      .then((v) => !annule && (v === 'libre' || v === 'guidee') && setMode(v))
      .catch(() => undefined);
    return () => {
      annule = true;
    };
  }, [cle]);
  const choisir = (m: 'guidee' | 'libre') => {
    setMode(m);
    void AsyncStorage.setItem(cle, m).catch(() => undefined);
  };
  return [mode, choisir];
}

type Statut = 'valide' | 'manque' | 'dicte' | 'prevu';
const STATUTS: Record<Statut, { libelle: string; fond: string; texte: string; bord: string }> = {
  valide: { libelle: 'Validé', fond: nuit.vert, texte: '#06210F', bord: '#1F5135' },
  manque: { libelle: 'Il manque un chiffre', fond: '#F59E0B', texte: '#2A1A00', bord: '#F59E0B' },
  dicte: { libelle: 'Dicté, à valider', fond: '#2F5BD8', texte: '#FFFFFF', bord: '#2F5BD8' },
  prevu: { libelle: 'Comme prévu', fond: '#2A2D36', texte: '#D9DBE0', bord: nuit.bordure },
};

export function SeanceSansTelephone({
  clientId,
  cycleId,
  seance,
  historique,
  planificationId,
  onQuitter,
}: {
  clientId: string;
  cycleId: string;
  seance: Seance;
  historique: RealisationLue[];
  planificationId?: string;
  onQuitter: () => void;
}) {
  const cle = `coachos:brouillon:${clientId}:${cycleId}:${seance.id}`;
  const blocs = useMemo(() => seance.blocs.filter((b) => b.lignes.length), [seance]);
  const lignes = useMemo(() => blocs.flatMap((b) => b.lignes), [blocs]);
  const [d, setD] = useState<Brouillon | null>(null);
  const [fini, setFini] = useState<{ duree: string; tonnes: number; mention: SaisieLibre['mention'] } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState('');
  const verrou = useRef(false);
  const marges = useSafeAreaInsets();

  // Au premier affichage : on reprend la séance en cours, sinon on la démarre et on programme le rappel.
  useEffect(() => {
    let annule = false;
    lireBrouillon<Brouillon>(cle).then(async (b) => {
      if (annule) return;
      if (b?.libre) return setD({ ...vide(), ...b });
      const base: Brouillon = { ...vide(), ...b, libre: { etape: 'pendant' } };
      const url = `/client/seance-libre?seance=${encodeURIComponent(seance.id)}&plan=${encodeURIComponent(planificationId ?? '')}`;
      const rappel = await programmerAlerte(RAPPEL_S, `Alors, cette séance ${titreClient(seance.titre)} ?`, 'Raconte-la-moi en 30 secondes, je remplis tout pour toi.', url).catch(
        () => null,
      );
      if (!annule) setD({ ...base, libre: { ...base.libre!, rappel } });
    });
    return () => {
      annule = true;
    };
  }, [cle, seance.id, seance.titre, planificationId]);

  useEffect(() => {
    if (d && !fini) ecrireBrouillon(cle, d);
  }, [cle, d, fini]);

  const maj = (f: (c: Brouillon) => Brouillon) => {
    setErreur('');
    setD((c) => (c ? f(c) : c));
  };
  const libre = (f: (l: SaisieLibre) => SaisieLibre) => maj((c) => ({ ...c, libre: f(c.libre ?? { etape: 'pendant' }) }));

  /** Dernière séance où cet exercice a des valeurs : la référence « comme prévu » et « la dernière fois ». */
  const precedentes = (l: LignePrescription): Record<number, Valeurs> => {
    const r = historique.find((x) => x.series.some((s) => s.ligneId === l.id && Object.keys(s.valeurs).length));
    const parSerie: Record<number, Valeurs> = {};
    r?.series.filter((s) => s.ligneId === l.id).forEach((s) => (parSerie[s.index + 1] = s.valeurs));
    return parSerie;
  };
  const validerBlocs = (c: Brouillon, bs: Bloc[]): Brouillon =>
    bs.reduce(
      (x, b) => ({ ...b.lignes.reduce((y, l) => validerSeries(y, l, precedentes(l)), x), valides: [...new Set([...(x.valides ?? []), b.id])] }),
      c,
    );

  const enregistrer = async (c: Brouillon, mention: SaisieLibre['mention']) => {
    if (verrou.current) return;
    verrou.current = true;
    setEnvoi(true);
    setErreur('');
    try {
      const fin = c.libre?.finLe ?? new Date().toISOString();
      const series = mention === 'faite' ? [] : seriesDuBrouillon(lignes, c);
      await entrainement.enregistrerRealisation({
        id: c.envoiId,
        clientId,
        seanceId: seance.id,
        cycleId,
        planificationId,
        debut: c.debut,
        fin,
        note: c.note ?? undefined,
        commentaire: [mention ? MENTIONS[mention] : '', c.com.trim()].filter(Boolean).join('\n'),
        series,
      });
      await annulerAlertes([c.libre?.rappel ?? null]).catch(() => undefined);
      ecrireBrouillon(cle, null);
      setFini({ duree: dureeSeance(c.debut, new Date(fin).getTime()), tonnes: mention === 'faite' ? 0 : tonnage(c.vals), mention });
    } catch (e) {
      setErreur(`${messageErreur(e)} Ta séance est gardée sur ce téléphone : réessaie.`);
    }
    verrou.current = false;
    setEnvoi(false);
  };

  if (!d) return <View style={{ flex: 1, backgroundColor: nuit.fond }} />;
  const etape = d.libre?.etape ?? 'pendant';

  return (
    <View style={{ flex: 1, backgroundColor: nuit.fond }}>
      <Lueur couleur={fini ? nuit.vert : nuit.rouge} />
      {fini ? (
        <Fin clientId={clientId} {...fini} marges={marges} onQuitter={onQuitter} />
      ) : etape === 'pendant' ? (
        <Pendant
          seance={seance}
          blocs={blocs}
          debut={d.debut}
          precedentes={precedentes}
          marges={marges}
          onQuitter={onQuitter}
          onFini={() => {
            void annulerAlertes([d.libre?.rappel ?? null]).catch(() => undefined);
            libre((l) => ({ ...l, etape: 'raconter', rappel: null, finLe: new Date().toISOString() }));
          }}
        />
      ) : etape === 'raconter' ? (
        <Raconter
          d={d}
          marges={marges}
          envoi={envoi}
          erreur={erreur}
          onRetour={() => libre((l) => ({ ...l, etape: 'pendant', finLe: undefined }))}
          onNote={(note) => maj((c) => ({ ...c, note: c.note === note ? null : note }))}
          onCommePrevu={() => maj((c) => ({ ...validerBlocs(c, blocs), libre: { ...c.libre!, etape: 'valider', mention: 'prevu' } }))}
          onRaconter={() => libre((l) => ({ ...l, etape: 'dictee' }))}
          onFaite={() => void enregistrer(d, 'faite')}
        />
      ) : etape === 'dictee' ? (
        <Dictee
          seance={seance}
          lignes={lignes}
          d={d}
          marges={marges}
          onRetour={() => libre((l) => ({ ...l, etape: 'raconter' }))}
          onTexte={(texte) => libre((l) => ({ ...l, texte }))}
          onLu={(r) =>
            maj((c) => ({
              ...c,
              vals: { ...c.vals, ...r.vals },
              note: c.note ?? r.note ?? null,
              com: [c.com.trim(), r.commentaire].filter(Boolean).join('\n'),
              valides: [],
              libre: { ...c.libre!, etape: 'valider', mention: 'dictee', dictees: r.dictees, manques: r.manques },
            }))
          }
          onAlaMain={() => libre((l) => ({ ...l, etape: 'valider', mention: l.mention ?? 'dictee' }))}
        />
      ) : (
        <Valider
          blocs={blocs}
          d={d}
          marges={marges}
          envoi={envoi}
          erreur={erreur}
          onRetour={() => libre((l) => ({ ...l, etape: 'raconter' }))}
          onChanger={(k, m, v) => maj((c) => ({ ...c, vals: { ...c.vals, [k]: { ...c.vals[k], [m]: v } } }))}
          onValider={(b) => maj((c) => ({ ...validerBlocs(c, [b]), libre: { ...c.libre!, manques: (c.libre?.manques ?? []).filter((k) => !b.lignes.some((l) => k.startsWith(`${l.id}:`))) } }))}
          onTout={() => {
            const c = validerBlocs(d, blocs);
            setD(c);
            void enregistrer(c, d.libre?.mention ?? 'prevu');
          }}
        />
      )}
    </View>
  );
}

type Marges = { top: number; bottom: number };

function EnTete({ gauche, onGauche, droite, marges }: { gauche: string; onGauche: () => void; droite?: string; marges: Marges }) {
  const Icone = gauche === 'Quitter' ? X : ChevronLeft;
  return (
    <View style={{ paddingTop: marges.top + 10, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Pressable accessibilityRole="button" onPress={onGauche} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 }}>
        <Icone size={18} color="#B7BAC3" />
        <Text style={styles.enTete}>{gauche}</Text>
      </Pressable>
      {!!droite && <Text style={[styles.kicker, { color: nuit.doux }]}>{droite}</Text>}
    </View>
  );
}

function PrincipalLigne(p: Parameters<typeof Principal>[0]) {
  return (
    <View style={{ flexDirection: 'row' }}>
      <Principal {...p} />
    </View>
  );
}

function Pied({ children, marges }: { children: React.ReactNode; marges: Marges }) {
  return <View style={[styles.pied, { paddingBottom: marges.bottom + 14 }]}>{children}</View>;
}

function Pendant({
  seance,
  blocs,
  debut,
  precedentes,
  marges,
  onQuitter,
  onFini,
}: {
  seance: Seance;
  blocs: Bloc[];
  debut: string;
  precedentes: (l: LignePrescription) => Record<number, Valeurs>;
  marges: Marges;
  onQuitter: () => void;
  onFini: () => void;
}) {
  return (
    <>
      <EnTete gauche="Quitter" onGauche={onQuitter} droite="Mode sans téléphone" marges={marges} />
      <DefilementClavier style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 140, gap: 16 }}>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <Text style={styles.kicker}>{titreClient(seance.titre)}</Text>
          <GrandChrono debut={debut} />
          <Text style={styles.doux}>Le chrono tourne, même écran éteint.</Text>
        </View>
        <View style={[styles.carte, { paddingHorizontal: 16, paddingVertical: 4 }]}>
          {blocs.map((b, i) => {
            const derniere = b.lignes.map((l) => precedentes(l)[1]?.charge).find((x) => x !== undefined);
            return (
              <View key={b.id} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderTopColor: nuit.bordure }}>
                <View style={styles.numero}>
                  <Text style={{ fontFamily: polices.texteGras, fontSize: 12, color: '#C9CBD3' }}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.nom}>{titreBloc(b.titre) || b.lignes.map((l) => l.exercice.nom).join(' + ')}</Text>
                  <Text style={styles.doux}>
                    {b.lignes.length === 1 ? prescriptionClient(b.lignes[0]) : enTeteBloc(b)}
                    {derniere !== undefined ? ` · la dernière fois ${String(derniere).replace('.', ',')} kg` : ''}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
        <Text style={[styles.doux, { textAlign: 'center' }]}>Un coup d’œil suffit. Rien à remplir pendant l’effort.</Text>
      </DefilementClavier>
      <Pied marges={marges}>
        <PrincipalLigne libelle="J’ai fini ma séance" onPress={onFini} />
      </Pied>
    </>
  );
}

function GrandChrono({ debut }: { debut: string }) {
  const [maintenant, setMaintenant] = useState(maintenantMs);
  useEffect(() => {
    const t = setInterval(() => setMaintenant(maintenantMs()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((maintenant - new Date(debut).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const texte = `${h ? `${h}:` : ''}${String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')}:${String(s % 60).padStart(2, '0')}`;
  return (
    <Text accessibilityLabel={`Temps écoulé ${texte}`} style={{ fontFamily: polices.titre, fontSize: 88, letterSpacing: 1, color: '#FFFFFF' }}>
      {texte}
    </Text>
  );
}

function Raconter({
  d,
  marges,
  envoi,
  erreur,
  onRetour,
  onNote,
  onCommePrevu,
  onRaconter,
  onFaite,
}: {
  d: Brouillon;
  marges: Marges;
  envoi: boolean;
  erreur: string;
  onRetour: () => void;
  onNote: (n: number) => void;
  onCommePrevu: () => void;
  onRaconter: () => void;
  onFaite: () => void;
}) {
  const [maintenant] = useState(maintenantMs);
  const duree = dureeSeance(d.debut, d.libre?.finLe ? new Date(d.libre.finLe).getTime() : maintenant);
  return (
    <>
      <EnTete gauche="Je n’ai pas fini" onGauche={onRetour} marges={marges} />
      <DefilementClavier style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40, gap: 14 }}>
        <Text style={styles.kicker}>Séance finie · {duree}</Text>
        <Text style={styles.titre}>Comment ça s’est passé ?</Text>
        <Text style={styles.doux}>Choisis le plus rapide pour toi. Tu pourras tout relire avant d’enregistrer.</Text>
        <View style={[styles.carte, { padding: 14, gap: 10 }]}>
          <Text style={[styles.kicker, { color: nuit.doux }]}>Ton ressenti</Text>
          <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 6 }}>
            {RESSENTIS.map((r) => (
              <Pressable
                key={r.note}
                accessibilityRole="radio"
                accessibilityState={{ checked: d.note === r.note }}
                onPress={() => onNote(r.note)}
                style={[styles.ressenti, d.note === r.note && { backgroundColor: nuit.rouge }]}
              >
                <Text style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: '#FFFFFF' }}>{r.libelle}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Choix
          titre="Tout s’est passé comme prévu"
          detail="Un appui : les charges et répétitions prévues sont reprises."
          icone={Check}
          fond="#E8F6EE"
          texte="#0F3D24"
          rond="#1B7A45"
          onPress={onCommePrevu}
        />
        <Choix
          titre="Je raconte à voix haute"
          detail="« Tirage 50 kilos, 10, 10, 8… » L’appli remplit les blocs."
          icone={Mic}
          fond="#FFFFFF"
          texte="#16181D"
          rond={nuit.rouge}
          onPress={onRaconter}
        />
        <Choix
          titre="Juste « séance faite »"
          detail="Elle compte pour ta série. Ton coach verra qu’il manque le détail."
          icone={Flag}
          fond="transparent"
          texte="#FFFFFF"
          rond={nuit.carte}
          contour
          desactive={envoi}
          onPress={onFaite}
        />
        {envoi && <ActivityIndicator color="#FFFFFF" />}
        {!!erreur && (
          <Text accessibilityRole="alert" style={{ fontFamily: polices.texte, fontSize: 13, color: nuit.rougeDoux }}>
            {erreur}
          </Text>
        )}
      </DefilementClavier>
    </>
  );
}

function Choix({
  titre,
  detail,
  icone: Icone,
  fond,
  texte,
  rond,
  contour,
  desactive,
  onPress,
}: {
  titre: string;
  detail: string;
  icone: typeof Check;
  fond: string;
  texte: string;
  rond: string;
  contour?: boolean;
  desactive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!desactive }}
      disabled={desactive}
      onPress={onPress}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 20, padding: 16, backgroundColor: fond },
        contour && { borderWidth: 1, borderColor: '#2F313A' },
        pressed && { opacity: 0.85 },
      ]}
    >
      <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: rond, alignItems: 'center', justifyContent: 'center' }}>
        <Icone size={22} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: texte }}>{titre}</Text>
        <Text style={{ fontFamily: polices.texte, fontSize: 13, color: contour ? nuit.doux : texte, opacity: contour ? 1 : 0.8 }}>{detail}</Text>
      </View>
    </Pressable>
  );
}

function Dictee({
  seance,
  lignes,
  d,
  marges,
  onRetour,
  onTexte,
  onLu,
  onAlaMain,
}: {
  seance: Seance;
  lignes: LignePrescription[];
  d: Brouillon;
  marges: Marges;
  onRetour: () => void;
  onTexte: (t: string) => void;
  onLu: (r: ReturnType<typeof remplirDepuisDictee> & { note?: number; commentaire?: string }) => void;
  onAlaMain: () => void;
}) {
  const texte = d.libre?.texte ?? '';
  const dictee = useDictee(texte, onTexte);
  const [lecture, setLecture] = useState(false);
  const [erreur, setErreur] = useState('');
  const aDicter: LigneADicter[] = lignes.map((l) => ({ id: l.id, nom: l.exercice.nom, series: Math.max(1, l.series), mesures: champsSaisie(l).map((c) => c.m) }));

  const lire = async () => {
    setErreur('');
    setLecture(true);
    try {
      const lu = await lireSeanceDictee(texte, aDicter);
      onLu({ ...remplirDepuisDictee(aDicter, lu), note: lu.note, commentaire: lu.commentaire });
    } catch (e) {
      setErreur(messageErreur(e));
    }
    setLecture(false);
  };

  return (
    <>
      <EnTete gauche="Retour" onGauche={onRetour} droite={titreClient(seance.titre)} marges={marges} />
      <DefilementClavier style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 150, gap: 16 }}>
        {dictee.disponible && (
          <View style={{ alignItems: 'center', gap: 10, paddingTop: 6 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={dictee.ecoute ? 'Arrêter la dictée' : 'Raconter ma séance à voix haute'}
              onPress={dictee.basculer}
              style={({ pressed }) => [styles.micro, dictee.ecoute && { backgroundColor: '#FFFFFF' }, pressed && { opacity: 0.85 }]}
            >
              {dictee.ecoute ? <Square size={34} color={nuit.rouge} fill={nuit.rouge} /> : <Mic size={40} color="#FFFFFF" />}
            </Pressable>
            <Text style={styles.doux}>{dictee.ecoute ? 'Je t’écoute… touche pour arrêter' : 'Touche le micro et raconte ta séance'}</Text>
            {!!dictee.erreur && (
              <Text accessibilityRole="alert" style={{ fontFamily: polices.texte, fontSize: 13, color: nuit.rougeDoux, textAlign: 'center' }}>
                {dictee.erreur}
              </Text>
            )}
          </View>
        )}
        <View style={[styles.carte, { padding: 14, gap: 8 }]}>
          <Text style={[styles.kicker, { color: nuit.doux }]}>{dictee.disponible ? 'Ce que j’ai compris' : 'Raconte ta séance'}</Text>
          <TextInput
            accessibilityLabel="Ce que tu as fait pendant ta séance"
            multiline
            value={texte}
            onChangeText={onTexte}
            placeholder="La mobilité c’était ok. Tirage 50 kilos, 10, 10, 9, 8. Les pompes 12, 10 et 8…"
            placeholderTextColor={nuit.propose}
            style={{ minHeight: 140, fontFamily: polices.texte, fontSize: 15, lineHeight: 22, color: '#FFFFFF', textAlignVertical: 'top' }}
          />
        </View>
        <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: '#3A3C45', borderRadius: 18, padding: 14, gap: 4 }}>
          <Text style={[styles.kicker, { color: nuit.doux }]}>Pour t’aider</Text>
          <Text style={[styles.doux, { color: '#C9CBD3' }]}>
            Dis l’exercice, la charge, puis les répétitions de chaque série. Ce que tu ne dis pas reste comme prévu.
          </Text>
        </View>
        {!!erreur && (
          <View style={{ gap: 8 }}>
            <Text accessibilityRole="alert" style={{ fontFamily: polices.texte, fontSize: 13, color: nuit.rougeDoux }}>
              {erreur}
            </Text>
            <Pressable accessibilityRole="button" onPress={onAlaMain} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ fontFamily: polices.texteMoyen, fontSize: 14, color: '#FFFFFF', textDecorationLine: 'underline' }}>Valider mes blocs à la main</Text>
            </Pressable>
          </View>
        )}
      </DefilementClavier>
      <Pied marges={marges}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Effacer et recommencer" onPress={() => onTexte('')} style={styles.carre}>
            <RotateCcw size={20} color="#FFFFFF" />
          </Pressable>
          <Principal
            libelle={lecture ? 'Je range ta séance…' : 'J’ai fini, remplis mes blocs'}
            desactive={lecture || texte.trim().length < 5 || dictee.ecoute}
            onPress={lire}
          />
        </View>
      </Pied>
    </>
  );
}

const ecritSerie = (champs: Champ[], v: Partial<Record<Mesure, string>> = {}) => {
  const charge = v.charge?.trim();
  const autres = champs.filter((c) => c.m !== 'charge' && v[c.m]?.trim()).map((c) => (c.m === 'repetitions' ? v[c.m] : `${v[c.m]} ${c.unite}`));
  if (!autres.length) return charge ? `${charge} kg` : '';
  return charge && champs.some((c) => c.m === 'repetitions') ? `${charge} kg × ${autres.join(' · ')}` : [charge && `${charge} kg`, ...autres].filter(Boolean).join(' · ');
};

function Valider({
  blocs,
  d,
  marges,
  envoi,
  erreur,
  onRetour,
  onChanger,
  onValider,
  onTout,
}: {
  blocs: Bloc[];
  d: Brouillon;
  marges: Marges;
  envoi: boolean;
  erreur: string;
  onRetour: () => void;
  onChanger: (k: string, m: Mesure, v: string) => void;
  onValider: (b: Bloc) => void;
  onTout: () => void;
}) {
  const [ouvert, setOuvert] = useState<string | null>(null);
  const valides = d.valides ?? [];
  const manques = d.libre?.manques ?? [];
  const dictees = d.libre?.dictees ?? [];
  const statut = (b: Bloc): Statut =>
    valides.includes(b.id)
      ? 'valide'
      : b.lignes.some((l) => manques.some((k) => k.startsWith(`${l.id}:`)))
        ? 'manque'
        : b.lignes.some((l) => dictees.includes(l.id))
          ? 'dicte'
          : 'prevu';
  const fautif = blocs.some((b) => b.lignes.some((l) => champsSaisie(l).some((c) => Array.from({ length: Math.max(1, l.series) }, (_, i) => d.vals[`${l.id}:${i + 1}`]?.[c.m]).some((v) => invalide(c, v)))));

  return (
    <>
      <EnTete gauche="Retour" onGauche={onRetour} marges={marges} />
      <DefilementClavier style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 170, gap: 12 }}>
        <Text style={styles.kicker}>Relis et valide</Text>
        <Text style={styles.titre}>Ta séance, bloc par bloc</Text>
        <View accessibilityRole="progressbar" aria-valuemin={0} aria-valuemax={blocs.length} aria-valuenow={valides.length} style={{ flexDirection: 'row', gap: 6 }}>
          {blocs.map((b) => (
            <View key={b.id} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: valides.includes(b.id) ? nuit.vert : '#3A3C45' }} />
          ))}
        </View>
        {blocs.map((b, i) => {
          const s = statut(b);
          const st = STATUTS[s];
          const edition = ouvert === b.id || s === 'manque';
          return (
            <View
              key={b.id}
              style={[styles.carte, { padding: 14, gap: 10, borderColor: st.bord }, s === 'valide' && { backgroundColor: '#16261C', borderColor: '#1F3828' }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={[styles.nom, { flex: 1 }]} numberOfLines={2}>
                  {i + 1} · {titreBloc(b.titre) || b.lignes.map((l) => l.exercice.nom).join(' + ')}
                </Text>
                <Text style={[styles.statut, { backgroundColor: st.fond, color: st.texte }]}>{st.libelle}</Text>
              </View>
              {b.lignes.map((l) => {
                const champs = champsSaisie(l);
                const series = Array.from({ length: Math.max(1, l.series) }, (_, k) => k + 1);
                const remplies = series.filter((n) => ecritSerie(champs, d.vals[`${l.id}:${n}`]));
                return (
                  <View key={l.id} style={{ gap: 6 }}>
                    {b.lignes.length > 1 && <Text style={[styles.doux, { color: '#D9DBE0' }]}>{l.exercice.nom}</Text>}
                    {edition ? (
                      series.map((n) => {
                        const k = `${l.id}:${n}`;
                        const manque = manques.includes(k);
                        return (
                          <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ width: 26, fontFamily: polices.texteGras, fontSize: 13, color: manque ? '#FCD38A' : nuit.doux }}>S{n}</Text>
                            {champs.map((c) => (
                              <TextInput
                                key={c.m}
                                accessibilityLabel={`${l.exercice.nom}, série ${n}, ${c.titre}`}
                                value={d.vals[k]?.[c.m] ?? ''}
                                onChangeText={(v) => onChanger(k, c.m, v)}
                                keyboardType={c.decimal ? 'decimal-pad' : 'number-pad'}
                                placeholder={c.unite}
                                placeholderTextColor={nuit.propose}
                                style={[styles.champ, manque && !d.vals[k]?.[c.m]?.trim() && c.m !== 'charge' && { borderColor: '#F59E0B', backgroundColor: '#2A1F0B' }]}
                              />
                            ))}
                          </View>
                        );
                      })
                    ) : remplies.length ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                        {remplies.map((n) => (
                          <Text key={n} style={[styles.serie, s === 'valide' && { backgroundColor: '#1F3828' }]}>
                            {ecritSerie(champs, d.vals[`${l.id}:${n}`])}
                          </Text>
                        ))}
                      </View>
                    ) : (
                      <Text style={styles.doux}>Comme prévu : {prescriptionClient(l)}</Text>
                    )}
                  </View>
                );
              })}
              {s === 'manque' && <Text style={styles.doux}>Il manque un chiffre : complète la case orange, ou garde ce qui était prévu.</Text>}
              {s !== 'valide' && (
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {s !== 'manque' && (
                    <Pressable accessibilityRole="button" onPress={() => setOuvert(ouvert === b.id ? null : b.id)} style={[styles.secondaire, { flex: 1 }]}>
                      <PencilLine size={16} color="#FFFFFF" />
                      <Text style={styles.secondaireTexte}>{ouvert === b.id ? 'Fermer' : 'Corriger'}</Text>
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setOuvert(null);
                      onValider(b);
                    }}
                    style={[styles.secondaire, { flex: 1, backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' }]}
                  >
                    <Check size={16} color="#16181D" />
                    <Text style={[styles.secondaireTexte, { color: '#16181D' }]}>{s === 'manque' ? 'Valider, le reste comme prévu' : 'Valider le bloc'}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        })}
      </DefilementClavier>
      <Pied marges={marges}>
        {fautif && (
          <Text accessibilityRole="alert" style={{ fontFamily: polices.texte, fontSize: 12, color: nuit.rougeDoux }}>
            Charge : de 0 à 1 000 kg. Répétitions, durée en secondes et calories : nombres entiers.
          </Text>
        )}
        {!!erreur && (
          <Text accessibilityRole="alert" style={{ fontFamily: polices.texte, fontSize: 13, color: nuit.rougeDoux }}>
            {erreur}
          </Text>
        )}
        <PrincipalLigne libelle={envoi ? 'Enregistrement…' : 'Tout valider et enregistrer'} desactive={envoi || fautif} onPress={onTout} />
        <Text style={[styles.doux, { textAlign: 'center', fontSize: 12 }]}>Ce qui n’est pas encore validé est enregistré comme prévu.</Text>
      </Pied>
    </>
  );
}

function Fin({
  clientId,
  duree,
  tonnes,
  mention,
  marges,
  onQuitter,
}: {
  clientId: string;
  duree: string;
  tonnes: number;
  mention: SaisieLibre['mention'];
  marges: Marges;
  onQuitter: () => void;
}) {
  const { donnee: p } = useProgression(clientId);
  const carnet = p?.avancement.carnet;
  const gagne = p?.gagnes.includes('carnet');
  return (
    <>
      <DefilementClavier style={{ flex: 1 }} contentContainerStyle={{ paddingTop: marges.top + 56, paddingHorizontal: 16, paddingBottom: 140, gap: 16, alignItems: 'center' }}>
        <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: nuit.vert, alignItems: 'center', justifyContent: 'center' }}>
          <Check size={48} color="#06210F" strokeWidth={3} />
        </View>
        <Text style={[styles.kicker, { color: '#86EFAC' }]}>Séance enregistrée</Text>
        <Text style={[styles.titre, { textAlign: 'center' }]}>{mention === 'faite' ? 'Bien joué !' : 'C’est noté, bravo !'}</Text>
        <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'stretch' }}>
          <Stat libelle="Durée" valeur={duree} />
          {tonnes > 0 && <Stat libelle="Charge totale" valeur={tonnes >= 1000 ? `${String(Math.round(tonnes / 100) / 10).replace('.', ',')} t` : `${tonnes} kg`} />}
          {!!p?.serie && <Stat libelle="Série" valeur={`${p.serie} sem.`} />}
        </View>
        {carnet && (
          <View style={[styles.carte, { alignSelf: 'stretch', padding: 16, flexDirection: 'row', gap: 14, alignItems: 'center' }]}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#6B4BC9', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: polices.titre, fontSize: 20, color: '#FFFFFF' }}>{gagne ? '5/5' : `${carnet.fait}/5`}</Text>
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={styles.nom}>Badge « Carnet tenu »</Text>
              <Text style={styles.doux}>
                {gagne
                  ? 'Gagné ! Tes séances notées en entier aident ton coach à ajuster ton programme.'
                  : `Encore ${carnet.but - carnet.fait} séance${carnet.but - carnet.fait > 1 ? 's' : ''} notée${carnet.but - carnet.fait > 1 ? 's' : ''} en entier pour le gagner.`}
              </Text>
              <Jauge part={carnet.fait / carnet.but} couleur="#8B6CF0" hauteur={8} />
            </View>
          </View>
        )}
        <View style={[styles.carte, { alignSelf: 'stretch', padding: 14 }]}>
          <Text style={[styles.doux, { color: '#C9CBD3' }]}>
            {mention === 'faite'
              ? 'Ton coach voit que ta séance est faite, sans le détail. La prochaine fois, raconte-la en 30 secondes : il pourra ajuster tes charges.'
              : mention === 'dictee'
                ? 'Ton coach voit ta séance comme d’habitude, avec la mention « racontée à voix haute ».'
                : 'Ton coach voit ta séance comme d’habitude.'}
          </Text>
        </View>
      </DefilementClavier>
      <Pied marges={marges}>
        <PrincipalLigne libelle="Retour à l’accueil" couleur={nuit.vert} onPress={onQuitter} />
      </Pied>
    </>
  );
}

function Stat({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 12, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontFamily: polices.texte, fontSize: 11, color: nuit.doux }}>{libelle}</Text>
      <Text style={{ fontFamily: polices.texteGras, fontSize: 17, color: '#FFFFFF' }}>{valeur}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  enTete: { fontFamily: polices.texte, fontSize: 14, color: '#B7BAC3' },
  kicker: { fontFamily: polices.texteGras, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: '#FF8A8E' },
  titre: { fontFamily: polices.titre, fontSize: 40, lineHeight: 40, letterSpacing: 0.5, color: '#FFFFFF' },
  doux: { fontFamily: polices.texte, fontSize: 13, lineHeight: 18, color: nuit.doux },
  nom: { fontFamily: polices.texteGras, fontSize: 15.5, color: '#FFFFFF' },
  carte: { backgroundColor: nuit.carte, borderWidth: 1, borderColor: nuit.bordure, borderRadius: 18 },
  numero: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#2A2C34', alignItems: 'center', justifyContent: 'center' },
  ressenti: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: '#2A2C34', alignItems: 'center', justifyContent: 'center' },
  micro: { width: 104, height: 104, borderRadius: 52, backgroundColor: nuit.rouge, alignItems: 'center', justifyContent: 'center' },
  carre: { width: 52, height: 52, borderRadius: 12, borderWidth: 1, borderColor: '#3A3C45', backgroundColor: nuit.carte, alignItems: 'center', justifyContent: 'center' },
  statut: { fontFamily: polices.texteGras, fontSize: 12, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
  serie: { fontFamily: polices.texteMoyen, fontSize: 13, color: '#FFFFFF', backgroundColor: '#2A2C34', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, overflow: 'hidden' },
  champ: {
    flex: 1,
    minWidth: 0,
    height: 44,
    borderWidth: 1,
    borderColor: nuit.bordureChamp,
    backgroundColor: nuit.champ,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontFamily: polices.texte,
    fontSize: 16,
    color: '#FFFFFF',
  },
  secondaire: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: '#3A3C45', backgroundColor: '#2A2C34', flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  secondaireTexte: { fontFamily: polices.texteGras, fontSize: 14, color: '#FFFFFF' },
  pied: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingTop: 12, gap: 8, backgroundColor: 'rgba(14,15,19,0.96)', borderTopWidth: 1, borderTopColor: '#1E2027' },
});
