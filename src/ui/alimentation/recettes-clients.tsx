// Recettes de mes clients : le coach retrouve les recettes que ses clients ont enregistrées, et choisit de les
// partager avec tous ses clients (une copie approuvée entre dans sa banque) ou de ne pas les retenir.
// La recette du client reste la sienne : il la garde et peut la modifier ; une modification la remet « à voir ».
import { useState } from 'react';
import { Text, View } from 'react-native';

import { depot } from '@/data';
import { alimentation } from '@/data/alimentation';
import { copiePourLaBanque, quantiteLisible, totalRecette } from '@/domain/alimentation';
import type { AvisRecetteClient, Recette } from '@/domain/types';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { Vide } from '../coque';
import { Bouton, Carte, Chargement, Erreur, Pastille, Puce, Puces, SousTitre, Texte } from '../composants';
import { couleurs, espace, polices } from '../theme';
import { LigneMacros } from './commun';

type Filtre = 'a-voir' | AvisRecetteClient;

async function charger(coachId: string) {
  const [recettes, clients] = await Promise.all([alimentation.recettesDesClients(), depot.clientsDuCoach(coachId)]);
  const noms = new Map(clients.map((c) => [c.id, `${c.prenom} ${c.nom}`.trim()]));
  return recettes.map((r) => ({ recette: r, client: noms.get(r.clientId ?? '') ?? 'Un client' }));
}

export function RecettesClients({ coachId }: { coachId: string }) {
  const { donnee, erreur, recharger } = useCharger(() => charger(coachId), `recettes-clients-${coachId}`);
  const [filtre, setFiltre] = useState<Filtre>('a-voir');
  const [occupe, setOccupe] = useState<string>();
  const [echec, setEchec] = useState<string>();

  const avis = async (r: Recette, choix: AvisRecetteClient | undefined) => {
    setOccupe(r.id);
    setEchec(undefined);
    try {
      if (choix === 'partagee') await alimentation.enregistrerRecette(copiePourLaBanque(r, nouvelId()), coachId);
      await alimentation.avisRecetteClient(r.id, choix);
      recharger();
    } catch (e) {
      setEchec(e instanceof Error ? e.message : 'L’enregistrement a échoué, réessaie.');
    } finally {
      setOccupe(undefined);
    }
  };

  if (erreur) return <Erreur message={erreur} onReessayer={recharger} />;
  if (!donnee) return <Chargement />;
  const compte = (f: Filtre) => donnee.filter(({ recette }) => (recette.avisCoach ?? 'a-voir') === f).length;
  const visibles = donnee.filter(({ recette }) => (recette.avisCoach ?? 'a-voir') === filtre);

  return (
    <View style={{ gap: espace(4) }}>
      <Texte doux style={{ fontSize: 14 }}>
        Les recettes que tes clients ont enregistrées. Elles ne sont visibles que d’eux et de toi. « Partager » en ajoute une copie à tes recettes, visible de
        tous tes clients.
      </Texte>
      <Puces>
        <Puce libelle={`À voir (${compte('a-voir')})`} actif={filtre === 'a-voir'} onPress={() => setFiltre('a-voir')} />
        <Puce libelle={`Partagées (${compte('partagee')})`} actif={filtre === 'partagee'} onPress={() => setFiltre('partagee')} />
        <Puce libelle={`Non retenues (${compte('non-retenue')})`} actif={filtre === 'non-retenue'} onPress={() => setFiltre('non-retenue')} />
      </Puces>
      {echec && <Erreur message={echec} />}
      {!visibles.length && (
        <Vide
          titre={filtre === 'a-voir' ? 'Aucune recette à voir' : filtre === 'partagee' ? 'Aucune recette partagée' : 'Aucune recette mise de côté'}
          texte={filtre === 'a-voir' ? 'Quand un client enregistre une recette, elle apparaît ici.' : undefined}
        />
      )}
      {visibles.map(({ recette: r, client }) => (
        <Carte key={r.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: espace(2) }}>
            <View style={{ flex: 1, gap: 2 }}>
              <SousTitre>{r.titre}</SousTitre>
              <Texte doux style={{ fontSize: 13 }}>
                De {client} · {r.portions} portion{r.portions > 1 ? 's' : ''}
                {r.tempsMin ? ` · ${r.tempsMin} min` : ''}
              </Texte>
            </View>
            {r.avisCoach === 'partagee' && <Pastille libelle="Partagée" couleur={couleurs.vert} />}
          </View>
          <LigneMacros m={totalRecette(r).parPortion} />
          {r.ingredients.length > 0 && <Texte style={{ fontSize: 14 }}>{r.ingredients.map((i) => `${i.nom} (${quantiteLisible(i)})`).join(', ')}</Texte>}
          {r.etapes && (
            <Text numberOfLines={4} style={{ fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux }}>
              {r.etapes}
            </Text>
          )}
          {r.avisCoach === undefined && (
            <View style={{ gap: espace(2) }}>
              <Bouton libelle="Partager avec tous mes clients" chargement={occupe === r.id} desactive={!!occupe} onPress={() => avis(r, 'partagee')} />
              <Bouton libelle="Ne pas retenir" variante="discret" desactive={!!occupe} onPress={() => avis(r, 'non-retenue')} />
            </View>
          )}
          {r.avisCoach === 'partagee' && (
            <Texte doux style={{ fontSize: 13 }}>
              Une copie est dans tes recettes (onglet « Mes recettes »), où tu peux la modifier.
            </Texte>
          )}
          {r.avisCoach === 'non-retenue' && <Bouton libelle="Remettre à voir" variante="discret" desactive={!!occupe} onPress={() => avis(r, undefined)} />}
        </Carte>
      ))}
    </View>
  );
}
