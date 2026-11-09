// Accueil du coach : « Ce qui s'est passé » chez ses clients et ses prospects, sur une période au choix.
// Chaque ligne mène à la page concernée : la fiche du contact, l'agenda (séance en duo) ou les paiements.
import { CalendarCheck, ClipboardList, Dumbbell, Euro, Footprints, NotebookPen, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { activiteRecente } from '@/data/activite-coach';
import { bornesPeriode, PERIODES_ACTIVITE, quandCourt, type EvenementActivite, type GenreActivite, type PeriodeActivite } from '@/domain/activite-coach';
import { useCharger } from '@/lib/useCharger';

import { Carte, Chargement, Erreur, Puce, Puces } from '../composants';
import { couleurs, polices } from '../theme';

const ICONES: Record<GenreActivite, LucideIcon> = {
  seance: Dumbbell,
  sport: Footprints,
  rdv: CalendarCheck,
  bilan: NotebookPen,
  questionnaire: ClipboardList,
  paiement: Euro,
};
const COURT = 6;

export function CeQuiSestPasse({ onOuvrirContact, onAgenda, onPaiements }: { onOuvrirContact: (id: string) => void; onAgenda: () => void; onPaiements: () => void }) {
  const [periode, setPeriode] = useState<PeriodeActivite>('7j');
  const [tout, setTout] = useState(false);
  const activite = useCharger(() => {
    const { du, au } = bornesPeriode(periode, new Date());
    return activiteRecente(du, au);
  }, `accueil-activite-${periode}`);
  const liste = activite.donnee ?? [];
  const affichees = tout ? liste : liste.slice(0, COURT);
  const maintenant = new Date();

  const ouvrir = (e: EvenementActivite) => {
    if (e.contactId) return onOuvrirContact(e.contactId);
    if (e.genre === 'paiement') return onPaiements();
    onAgenda();
  };

  return (
    <Carte style={{ padding: 16 }}>
      <Text style={{ fontSize: 16, fontFamily: polices.texteGras, color: couleurs.texte, marginBottom: 10 }}>Ce qui s’est passé</Text>
      <Puces>
        {PERIODES_ACTIVITE.map((p) => (
          <Puce
            key={p.cle}
            libelle={p.libelle}
            actif={periode === p.cle}
            onPress={() => {
              setPeriode(p.cle);
              setTout(false);
            }}
          />
        ))}
      </Puces>
      <View style={{ marginTop: 8 }}>
        {activite.erreur && <Erreur message={activite.erreur} onReessayer={activite.recharger} />}
        {!activite.donnee && !activite.erreur && <Chargement />}
        {activite.donnee && !liste.length && <Text style={[doux, { paddingVertical: 10 }]}>Rien sur cette période.</Text>}
        {affichees.map((e, i) => {
          const Icone = ICONES[e.genre];
          return (
            <Pressable
              key={e.id}
              accessibilityRole="button"
              onPress={() => ouvrir(e)}
              style={({ pressed }) => [
                { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, opacity: pressed ? 0.7 : 1 },
                i < affichees.length - 1 && { borderBottomWidth: 1, borderBottomColor: couleurs.bordure },
              ]}
            >
              <Icone size={18} color={e.genre === 'paiement' ? couleurs.vert : couleurs.rougeMarque} />
              <Text style={{ flex: 1, fontSize: 14, fontFamily: polices.texte, color: couleurs.texte }} numberOfLines={2}>
                <Text style={{ fontFamily: polices.texteGras }}>{e.qui}</Text> {e.quoi}
              </Text>
              <Text style={doux}>{quandCourt(e.quand, maintenant)}</Text>
            </Pressable>
          );
        })}
        {liste.length > COURT && (
          <Text accessibilityRole="button" onPress={() => setTout((t) => !t)} style={{ marginTop: 8, fontSize: 14, fontFamily: polices.texteMoyen, color: couleurs.rougeMarque }}>
            {tout ? 'Réduire' : `Voir tout (${liste.length})`}
          </Text>
        )}
      </View>
    </Carte>
  );
}

const doux = { fontSize: 13, fontFamily: polices.texte, color: couleurs.texteDoux } as const;
