// Page publique d'une offre, ouverte depuis le lien que le coach partage (WhatsApp, Instagram, site…), sans compte.
// La personne voit l'offre et le coach, puis paie sur la page Stripe du coach. Au retour, sa fiche est déjà créée chez lui.
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { offres } from '@/data/offres';
import { useSession } from '@/data/session';
import { ouvrirLien } from '@/lib/ouvrir-lien';
import { messageErreur, useCharger } from '@/lib/useCharger';
import { Bouton, Carte, Chargement, Ecran, Erreur, Texte, Titre } from '@/ui/composants';
import { CarteOffre } from '@/ui/offres/carte-offre';
import { PhotoCoach } from '@/ui/profil-coach';
import { couleurs, espace } from '@/ui/theme';

export default function OffreParLien() {
  const { id, paiement } = useLocalSearchParams<{ id: string; paiement?: string }>();
  const page = useCharger(() => offres.voir(id), `offre-${id}`);
  const { profil } = useSession();
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();

  const payer = async () => {
    setErreur(undefined);
    setOccupe(true);
    try {
      const lien = await offres.payer(id);
      // Sur le web, la page Stripe remplace celle-ci et revient ici une fois le paiement fait.
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.location.assign(lien);
      else await ouvrirLien(lien);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  };

  if (page.erreur) {
    return (
      <Ecran>
        <Erreur message={page.erreur} onReessayer={page.recharger} />
      </Ecran>
    );
  }
  if (!page.donnee) return <Chargement />;
  const { offre, coach } = page.donnee;
  const unique = offre.periodicite === 'unique';

  if (paiement === 'merci') {
    return (
      <Ecran>
        <Carte>
          <Titre>Merci !</Titre>
          <Texte style={{ fontSize: 15 }}>
            {`Ton paiement pour « ${offre.nom} » est bien reçu. ${coach.nom} est prévenu${
              unique ? ' et tes séances sont créditées.' : profil?.role === 'client' ? ' et ton accès est à jour.' : ' et va t’envoyer ton accès à l’appli.'
            }`}
          </Texte>
          <Texte doux style={{ fontSize: 14 }}>Tu reçois aussi ta facture par e-mail.</Texte>
        </Carte>
      </Ecran>
    );
  }

  return (
    <Ecran>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(3), marginBottom: espace(3) }}>
        <PhotoCoach photo={coach.photo ?? undefined} taille={56} />
        <View style={{ flex: 1 }}>
          <Texte doux style={{ fontSize: 13 }}>Coaching proposé par</Texte>
          <Texte style={{ fontSize: 18 }}>{coach.nom}</Texte>
        </View>
      </View>
      {paiement === 'annule' && (
        <Texte doux style={{ fontSize: 14, marginBottom: espace(2) }}>
          Paiement interrompu : rien n’a été prélevé. Tu peux reprendre quand tu veux.
        </Texte>
      )}
      <CarteOffre offre={offre}>
        {page.donnee.paiement ? (
          <Bouton libelle={unique ? 'Payer par carte' : offre.essaiJours ? `Commencer l’essai gratuit` : 'S’abonner et payer par carte'} onPress={payer} chargement={occupe} />
        ) : (
          <Texte doux style={{ fontSize: 14 }}>{`Le paiement en ligne n’est pas encore ouvert : contacte ${coach.nom} pour t’inscrire.`}</Texte>
        )}
        {erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
        {page.donnee.paiement && (
          <Texte doux style={{ fontSize: 12 }}>
            {unique
              ? `Paiement sécurisé par Stripe, versé directement à ${coach.nom}.`
              : `Paiement sécurisé par Stripe, versé directement à ${coach.nom}. Résiliable à tout moment, la période commencée reste due.`}
          </Texte>
        )}
      </CarteOffre>
    </Ecran>
  );
}
