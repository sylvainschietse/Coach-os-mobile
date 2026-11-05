// Mon profil (bouton en haut de l'espace coach) : tout ce qui concerne le coach lui-même et ses réglages, pour que le
// menu de l'Accueil ne garde que le suivi de l'activité.
import { LogOut } from 'lucide-react-native';
import { View } from 'react-native';

import { ReglagesAgendaCoach } from './agenda/agenda-coach';
import { BoutonContour, EnTeteRubrique, SousNav, type OngletDef } from './coque';
import { Automatisations } from './crm/automatisations';
import { EnteteFactures } from './factures';
import { MesOffres } from './offres/mes-offres';
import { MonProfilCoach } from './profil-coach';
import { espace } from './theme';

export type SectionProfil = 'infos' | 'facturation' | 'offres' | 'agenda' | 'relances';
export const SECTIONS_PROFIL: OngletDef<SectionProfil>[] = [
  { cle: 'infos', libelle: 'Mes infos' },
  { cle: 'facturation', libelle: 'Paiement et factures' },
  { cle: 'offres', libelle: 'Mes offres' },
  { cle: 'agenda', libelle: 'Agenda' },
  { cle: 'relances', libelle: 'Relances automatiques' },
];

export function EspaceProfil({ section, onSection, onDeconnecter }: { section: SectionProfil; onSection: (s: SectionProfil) => void; onDeconnecter: () => void }) {
  return (
    <View style={{ gap: espace(4) }}>
      <EnTeteRubrique
        kicker="Espace coach"
        titre="Mon profil"
        action={<BoutonContour libelle="Se déconnecter" icone={LogOut} iconeAGauche onPress={onDeconnecter} />}
      />
      <SousNav nom="Rubriques de mon profil" onglets={SECTIONS_PROFIL} valeur={section} onChange={onSection} />
      {section === 'infos' && <MonProfilCoach />}
      {section === 'facturation' && <EnteteFactures />}
      {section === 'offres' && <MesOffres />}
      {section === 'agenda' && <ReglagesAgendaCoach />}
      {section === 'relances' && <Automatisations />}
    </View>
  );
}
