// Nutrition côté coach. Les recettes sont une partie de l'onglet Programmes (avec celles des clients et l'analyse d'une
// photo d'assiette) ; le suivi alimentaire d'un client se fait dans sa fiche, rubrique Nutrition.
import { useState } from 'react';
import { View } from 'react-native';

import { BoutonContour, LibelleSection } from '../coque';
import { espace } from '../theme';
import { NutritionProfil } from '../nutrition/nutrition';
import { AnalyseAssiette } from './analyse-assiette';
import { BanqueRecettes } from './recettes';
import { RecettesClients } from './recettes-clients';

/** Programmes › Recettes : mes recettes, puis celles de mes clients ; l'analyse d'une photo s'ouvre sur demande. */
export function RecettesCoach({ coachId }: { coachId: string }) {
  const [photo, setPhoto] = useState(false);
  return (
    <View style={{ gap: espace(6) }}>
      <View style={{ alignSelf: 'flex-start' }}>
        <BoutonContour libelle={photo ? 'Fermer l’analyse de photo' : 'Analyser une photo d’assiette'} onPress={() => setPhoto((p) => !p)} />
      </View>
      {photo && <AnalyseAssiette />}
      <BanqueRecettes coachId={coachId} />
      <View style={{ gap: espace(3) }}>
        <LibelleSection>Recettes de mes clients</LibelleSection>
        <RecettesClients coachId={coachId} />
      </View>
    </View>
  );
}

/** Le dossier nutrition d'un client, ouvert depuis sa fiche (rubrique Nutrition). */
export function NutritionDuClient({ clientId: id, coachId }: { clientId: string; coachId: string }) {
  return (
    <View style={{ gap: espace(4) }}>
      {/* ContactNutrition d'origine : profil, objectifs à ajuster, recettes, semaine, journal et recettes du client. */}
      <NutritionProfil key={id} clientId={id} coach />
    </View>
  );
}
