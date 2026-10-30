// Onglet « Moi » du client : ses coordonnées, sa formule, ses documents et l'accès à ses données (RGPD).
// La formule s'affiche sans prix : rien ne s'achète dans l'appli.
import { router } from 'expo-router';
import { View } from 'react-native';

import { abonnements } from '@/data/abonnements';
import { mesInfos, monCoach } from '@/data/acces-client';
import { soldeSeances } from '@/domain/abonnements';
import { normaliserTelephone } from '@/domain/crm';
import { demanderSortie } from '@/lib/brouillon';
import { ouvrirLien } from '@/lib/ouvrir-lien';
import { useCharger } from '@/lib/useCharger';

import { Hero } from './coque';
import { Bouton, Carte, Erreur, SousTitre, Texte } from './composants';
import { MesDocuments } from './mes-documents';
import { PhotoCoach } from './profil-coach';
import { couleurs, espace } from './theme';

function Ligne({ libelle, valeur }: { libelle: string; valeur?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: espace(3) }}>
      <Texte doux style={{ fontSize: 14 }}>
        {libelle}
      </Texte>
      <Texte style={{ fontSize: 14, flexShrink: 1, textAlign: 'right' }}>{valeur || '—'}</Texte>
    </View>
  );
}

/** Son coach : photo, prénom et un bouton pour lui écrire sur WhatsApp quand le coach a donné son numéro. */
function MonCoach() {
  const { donnee: coach } = useCharger(() => monCoach(), 'mon-coach');
  if (!coach) return null;
  const telephone = normaliserTelephone(coach.telephone);
  return (
    <Carte>
      <SousTitre>Mon coach</SousTitre>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(3) }}>
        <PhotoCoach photo={coach.photo} taille={56} />
        <Texte style={{ fontSize: 17, flex: 1 }}>{coach.nom}</Texte>
      </View>
      {telephone && (
        <Bouton
          variante="discret"
          libelle={`Écrire à ${coach.nom} sur WhatsApp`}
          onPress={() => ouvrirLien(`https://wa.me/${telephone}`).catch(() => undefined)}
        />
      )}
    </Carte>
  );
}

export function MonCompte({ clientId, prenom, apercu }: { clientId: string; prenom: string; apercu: boolean }) {
  const infos = useCharger(() => mesInfos(clientId), `infos-${clientId}`);
  const abo = useCharger(() => abonnements.lire(clientId), `abo-${clientId}`);
  const packs = useCharger(() => abonnements.packs(clientId), `packs-${clientId}`);
  const i = infos.donnee;
  const solde = soldeSeances(packs.donnee ?? []);

  return (
    <>
      <Hero kicker="Mon compte" titre={[i?.prenom || prenom, i?.nom].filter(Boolean).join(' ')} />
      {infos.erreur && <Erreur message={infos.erreur} onReessayer={infos.recharger} />}
      <MonCoach />
      <Carte>
        <SousTitre>Mes informations</SousTitre>
        <Ligne libelle="E-mail" valeur={i?.email} />
        <Ligne libelle="Téléphone" valeur={i?.telephone} />
        <Texte doux style={{ fontSize: 13 }}>
          Une information à corriger ? Ton coach peut la modifier.
        </Texte>
      </Carte>
      <Carte>
        <SousTitre>Ma formule</SousTitre>
        {abo.donnee && (
          <>
            <Ligne libelle="Appli (programme, séances, suivi)" valeur={abo.donnee.accesAppli ? 'Inclus' : 'Non'} />
            <Ligne libelle="Nutrition" valeur={abo.donnee.optionNutrition ? 'Complète (recettes, plan de repas)' : 'Macros'} />
          </>
        )}
        <Ligne
          libelle="Séances avec mon coach"
          valeur={solde.total ? `${solde.restantes} restante${solde.restantes > 1 ? 's' : ''} sur ${solde.total}` : 'Aucune en cours'}
        />
      </Carte>
      <MesDocuments clientId={clientId} />
      {!apercu && <Bouton variante="discret" libelle="Mes données et confidentialité" onPress={() => demanderSortie(() => router.push('/client/donnees'))} />}
      {abo.erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{abo.erreur}</Texte>}
    </>
  );
}
