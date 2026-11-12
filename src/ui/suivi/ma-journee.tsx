// « Ma journée » sur l'accueil : les suivis du quotidien du client (sommeil, eau, stress…) en pastilles. Ce qui est
// noté s'affiche, le reste invite à noter ; un appui ouvre la saisie complète dans Progrès.
import { ChevronRight } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { quotidien } from '@/data/quotidien';
import { aujourdhuiParis } from '@/domain/entrainement';
import { formaterValeur, indicateursDuClient } from '@/domain/quotidien';
import { useCharger } from '@/lib/useCharger';

import { couleurs, polices } from '../theme';

const FONDS = ['#EFEAFF', '#E3F3FB', '#FFF1DC', '#E8F6EE', '#FFE6E7', '#EEF3FF'];

export function MaJournee({ clientId, onNoter }: { clientId: string; onNoter: () => void }) {
  const jour = aujourdhuiParis();
  const { donnee } = useCharger(async () => {
    const [reglages, releves] = await Promise.all([quotidien.reglages(clientId), quotidien.releves(clientId, jour)]);
    return { suivis: indicateursDuClient(reglages).filter((s) => s.actif), releves: releves.filter((r) => r.jour === jour) };
  }, `ma-journee-${clientId}-${jour}`);
  if (!donnee || !donnee.suivis.length) return null;
  const suivis = donnee.suivis.slice(0, 6);
  const notes = suivis.filter((s) => donnee.releves.some((r) => r.indicateur === s.def.cle)).length;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Ma journée : noter mon sommeil, mon eau, mon stress…" onPress={onNoter} style={{ borderRadius: 22, padding: 16, gap: 12, backgroundColor: couleurs.carte }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: '#6B4BC9' }}>Ma journée</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text style={{ fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux }}>
            {notes === suivis.length ? 'Tout est noté' : `${notes} sur ${suivis.length} · 20 s`}
          </Text>
          <ChevronRight size={16} color={couleurs.texteDoux} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
        {suivis.map((s, i) => {
          const r = donnee.releves.find((x) => x.indicateur === s.def.cle);
          return (
            <View key={s.def.cle} style={{ width: suivis.length > 4 ? '33.33%' : `${100 / suivis.length}%`, padding: 4 }}>
              <View
                style={{
                  minHeight: 62,
                  borderRadius: 14,
                  paddingVertical: 10,
                  paddingHorizontal: 4,
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 3,
                  backgroundColor: r ? FONDS[i % FONDS.length] : couleurs.carte,
                  borderWidth: r ? 0 : 2,
                  borderStyle: 'dashed',
                  borderColor: '#D2CBEA',
                }}
              >
                <Text numberOfLines={1} style={{ fontFamily: polices.texte, fontSize: 11.5, color: couleurs.texteDoux }}>
                  {s.def.libelle}
                </Text>
                <Text numberOfLines={1} style={{ fontFamily: polices.texteGras, fontSize: 15, color: r ? couleurs.texte : '#6B4BC9' }}>
                  {r ? formaterValeur(s.def, r.valeur) : 'Noter'}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </Pressable>
  );
}
