import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { supprimerMonCompte } from '@/data/acces-client';
import { consentements } from '@/data/consentement';
import { useSession } from '@/data/session';
import type { Consentement } from '@/domain/consentement';
import { messageErreur } from '@/lib/useCharger';
import { Bouton, Carte, Chargement, Ecran, Erreur, Texte, Titre } from '@/ui/composants';
import { AccordDonnees } from '@/ui/consentement';

/**
 * « Mes données » : le client revoit ses choix RGPD, peut activer ou couper l'analyse de ses photos de repas,
 * et supprimer son compte (exigé par l'App Store et Google Play).
 */
export default function MesDonnees() {
  const { profil, deconnecter } = useSession();
  const clientId = profil?.role === 'client' ? profil.clientId : '';
  const [actuel, setActuel] = useState<Consentement | null>();
  const [erreur, setErreur] = useState<string>();
  const [enregistre, setEnregistre] = useState(false);

  useEffect(() => {
    if (clientId) consentements.lire(clientId).then(setActuel, (e: unknown) => setErreur(messageErreur(e)));
  }, [clientId]);

  if (profil?.role !== 'client') return <Redirect href="/" />;
  return (
    <Ecran>
      {erreur && <Erreur message={erreur} />}
      {actuel === undefined && !erreur && <Chargement />}
      {actuel !== undefined && (
        <AccordDonnees
          key={actuel?.accepteLe ?? 'aucun'}
          clientId={clientId}
          prenom={profil.prenom}
          actuel={actuel}
          onFait={(c) => {
            setActuel(c);
            setEnregistre(true);
          }}
        />
      )}
      {enregistre && <Texte doux>Tes choix sont enregistrés.</Texte>}
      {actuel && (
        <Texte doux style={{ fontSize: 14 }}>
          Accord donné le {new Date(actuel.accepteLe).toLocaleDateString('fr-FR')} (politique du {actuel.version}).
        </Texte>
      )}
      <SupprimerCompte onSupprime={deconnecter} />
    </Ecran>
  );
}

/** Deux temps : le bouton ouvre la confirmation, qui dit ce qui part et ce qui reste chez le coach. */
function SupprimerCompte({ onSupprime }: { onSupprime: () => void }) {
  const [confirmer, setConfirmer] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string>();

  async function supprimer() {
    setEnvoi(true);
    setErreur(undefined);
    try {
      await supprimerMonCompte();
      onSupprime();
    } catch (e) {
      setErreur(messageErreur(e));
      setEnvoi(false);
    }
  }

  return (
    <Carte>
      <Titre>Supprimer mon compte</Titre>
      {!confirmer ? (
        <Bouton variante="discret" libelle="Supprimer mon compte" onPress={() => setConfirmer(true)} />
      ) : (
        <>
          <Texte>
            Ton compte et tout ton suivi (séances, mesures, nutrition, données de santé, photos) seront effacés
            définitivement. Ton coach garde seulement tes coordonnées et ses documents (contrats, factures).
          </Texte>
          {erreur && <Erreur message={erreur} />}
          <Bouton libelle="Supprimer définitivement" onPress={supprimer} chargement={envoi} />
          <Bouton variante="discret" libelle="Annuler" onPress={() => setConfirmer(false)} desactive={envoi} />
        </>
      )}
    </Carte>
  );
}
