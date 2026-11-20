// « Mon compte » du client (ouvert depuis son avatar, en haut de l'écran) : ses coordonnées, son offre, les offres de son coach, ses documents et l'accès à ses données (RGPD).
// Son offre s'affiche avec son prix et la remise du coach. Le paiement se fait sur la page Stripe du coach,
// jamais dans l'appli iPhone : sur iPhone, le client demande le lien à son coach.
import { router } from 'expo-router';
import { useState } from 'react';
import { Check } from 'lucide-react-native';
import { Platform, View } from 'react-native';

import { abonnements } from '@/data/abonnements';
import { offres } from '@/data/offres';
import { mesInfos, modifierMesCoordonnees, monCoach, type MesInfos } from '@/data/acces-client';
import {
  peutPasserA,
  prixAbonnement,
  prixAvecRemise,
  prorataChangement,
  remiseEnCours,
  soldeSeances,
  statutOuvreAcces,
  suffixeAbonnement,
  type Abonnement,
} from '@/domain/abonnements';
import { contenuOffre, libellePrix, type Offre } from '@/domain/offres';
import { verifierCoordonnees } from '@/domain/acces-client';
import { formaterTelephone, normaliserTelephone } from '@/domain/crm';
import { demanderSortie } from '@/lib/brouillon';
import { ouvrirLien } from '@/lib/ouvrir-lien';
import { messageErreur, useCharger } from '@/lib/useCharger';

import { Hero } from './coque';
import { Bouton, Carte, Erreur, SousTitre, Texte } from './composants';
import { Saisie } from './crm/dossier';
import { MesDocuments } from './mes-documents';
import { MesFactures } from './factures';
import { CarteOffre } from './offres/carte-offre';
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

