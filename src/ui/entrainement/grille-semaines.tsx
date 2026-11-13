// Le tableau « Semaine par semaine » : une ligne par semaine du cycle, une pastille par séance (vert faite, rouge
// manquée, orange à venir, bleu activité libre). Le même tableau sert au coach (fiche du client) et au client (Suivi).
import { Check, Clock, Plus, X } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { titreClient } from '@/domain/entrainement';
import type { Pastille, SemaineSuivi, StatutPastille } from '@/domain/suivi-entrainement';

import { couleurs, polices } from '../theme';
import { ts } from './commun';

export const STATUTS: Record<StatutPastille, { libelle: string; couleur: string; fond: string; Icone: typeof Check }> = {
  faite: { libelle: 'Faite', couleur: couleurs.vert, fond: couleurs.vertClair, Icone: Check },
  manquee: { libelle: 'Manquée', couleur: couleurs.rouge, fond: couleurs.rougeClair, Icone: X },
  // Orange franc (ambre) : le rouge-orangé du thème se confond avec le rouge « manquée » sur une pastille.
  prevue: { libelle: 'À venir', couleur: '#E68A00', fond: '#FFF4DE', Icone: Clock },
  libre: { libelle: 'Hors programme', couleur: couleurs.bleu, fond: '#E8F0FE', Icone: Plus },
};

/** « 5 oct. » */
export const jourMois = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export type Choix = { semaine: number; index: number };

function Rond({ p, choisi, onPress }: { p: Pastille; choisi: boolean; onPress: () => void }) {
  const s = STATUTS[p.statut];
  const quand = p.date ? jourMois(p.date) : 'pas de date';
  const plein = p.statut === 'faite' || p.statut === 'libre';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${titreClient(p.titre)}, ${quand} : ${s.libelle.toLowerCase()}`}
      accessibilityState={{ selected: choisi }}
      onPress={onPress}
      style={{ alignItems: 'center', gap: 2, width: 46 }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: plein ? s.couleur : s.fond,
          borderWidth: choisi ? 3 : 1.5,
          borderColor: choisi ? couleurs.noir : s.couleur,
        }}
      >
        <s.Icone size={16} color={plein ? '#FFFFFF' : s.couleur} />
      </View>
      <Text numberOfLines={1} style={{ fontFamily: polices.texte, fontSize: 11, color: couleurs.texteDoux }}>
        {p.date ? jourMois(p.date) : '—'}
      </Text>
    </Pressable>
  );
}

/** Légende des couleurs ; chaque libellé reste sur une ligne (« À venir » n'est plus coupé). */
export function Legende() {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 6 }}>
      {(Object.keys(STATUTS) as StatutPastille[]).map((k) => (
        <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: STATUTS[k].couleur }} />
          <Text numberOfLines={1} style={ts.doux}>
            {STATUTS[k].libelle}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function GrilleSemaines({
  semaines,
  estChoisi,
  onChoisir,
}: {
  semaines: SemaineSuivi[];
  estChoisi: (c: Choix, p: Pastille) => boolean;
  onChoisir: (c: Choix) => void;
}) {
  return (
    <View style={{ gap: 4 }}>
      {semaines.map((s) => (
        <View
          key={s.numero}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingVertical: 8,
            paddingHorizontal: 6,
            borderRadius: 10,
            backgroundColor: s.enCours ? couleurs.fond : 'transparent',
          }}
        >
          <View style={{ width: 70 }}>
            <Text style={ts.titreChamp}>Semaine {s.numero}</Text>
            <Text style={ts.doux}>{s.enCours ? 'en cours' : jourMois(s.debut)}</Text>
          </View>
          <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
            {s.pastilles.length === 0 ? (
              <Text style={ts.doux}>Rien de prévu</Text>
            ) : (
              s.pastilles.map((p, i) => (
                <Rond
                  key={`${s.numero}-${i}`}
                  p={p}
                  choisi={estChoisi({ semaine: s.numero, index: i }, p)}
                  onPress={() => onChoisir({ semaine: s.numero, index: i })}
                />
              ))
            )}
          </View>
        </View>
      ))}
    </View>
  );
}
