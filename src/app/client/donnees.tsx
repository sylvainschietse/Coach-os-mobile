import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';

import { consentements } from '@/data/consentement';
import { useSession } from '@/data/session';
import type { Consentement } from '@/domain/consentement';
import { messageErreur } from '@/lib/useCharger';
import { Chargement, Ecran, Erreur, Texte } from '@/ui/composants';
import { AccordDonnees } from '@/ui/consentement';

/** « Mes données » : le client revoit ses choix RGPD et peut activer ou couper l'analyse de ses photos de repas. */
export default function MesDonnees() {
  const { profil } = useSession();
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
    </Ecran>
  );
}