const euros = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`;

/** Prix normal, cadeau du coach et prochain prélèvement. */
function MaFormule({ a, apercu }: { a: Abonnement; apercu: boolean }) {
  const [erreur, setErreur] = useState<string>();
  const [occupe, setOccupe] = useState(false);
  const jour = new Date().toISOString().slice(0, 10);
  const p = prixAvecRemise(prixAbonnement(a), a.remise, jour);
  const suffixe = suffixeAbonnement(a);
  const remise = remiseEnCours(a.remise, jour) ? a.remise : undefined;
  // Gérer sa carte ou résilier passe par la page Stripe ; pas de lien de paiement dans l'appli iPhone (règles Apple).
  const portail = !apercu && Platform.OS !== 'ios' && a.paiement === 'stripe' && !!a.statutStripe && statutOuvreAcces(a.statutStripe);
  const ouvrirPortail = async () => {
    setErreur(undefined);
    setOccupe(true);
    try {
      await ouvrirLien(await abonnements.portailStripe());
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  };

  return (
    <>
      {a.offre && <Ligne libelle="Offre" valeur={a.offre.nom} />}
      {p.prix > 0 && <Ligne libelle="Prix" valeur={`${euros(p.prix)} ${suffixe}`} />}
      {remise && (
        <>
          <Ligne libelle={remise.motif || 'Cadeau de ton coach'} valeur={`−${euros(p.remise)} ${suffixe}`} />
          <Ligne libelle="Tu paies" valeur={p.offert ? '0 € · offert par ton coach' : `${euros(p.aPayer)} ${suffixe}`} />
          {remise.jusquAu && <Texte doux style={{ fontSize: 13 }}>{`Remise valable jusqu’au ${remise.jusquAu.split('-').reverse().join('/')}.`}</Texte>}
        </>
      )}
      {a.paiement === 'stripe' && a.prochaineEcheance && !p.offert && (
        <Ligne libelle="Prochain prélèvement" valeur={a.prochaineEcheance.split('-').reverse().join('/')} />
      )}
      {portail && <Bouton variante="discret" libelle="Gérer mon paiement" onPress={ouvrirPortail} chargement={occupe} />}
      {erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
    </>
  );
}

/** Passer tout de suite à une offre plus chère : deux appuis, avec la différence à payer aujourd'hui. */
function PasserA({ a, o, onFait }: { a: Abonnement; o: Offre; onFait: () => void }) {
  const [confirmer, setConfirmer] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [fait, setFait] = useState<string>();
  const jour = new Date().toISOString().slice(0, 10);
  const prorata = prorataChangement(a, o, jour);
  const passer = async () => {
    setErreur(undefined);
    setOccupe(true);
    try {
      const r = await offres.changer(o.id);
      setFait(`C’est fait : ton offre est maintenant « ${o.nom} »${r.paye > 0 ? `, ${euros(r.paye)} de différence payés` : ''}. Ton coach est prévenu.`);
      onFait();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  };
  if (fait) return <Texte style={{ fontSize: 14 }}>{fait}</Texte>;
  return (
    <>
      {confirmer && (
        <Texte doux style={{ fontSize: 13 }}>
          {`Ça change tout de suite. Tu paies aujourd’hui la différence jusqu’à ton prochain prélèvement${prorata !== undefined ? ` (environ ${euros(prorata)})` : ''}, puis ${libellePrix(o)}.`}
        </Texte>
      )}
      <Bouton
        variante={confirmer ? 'primaire' : 'discret'}
        libelle={confirmer ? 'Confirmer et payer la différence' : 'Passer à cette offre'}
        onPress={() => (confirmer ? passer() : setConfirmer(true))}
        chargement={occupe}
      />
      {confirmer && !occupe && <Bouton variante="discret" libelle="Annuler" onPress={() => setConfirmer(false)} />}
      {erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
    </>
  );
}

/** Les offres proposées par son coach : sur Android et le web, il choisit et paie sur la page Stripe de son coach. */
function OffresDeMonCoach({ a, apercu, onChange }: { a?: Abonnement | null; apercu: boolean; onChange: () => void }) {
  const liste = useCharger(() => offres.lister(), 'offres-de-mon-coach');
  const [occupe, setOccupe] = useState<string>();
  const [erreur, setErreur] = useState<string>();
  // Pas de paiement depuis l'appli iPhone (règles Apple) : le coach envoie le lien.
  const payable = !apercu && Platform.OS !== 'ios';
  // Déjà une offre (payée en ligne, à la main ou offerte) : il voit les packs de séances, et les offres supérieures
  // vers lesquelles il peut passer tout de suite si son abonnement est payé par carte. Le reste se voit avec le coach,
  // pour ne jamais payer deux abonnements.
  const aUneOffre = !!a?.offre || !!a?.accesAppli;
  const proposees = (liste.donnee ?? []).filter(
    (o) => o.active && o.id !== a?.offre?.id && (!aUneOffre || o.periodicite === 'unique' || (payable && !!a && peutPasserA(a, o))),
  );
  if (!proposees.length) return null;
  const choisir = async (id: string) => {
    setErreur(undefined);
    setOccupe(id);
    try {
      await ouvrirLien(await offres.payer(id));
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(undefined);
    }
  };
  return (
    <>
      <SousTitre>{aUneOffre ? 'Aller plus loin' : 'Les offres de mon coach'}</SousTitre>
      {proposees.map((o) => (
        <CarteOffre key={o.id} offre={o} mention={o.conseil ? 'Conseillée par ton coach' : undefined}>
          {aUneOffre && a && o.periodicite !== 'unique' ? (
            <PasserA a={a} o={o} onFait={onChange} />
          ) : payable ? (
            <Bouton variante="discret" libelle={o.periodicite === 'unique' ? 'Acheter ce pack' : 'Choisir cette offre'} onPress={() => choisir(o.id)} chargement={occupe === o.id} />
          ) : (
            <Texte doux style={{ fontSize: 13 }}>Envie de cette offre ? Demande le lien à ton coach.</Texte>
          )}
        </CarteOffre>
      ))}
      {aUneOffre && <Texte doux style={{ fontSize: 13 }}>Pour une autre offre, écris à ton coach.</Texte>}
      {erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
    </>
  );
}

export function MonCompte({
  clientId,
  prenom,
  apercu,
  onOuvrirMontre,
  onOuvrirQuotidien,
  onDeconnecter,
}: {
  clientId: string;
  prenom: string;
  apercu: boolean;
  onOuvrirMontre?: () => void;
  onOuvrirQuotidien?: () => void;
  onDeconnecter?: () => void;
}) {
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
        <SousTitre>Mon offre</SousTitre>
        {abo.donnee && (
          <>
            <MaFormule a={abo.donnee} apercu={apercu} />
            {abo.donnee.offre ? (
              // Ce que comprend son offre, dans les mêmes mots que sur la page de l'offre.
              <View style={{ gap: espace(1) }}>
                {contenuOffre(abo.donnee.offre).map((l) => (
                  <View key={l} style={{ flexDirection: 'row', gap: espace(2), alignItems: 'flex-start' }}>
                    <Check size={16} color={couleurs.vert} style={{ marginTop: 3 }} />
                    <Texte style={{ fontSize: 14, flex: 1 }}>{l}</Texte>
                  </View>
                ))}
              </View>
            ) : (
              <>
                <Ligne libelle="Appli (programme, séances, suivi)" valeur={abo.donnee.accesAppli ? 'Incluse' : 'Non'} />
                <Ligne libelle="Nutrition" valeur={abo.donnee.optionNutrition ? 'Complète (recettes, plan de repas)' : 'Macros'} />
              </>
            )}
          </>
        )}
        <Ligne
          libelle="Séances avec mon coach"
          valeur={solde.total ? `${solde.restantes} restante${solde.restantes > 1 ? 's' : ''} sur ${solde.total}` : 'Aucune en cours'}
        />
      </Carte>
      <OffresDeMonCoach a={abo.donnee} apercu={apercu} onChange={abo.recharger} />
      <MesDocuments clientId={clientId} />
      <MesFactures clientId={clientId} />
      {!apercu && onOuvrirMontre && <Bouton variante="discret" libelle="Synchroniser ma montre" onPress={onOuvrirMontre} />}
      {!apercu && onOuvrirQuotidien && <Bouton variante="discret" libelle="Mes suivis du quotidien (sommeil, eau, stress…)" onPress={onOuvrirQuotidien} />}
      {!apercu && <Bouton variante="discret" libelle="Mes notifications" onPress={() => demanderSortie(() => router.push('/client/notifications'))} />}
      {!apercu && <Bouton variante="discret" libelle="Mes données et confidentialité" onPress={() => demanderSortie(() => router.push('/client/donnees'))} />}
      {abo.erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{abo.erreur}</Texte>}
      {!apercu && onDeconnecter && <Bouton variante="secondaire" libelle="Se déconnecter" onPress={() => demanderSortie(onDeconnecter)} />}
    </>
  );
}
