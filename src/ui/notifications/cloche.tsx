// Cloche du menu du haut : les dernières alertes (séance faite, séance acceptée, paiement, bilan…), avec une pastille
// pour celles pas encore vues. Toucher une alerte la marque lue et ouvre la page qu'elle annonce.
// Côté client, elle montre aussi en tête ce qui reste à faire aujourd'hui (séance prévue, repas, bilan) : ces
// rappels ne sont pas stockés, ils disparaissent dès que la chose est faite.
import { router } from 'expo-router';
import {
  Bell,
  CalendarCheck,
  CalendarX,
  ClipboardList,
  Dumbbell,
  FileText,
  Newspaper,
  Package,
  UserPlus,
  UserX,
  Utensils,
  Video,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ecouterCloche, marquerLues, nombreNonLues, notificationsRecentes, type NotificationAppli } from '@/data/cloche';
import { ilYa, pastille } from '@/domain/cloche';
import type { Rappel } from '@/domain/rappels';
import { messageErreur, useCharger } from '@/lib/useCharger';

import { couleurs, espace, polices } from '../theme';

const ICONES: Record<string, LucideIcon> = {
  seance_faite: Dumbbell,
  rdv_accepte: CalendarCheck,
  rdv_propose: CalendarCheck,
  rdv_rappel: CalendarCheck,
  rdv_refuse: CalendarX,
  rdv_change: CalendarX,
  paiement: Wallet,
  facture: FileText,
  questionnaire: UserPlus,
  bilan_semaine: ClipboardList,
  bilan_retour: ClipboardList,
  video: Video,
  video_corrigee: Video,
  pack_fin: Package,
  inactif: UserX,
  newsletter: Newspaper,
  // Rappels du client (À faire aujourd'hui).
  seance: Dumbbell,
  repas: Utensils,
  bilan: ClipboardList,
};

const VIDE_COACH =
  'Rien de neuf pour l’instant. Tu verras ici les séances faites par tes clients, les séances acceptées, les paiements, les bilans…';

export interface OptionsCloche {
  /** Rappels du jour encore à faire (client). */
  aFaire?: () => Promise<Rappel[]>;
  /** Clé de cache propre à la personne. */
  cle?: string;
  texteVide?: string;
}

/** Rappels encore à faire, relus avec la cloche. */
function useAFaire(o: OptionsCloche) {
  const { aFaire, cle = '' } = o;
  const r = useCharger(() => (aFaire ? aFaire() : Promise.resolve([] as Rappel[])), `cloche-a-faire-${cle}`);
  const { recharger } = r;
  useEffect(() => ecouterCloche(recharger), [recharger]);
  useEffect(() => {
    if (!aFaire) return;
    const t = setInterval(() => AppState.currentState === 'active' && recharger(), 60_000);
    const s = AppState.addEventListener('change', (e) => e === 'active' && recharger());
    return () => {
      clearInterval(t);
      s.remove();
    };
  }, [aFaire, recharger]);
  return r.donnee ?? [];
}

/** Nombre d'alertes non lues : relu au retour sur l'appli, à l'arrivée d'une notification et toutes les 30 s. */
function useNonLues() {
  const n = useCharger(nombreNonLues, 'cloche-non-lues');
  const { recharger } = n;
  useEffect(() => ecouterCloche(recharger), [recharger]);
  useEffect(() => {
    const t = setInterval(() => AppState.currentState === 'active' && recharger(), 30_000);
    const s = AppState.addEventListener('change', (e) => e === 'active' && recharger());
    return () => {
      clearInterval(t);
      s.remove();
    };
  }, [recharger]);
  return n.donnee ?? 0;
}

export function BoutonCloche(options: OptionsCloche = {}) {
  const nonLues = useNonLues() + useAFaire(options).length;
  const [ouverte, setOuverte] = useState(false);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={nonLues ? `Notifications, ${nonLues} nouvelle${nonLues > 1 ? 's' : ''}` : 'Notifications'}
        onPress={() => setOuverte(true)}
        hitSlop={6}
        style={({ pressed }) => [styles.bouton, pressed && { opacity: 0.7 }]}
      >
        <Bell size={20} color="#FFFFFF" />
        {nonLues > 0 && (
          <View style={styles.pastille}>
            <Text style={styles.pastilleTexte}>{pastille(nonLues)}</Text>
          </View>
        )}
      </Pressable>
      {ouverte && <PanneauCloche {...options} onFermer={() => setOuverte(false)} />}
    </>
  );
}

