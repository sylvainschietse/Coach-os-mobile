// Badges, série et grade côté client : la carte de l'accueil, celle de Progrès, la page qui explique chaque badge
// et la fête quand un nouveau badge tombe (au retour d'une séance, par exemple).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChevronRight, Flame, Lock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Animated, Easing, Modal, Pressable, Text, View } from 'react-native';

import { depot } from '@/data';
import { activites } from '@/data/activites';
import { entrainement } from '@/data/entrainement';
import { quotidien } from '@/data/quotidien';
import { BADGE, BADGES, FAMILLES, GRADES, nouveaux, progression, type CleBadge, type DefinitionBadge, type FamilleBadge, type Progression } from '@/domain/badges';
import { aujourdhuiParis, jourParis } from '@/domain/entrainement';
import { decalerJour } from '@/domain/quotidien';
import { seanceDetaillee } from '@/domain/saisie-apres';
import { useCharger } from '@/lib/useCharger';

import { couleurs, polices } from '../theme';

/** Une couleur par famille de badges. Le texte posé dessus garde un contraste suffisant. */
export const TEINTE: Record<FamilleBadge, { fond: string; texte: string; clair: string }> = {
  regularite: { fond: '#C91D23', texte: '#FFFFFF', clair: '#FFE6E7' },
  progres: { fond: '#F2B630', texte: '#3D2700', clair: '#FFF3D6' },
  programme: { fond: '#2F5BE0', texte: '#FFFFFF', clair: '#E6ECFF' },
  habitudes: { fond: '#6B4BC9', texte: '#FFFFFF', clair: '#EFEAFF' },
};

/** Une activité de moins d'un quart d'heure (une marche vers le bureau) ne compte pas comme une séance. */
const DUREE_MIN_S = 15 * 60;

async function charger(clientId: string): Promise<Progression> {
  const aujourdhui = aujourdhuiParis();
  const [espace, liste, records, releves] = await Promise.all([
    entrainement.espaceClient(clientId),
    activites.liste(clientId, 500).catch(() => []),
    depot.records(clientId).catch(() => []),
    quotidien.releves(clientId, decalerJour(aujourdhui, -60)).catch(() => []),
  ]);
  let tonnageKg = 0;
  for (const r of espace.realisations)
    for (const s of r.series) if (s.valeurs.charge && s.valeurs.repetitions) tonnageKg += s.valeurs.charge * s.valeurs.repetitions;
  const parSemaine = espace.programme?.seancesParSemaine ?? (espace.seances.length || 3);
  return progression({
    aujourdhui,
    seancesProgramme: espace.realisations.map((r) => jourParis(r.debut)),
    activites: liste.filter((a) => a.dureeS >= DUREE_MIN_S).map((a) => jourParis(a.debut)),
    parSemaine,
    nbRecords: records.length,
    tonnageKg,
    cycle: espace.cycle ? { semaine: espace.cycle.semaine, nbSemaines: espace.cycle.nbSemaines } : undefined,
    cycleTermine: espace.planning.some((c) => c.statut === 'Terminé'),
    joursNotes: [...new Set(releves.map((r) => r.jour))],
    seancesDetaillees: espace.realisations.filter((r) => {
      const s = espace.seances.find((x) => x.id === r.seanceId);
      return !!s && seanceDetaillee(s.blocs.flatMap((b) => b.lignes.map((l) => l.id)), r.series);
    }).length,
  });
}

export function useProgression(clientId: string) {
  return useCharger(() => charger(clientId), `badges-${clientId}`);
}

export function PastilleBadge({ def, gagne, taille = 52 }: { def: DefinitionBadge; gagne: boolean; taille?: number }) {
  const t = TEINTE[def.famille];
  return (
    <View
      accessibilityLabel={`${def.nom}${gagne ? ', gagné' : ', pas encore gagné'}`}
      style={{
        width: taille,
        height: taille,
        borderRadius: taille / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: gagne ? t.fond : '#ECEEF2',
        borderWidth: gagne ? 3 : 2,
        borderColor: gagne ? 'rgba(255,255,255,0.55)' : '#CDD1D8',
        borderStyle: gagne ? 'solid' : 'dashed',
      }}
    >
      {gagne ? (
        <Text style={{ fontFamily: polices.titre, fontSize: taille * 0.36, color: t.texte, letterSpacing: 0.5 }}>{def.sigle}</Text>
      ) : (
        <Lock size={taille * 0.32} color="#9EA3AF" />
      )}
    </View>
  );
}

