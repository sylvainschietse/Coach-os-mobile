// Onglet « Moi » du client : ses coordonnées, sa formule, ses documents et l'accès à ses données (RGPD).
// La formule s'affiche sans prix : rien ne s'achète dans l'appli.
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { abonnements } from '@/data/abonnements';
import { mesInfos, modifierMesCoordonnees, monCoach, type MesInfos } from '@/data/acces-client';
import { soldeSeances } from '@/domain/abonnements';
import { verifierCoordonnees } from '@/domain/acces-client';
import { formaterTelephone, normaliserTelephone } from '@/domain/crm';
import { demanderSortie } from '@/lib/brouillon';
import { ouvrirLien } from '@/lib/ouvrir-lien';
import { messageErreur, useCharger } from '@/lib/useCharger';

import { Hero } from './coque';
import { Bouton, Carte, Erreur, SousTitre, Texte } from './composants';
import { Saisie } from './crm/dossier';
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

/** Ses coordonnées : e-mail (son identifiant de connexion), téléphone et adresse postale pour ses factures. */
function MesInformations({ infos, apercu, onModifie }: { infos: MesInfos | null; apercu: boolean; onModifie: () => void }) {
  const [edition, setEdition] = useState<{ email: string; telephone: string; adresse: string } | null>(null);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  if (edition) {
    const probleme = verifierCoordonnees(edition.email, edition.telephone);
    const set = (cle: keyof typeof edition) => (v: string) => setEdition({ ...edition, [cle]: v });
    const enregistrer = async () => {
      setEnvoi(true);
      setErreur(null);
      try {
        await modifierMesCoordonnees(edition);
        setEdition(null);
        onModifie();
      } catch (e) {
        setErreur(messageErreur(e));
      } finally {
        setEnvoi(false);
      }
    };
    return (
      <Carte>
        <SousTitre>Mes informations</SousTitre>
        <Saisie libelle="E-mail" type="email" valeur={edition.email} onChange={set('email')} aide="C’est aussi l’adresse avec laquelle tu te connectes." />
        <Saisie libelle="Téléphone" type="telephone" valeur={edition.telephone} onChange={set('telephone')} placeholder="06 12 34 56 78" />
        <Saisie libelle="Adresse postale" long valeur={edition.adresse} onChange={set('adresse')} placeholder={'N° et rue\nCode postal et ville'} aide="Elle figure sur tes factures." />
        {(erreur || (probleme && edition.email.trim())) && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur ?? probleme}</Texte>}
        <Bouton libelle="Enregistrer" onPress={enregistrer} chargement={envoi} desactive={!!probleme} />
        <Bouton variante="discret" libelle="Annuler" onPress={() => setEdition(null)} desactive={envoi} />
      </Carte>
    );
  }

  return (
    <Carte>
      <SousTitre>Mes informations</SousTitre>
      <Ligne libelle="E-mail" valeur={infos?.email} />
      <Ligne libelle="Téléphone" valeur={formaterTelephone(infos?.telephone)} />
      <Ligne libelle="Adresse" valeur={infos?.adresse} />
      {!apercu && infos && (
        <Bouton
          variante="discret"
          libelle="Modifier mes informations"
          onPress={() => setEdition({ email: infos.email ?? '', telephone: formaterTelephone(infos.telephone), adresse: infos.adresse ?? '' })}
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
      <MesInformations infos={i} apercu={apercu} onModifie={infos.recharger} />
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
