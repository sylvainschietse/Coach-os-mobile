// Petits éléments partagés par l'agenda du coach et les rendez-vous du client.
import { Text, View } from 'react-native';

import { STATUTS_RDV, type StatutRdv } from '@/domain/agenda';

import { couleurs, polices } from '../theme';

/** « mardi 3 novembre ». */
export const jourLong = (jour: string) => new Date(`${jour.slice(0, 10)}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
/** Première lettre en majuscule (« Mardi 3 novembre »), sans toucher aux autres mots. */
export const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
/** « mar. 3 ». */
export const jourCourt = (d: Date) => d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });

export const COULEURS_STATUT: Record<StatutRdv, { fond: string; texte: string }> = {
  propose: { fond: couleurs.orangeClair, texte: couleurs.orange },
  confirme: { fond: couleurs.vertClair, texte: couleurs.vert },
  refuse: { fond: couleurs.discret, texte: couleurs.texteDoux },
  annule: { fond: couleurs.discret, texte: couleurs.texteDoux },
  annule_tard: { fond: couleurs.discret, texte: couleurs.texteDoux },
  absent: { fond: couleurs.rougeClair, texte: couleurs.rougeTexte },
  realise: { fond: '#EEF2FF', texte: couleurs.bleu },
};

export function PastilleStatutRdv({ statut }: { statut: StatutRdv }) {
  const c = COULEURS_STATUT[statut];
  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: c.fond }}>
      <Text style={{ fontFamily: polices.texteMoyen, fontSize: 12, color: c.texte }}>{STATUTS_RDV[statut]}</Text>
    </View>
  );
}