/** Jauge qui se remplit à l'affichage. */
export function Jauge({ part, couleur, fond = 'rgba(255,255,255,0.22)', hauteur = 10 }: { part: number; couleur: string; fond?: string; hauteur?: number }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(v, { toValue: Math.max(0, Math.min(1, part)), duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [part, v]);
  return (
    <View style={{ height: hauteur, borderRadius: hauteur / 2, backgroundColor: fond, overflow: 'hidden' }}>
      <Animated.View style={{ height: hauteur, borderRadius: hauteur / 2, backgroundColor: couleur, width: v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
    </View>
  );
}

const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

/** Accueil : la série en cours et la semaine. Un appui ouvre les badges. */
export function CarteSerie({ clientId, onOuvrir }: { clientId: string; onOuvrir: () => void }) {
  const { donnee: p } = useProgression(clientId);
  if (!p) return null;
  const { faites, objectif } = p.semaine;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ma série : ${pluriel(p.serie, 'semaine')} d’affilée, grade ${p.grade.nom}. Voir mes badges`}
      onPress={onOuvrir}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 14, backgroundColor: '#FFF1DC' }}
    >
      <View style={{ width: 46, height: 46, borderRadius: 14, backgroundColor: '#FFDDA8', alignItems: 'center', justifyContent: 'center' }}>
        <Flame size={26} color="#E07800" fill="#F59E0B" />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 15, color: '#5C3300' }}>
          {p.serie ? `${pluriel(p.serie, 'semaine')} d’affilée` : 'Lance ta série cette semaine'}
          <Text style={{ fontFamily: polices.texte, color: '#8A5A1A' }}> · {p.grade.nom}</Text>
        </Text>
        <Jauge part={faites / objectif} couleur="#F08A00" fond="#FFE2B8" hauteur={8} />
        <Text style={{ fontFamily: polices.texte, fontSize: 12.5, color: '#8A5A1A' }}>
          {faites >= objectif ? 'Semaine complète, bravo !' : `${faites} séance${faites > 1 ? 's' : ''} sur ${objectif} cette semaine`}
        </Text>
      </View>
      <ChevronRight size={20} color="#B07A2A" />
    </Pressable>
  );
}

/** Progrès : le grade, la jauge vers le suivant et les derniers badges. */
export function CarteBadges({ clientId, onOuvrir }: { clientId: string; onOuvrir: () => void }) {
  const { donnee: p } = useProgression(clientId);
  if (!p) return <View style={{ height: 150, borderRadius: 22, backgroundColor: '#1B1D24' }} />;
  const manque = p.suivant ? p.suivant.seuil - p.gagnes.length : 0;
  const part = p.suivant ? (p.gagnes.length - p.grade.seuil) / (p.suivant.seuil - p.grade.seuil) : 1;
  const derniers = BADGES.filter((b) => p.gagnes.includes(b.cle)).slice(-4);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Voir mes badges et mon grade" onPress={onOuvrir} style={{ borderRadius: 22, padding: 16, gap: 12, backgroundColor: '#1B1D24' }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontFamily: polices.texteGras, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: '#FFC85C' }}>Mon grade</Text>
          <Text style={{ fontFamily: polices.titre, fontSize: 32, color: '#FFFFFF', marginTop: 2 }}>{p.grade.nom}</Text>
        </View>
        <Text style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: '#C9CCD3' }}>{pluriel(p.gagnes.length, 'badge')} ›</Text>
      </View>
      <Jauge part={part} couleur="#FFC85C" />
      <Text style={{ fontFamily: polices.texte, fontSize: 13, color: '#C9CCD3' }}>
        {p.suivant ? `Encore ${pluriel(manque, 'badge')} pour passer ${p.suivant.nom}` : 'Tu as atteint le plus haut grade.'}
      </Text>
      {derniers.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {derniers.map((b) => (
            <PastilleBadge key={b.cle} def={b} gagne taille={46} />
          ))}
        </View>
      )}
    </Pressable>
  );
}

/** La page « Mes badges » : les grades, chaque badge et comment le gagner. */
export function MesBadges({ clientId }: { clientId: string }) {
  const { donnee: p, erreur } = useProgression(clientId);
  const [choisi, setChoisi] = useState<CleBadge | null>(null);
  if (erreur) return <Text style={{ fontFamily: polices.texte, color: couleurs.rouge }}>{erreur}</Text>;
  if (!p) return <View style={{ height: 300, borderRadius: 22, backgroundColor: couleurs.discret }} />;
  const def = choisi ? BADGE[choisi] : null;
  const a = choisi ? p.avancement[choisi] : undefined;
  return (
    <View style={{ gap: 14 }}>
      <View style={{ borderRadius: 22, padding: 16, gap: 10, backgroundColor: '#1B1D24' }}>
        <Text style={{ fontFamily: polices.texte, fontSize: 14, lineHeight: 20, color: '#E3E5EA' }}>
          Chaque badge récompense un effort : une séance, une semaine tenue, un record. Plus tu en gagnes, plus ton grade monte. Un badge gagné reste à toi.
        </Text>
        {GRADES.map((g) => {
          const atteint = p.gagnes.length >= g.seuil;
          const actuel = g.nom === p.grade.nom;
          return (
            <View key={g.nom} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 8, borderRadius: 14, backgroundColor: actuel ? 'rgba(255,200,92,0.14)' : undefined }}>
              <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: atteint ? '#FFC85C' : '#2C2F38' }}>
                <Text style={{ fontFamily: polices.titre, fontSize: 18, color: atteint ? '#3D2700' : '#8D919B' }}>{g.seuil}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: polices.texteGras, fontSize: 15, color: atteint ? '#FFFFFF' : '#A4A8B1' }}>{g.nom}</Text>
                <Text style={{ fontFamily: polices.texte, fontSize: 12.5, color: '#A4A8B1' }}>{g.detail}</Text>
              </View>
              {actuel && <Text style={{ fontFamily: polices.texteGras, fontSize: 12, color: '#FFC85C' }}>Toi</Text>}
            </View>
          );
        })}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, padding: 14, backgroundColor: '#FFF1DC' }}>
        <Flame size={22} color="#E07800" fill="#F59E0B" />
        <Text style={{ flex: 1, fontFamily: polices.texte, fontSize: 13.5, lineHeight: 19, color: '#5C3300' }}>
          Série en cours : <Text style={{ fontFamily: polices.texteGras }}>{pluriel(p.serie, 'semaine')}</Text> (ta meilleure : {p.meilleureSerie}). Une semaine
          compliquée ? Tu as un joker par mois, ta série ne s’arrête pas.
        </Text>
      </View>

      {def && (
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', borderRadius: 18, padding: 14, backgroundColor: TEINTE[def.famille].clair }}>
          <PastilleBadge def={def} gagne={p.gagnes.includes(def.cle)} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={{ fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte }}>
              {def.nom} · {p.gagnes.includes(def.cle) ? 'gagné' : 'pas encore'}
            </Text>
            <Text style={{ fontFamily: polices.texte, fontSize: 13.5, lineHeight: 19, color: couleurs.texte }}>{def.comment}</Text>
            {a && !p.gagnes.includes(def.cle) && (
              <Text style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.texteDoux }}>
                Tu en es à {a.fait} sur {a.but}.
              </Text>
            )}
          </View>
        </View>
      )}

      {FAMILLES.map((f) => (
        <View key={f.cle} style={{ borderRadius: 22, padding: 16, gap: 12, backgroundColor: couleurs.carte }}>
          <Text style={{ fontFamily: polices.texteGras, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: f.cle === 'progres' ? '#8A5A00' : TEINTE[f.cle].fond }}>{f.libelle}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {BADGES.filter((b) => b.famille === f.cle).map((b) => (
              <Pressable
                key={b.cle}
                accessibilityRole="button"
                accessibilityLabel={`${b.nom} : ${b.comment}`}
                onPress={() => setChoisi(b.cle)}
                style={{ width: '25%', alignItems: 'center', gap: 6, paddingVertical: 6, borderRadius: 14, backgroundColor: choisi === b.cle ? TEINTE[b.famille].clair : undefined }}
              >
                <PastilleBadge def={b} gagne={p.gagnes.includes(b.cle)} />
                <Text numberOfLines={2} style={{ fontFamily: polices.texteMoyen, fontSize: 11.5, textAlign: 'center', color: couleurs.texte, paddingHorizontal: 2 }}>
                  {b.nom}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <Text style={{ fontFamily: polices.texte, fontSize: 12.5, color: couleurs.texteDoux, textAlign: 'center' }}>Touche un badge pour savoir comment le gagner.</Text>
    </View>
  );
}

const cleVus = (clientId: string) => `coachgo-badges-vus:${clientId}`;

/** Un nouveau badge depuis la dernière visite : il s'affiche en grand, avec son message. */
export function FeteBadges({ clientId }: { clientId: string }) {
  const { donnee: p } = useProgression(clientId);
  const [aFeter, setAFeter] = useState<CleBadge[]>([]);
  const [echelle] = useState(() => new Animated.Value(0.3));

  useEffect(() => {
    if (!p) return;
    let annule = false;
    AsyncStorage.getItem(cleVus(clientId))
      .then((brut) => {
        if (annule) return;
        const vus = brut ? (JSON.parse(brut) as CleBadge[]) : null;
        const n = nouveaux(p.gagnes, vus);
        // Première visite : on note ce qui est déjà gagné, sans tout fêter d'un coup.
        if (!n.length) AsyncStorage.setItem(cleVus(clientId), JSON.stringify(p.gagnes)).catch(() => {});
        setAFeter(n);
      })
      .catch(() => {});
    return () => {
      annule = true;
    };
  }, [p, clientId]);

  const def = aFeter[0] ? BADGE[aFeter[0]] : null;
  useEffect(() => {
    if (!def) return;
    echelle.setValue(0.3);
    Animated.spring(echelle, { toValue: 1, friction: 4, tension: 90, useNativeDriver: true }).start();
  }, [def, echelle]);

  if (!p || !def) return null;
  const suivant = () => {
    const reste = aFeter.slice(1);
    setAFeter(reste);
    if (!reste.length) AsyncStorage.setItem(cleVus(clientId), JSON.stringify(p.gagnes)).catch(() => {});
  };
  return (
    <Modal transparent animationType="fade" visible onRequestClose={suivant}>
      <View style={{ flex: 1, backgroundColor: 'rgba(10,11,14,0.82)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 380, borderRadius: 28, padding: 24, gap: 14, alignItems: 'center', backgroundColor: '#1B1D24' }}>
          <Text style={{ fontFamily: polices.texteGras, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', color: '#FFC85C' }}>Nouveau badge</Text>
          <Animated.View style={{ transform: [{ scale: echelle }] }}>
            <PastilleBadge def={def} gagne taille={128} />
          </Animated.View>
          <Text accessibilityRole="header" style={{ fontFamily: polices.titre, fontSize: 36, color: '#FFFFFF', textAlign: 'center' }}>
            {def.nom}
          </Text>
          <Text style={{ fontFamily: polices.texte, fontSize: 16, lineHeight: 23, color: '#E3E5EA', textAlign: 'center' }}>{def.bravo}</Text>
          <Text style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: '#A4A8B1' }}>
            Grade : {p.grade.nom} · {pluriel(p.gagnes.length, 'badge')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={suivant}
            style={{ alignSelf: 'stretch', minHeight: 52, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}
          >
            <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: '#B3161C' }}>{aFeter.length > 1 ? 'Badge suivant' : 'Super !'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
