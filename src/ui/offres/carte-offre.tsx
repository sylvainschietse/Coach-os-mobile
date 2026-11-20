// Une offre telle que le client la voit : nom, accroche, prix et ce qu'elle comprend.
// Sert d'aperçu au coach pendant qu'il la crée, sur la page publique de l'offre et dans l'espace client.
import { Check } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { contenuOffre, libellePrix, type Offre } from '@/domain/offres';

import { Carte, Texte } from '../composants';
import { couleurs, espace, polices } from '../theme';

type Affichee = Pick<Offre, 'nom' | 'accroche' | 'prix' | 'periodicite' | 'accesAppli' | 'nutrition' | 'messagerie' | 'videosMois' | 'seances' | 'essaiJours'>;

export function CarteOffre({ offre, mention, children }: { offre: Affichee; mention?: string; children?: ReactNode }) {
  const lignes = contenuOffre(offre);
  return (
    <Carte>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: espace(2) }}>
        <Text style={{ fontFamily: polices.titre, fontSize: 26, color: couleurs.texte, flexShrink: 1 }}>{offre.nom || 'Ton offre'}</Text>
        {mention && (
          <View style={{ backgroundColor: couleurs.discret, borderRadius: 999, paddingHorizontal: espace(2), paddingVertical: 2 }}>
            <Text style={{ fontFamily: polices.texteMoyen, fontSize: 12, color: couleurs.texteDoux }}>{mention}</Text>
          </View>
        )}
      </View>
      {offre.accroche ? <Texte doux style={{ fontSize: 14 }}>{offre.accroche}</Texte> : null}
      <Text style={{ fontFamily: polices.texteMoyen, fontSize: 22, color: couleurs.rouge }}>{libellePrix(offre)}</Text>
      <View style={{ gap: espace(1) }}>
        {lignes.map((l) => (
          <View key={l} style={{ flexDirection: 'row', gap: espace(2), alignItems: 'flex-start' }}>
            <Check size={16} color={couleurs.vert} style={{ marginTop: 3 }} />
            <Texte style={{ fontSize: 14, flex: 1 }}>{l}</Texte>
          </View>
        ))}
      </View>
      {children}
    </Carte>
  );
}