function PanneauCloche({ onFermer, ...options }: OptionsCloche & { onFermer: () => void }) {
  const marges = useSafeAreaInsets();
  const aFaire = useAFaire(options);
  const liste = useCharger(() => notificationsRecentes(), 'cloche-liste');
  const [lues, setLues] = useState<Set<string>>(new Set());
  const [erreur, setErreur] = useState('');
  const { recharger } = liste;
  useEffect(() => ecouterCloche(recharger), [recharger]);

  const items = (liste.donnee ?? []).map((n) => (lues.has(n.id) ? { ...n, lue: true } : n));
  const nonLues = items.filter((n) => !n.lue);

  const ouvrir = useCallback(
    (n: NotificationAppli) => {
      if (!n.lue) void marquerLues([n.id]).catch(() => undefined);
      onFermer();
      if (n.url?.startsWith('/')) router.navigate(n.url as never);
    },
    [onFermer],
  );

  const toutLire = async () => {
    setErreur('');
    setLues(new Set(items.map((n) => n.id)));
    try {
      await marquerLues();
    } catch (e) {
      setLues(new Set());
      setErreur(messageErreur(e));
    }
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onFermer}>
      <Pressable accessibilityLabel="Fermer les notifications" style={styles.voile} onPress={onFermer}>
        <Pressable style={[styles.panneau, { marginTop: marges.top + espace(2) }]} onPress={(e) => e.stopPropagation()}>
          <View style={styles.entete}>
            <Text style={styles.titre}>Notifications</Text>
            {nonLues.length > 0 && (
              <Pressable accessibilityRole="button" onPress={toutLire} hitSlop={6}>
                <Text style={styles.lien}>Tout marquer comme lu</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="Fermer" onPress={onFermer} hitSlop={8} style={{ marginLeft: espace(2) }}>
              <X size={20} color={couleurs.texte} />
            </Pressable>
          </View>
          {!!erreur && <Text style={[styles.doux, { color: couleurs.rouge, paddingHorizontal: espace(4) }]}>{erreur}</Text>}
          {!liste.donnee && !liste.erreur && <ActivityIndicator style={{ margin: espace(6) }} color={couleurs.rouge} />}
          {liste.erreur && !liste.donnee && <Text style={[styles.doux, styles.vide]}>{liste.erreur}</Text>}
          {liste.donnee && items.length === 0 && aFaire.length === 0 && (
            <Text style={[styles.doux, styles.vide]}>{options.texteVide ?? VIDE_COACH}</Text>
          )}
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: espace(2) }}>
            {aFaire.length > 0 && <Text style={styles.section}>À faire aujourd’hui</Text>}
            {aFaire.map((r) => {
              const Icone = ICONES[r.genre] ?? Bell;
              return (
                <Pressable
                  key={r.id}
                  accessibilityRole="button"
                  onPress={() => {
                    onFermer();
                    router.navigate(r.url as never);
                  }}
                  style={({ pressed }) => [styles.ligne, styles.ligneNonLue, pressed && { opacity: 0.75 }]}
                >
                  <View style={[styles.rond, { backgroundColor: couleurs.rougeClair }]}>
                    <Icone size={18} color={couleurs.rouge} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.ligneTitre, { fontFamily: polices.texteGras }]} numberOfLines={2}>
                      {r.titre}
                    </Text>
                    <Text style={styles.doux} numberOfLines={2}>
                      {r.corps}
                    </Text>
                  </View>
                  <View style={styles.point} />
                </Pressable>
              );
            })}
            {aFaire.length > 0 && items.length > 0 && <Text style={styles.section}>Notifications</Text>}
            {items.map((n) => {
              const Icone = ICONES[n.genre] ?? Bell;
              return (
                <Pressable
                  key={n.id}
                  accessibilityRole="button"
                  onPress={() => ouvrir(n)}
                  style={({ pressed }) => [styles.ligne, !n.lue && styles.ligneNonLue, pressed && { opacity: 0.75 }]}
                >
                  <View style={[styles.rond, !n.lue && { backgroundColor: couleurs.rougeClair }]}>
                    <Icone size={18} color={n.lue ? couleurs.texteDoux : couleurs.rouge} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[styles.ligneTitre, !n.lue && { fontFamily: polices.texteGras }]} numberOfLines={2}>
                      {n.titre}
                    </Text>
                    {!!n.corps && (
                      <Text style={styles.doux} numberOfLines={2}>
                        {n.corps}
                      </Text>
                    )}
                    <Text style={[styles.doux, { fontSize: 12 }]}>{ilYa(n.creeLe)}</Text>
                  </View>
                  {!n.lue && <View style={styles.point} />}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bouton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  pastille: {
    position: 'absolute',
    top: 3,
    right: 1,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: couleurs.rougeMarque,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastilleTexte: { fontFamily: polices.texteGras, fontSize: 10, color: '#FFFFFF' },
  voile: { flex: 1, backgroundColor: 'rgba(17,18,22,0.45)', alignItems: 'flex-end', paddingHorizontal: espace(3) },
  panneau: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: couleurs.carte,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  entete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espace(2),
    paddingHorizontal: espace(4),
    paddingVertical: espace(3),
    borderBottomWidth: 1,
    borderBottomColor: couleurs.bordure,
  },
  titre: { flex: 1, fontFamily: polices.titre, fontSize: 24, color: couleurs.texte, letterSpacing: 0.5 },
  lien: { fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.rouge },
  vide: { padding: espace(5), textAlign: 'center' },
  section: { fontFamily: polices.texteGras, fontSize: 12, color: couleurs.texteDoux, letterSpacing: 0.6, textTransform: 'uppercase', paddingHorizontal: espace(4), paddingTop: espace(3), paddingBottom: espace(1) },
  ligne: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espace(3),
    paddingHorizontal: espace(4),
    paddingVertical: espace(3),
    borderBottomWidth: 1,
    borderBottomColor: couleurs.discret,
  },
  ligneNonLue: { backgroundColor: '#FFFAFA' },
  rond: { width: 34, height: 34, borderRadius: 17, backgroundColor: couleurs.discret, alignItems: 'center', justifyContent: 'center' },
  ligneTitre: { fontFamily: polices.texteMoyen, fontSize: 15, color: couleurs.texte },
  doux: { fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux },
  point: { width: 8, height: 8, borderRadius: 4, backgroundColor: couleurs.rougeMarque, marginTop: 6 },
});
