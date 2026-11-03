// Abonnements côté coach (offre du client, packs de séances) et côté client (séances restantes).
// Le coach choisit une de ses offres et une remise, puis encaisse à la main ou envoie un lien de paiement Stripe :
// l'argent arrive sur son propre compte Stripe.
import { useState } from 'react';
import { Platform, Pressable, Share, Text, View } from 'react-native';

import { depot } from '@/data';
import { abonnements } from '@/data/abonnements';
import { offres } from '@/data/offres';
import { useSession } from '@/data/session';
import {
  LIBELLES_STATUT_STRIPE,
  libelleRemise,
  lireRemise,
  MAX_VIDEOS_MOIS,
  PACKS,
  prixAbonnement,
  prixAvecRemise,
  remiseEnCours,
  restantes,
  soldeSeances,
  statutOuvreAcces,
  suffixeAbonnement,
  TARIFS,
  type Abonnement,
  type Remise,
  type TypePack,
} from '@/domain/abonnements';
import { contenuOffre, droitsOffre, libellePrix } from '@/domain/offres';
import { ouvrirLien } from '@/lib/ouvrir-lien';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Erreur, SousTitre, Texte } from './composants';
import { Selecteur } from './coque';
import { CaseACocher, Saisie } from './crm/dossier';
import { couleurs, espace, polices } from './theme';

const euros = (n: number) => `${n.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} €`;
const aujourdhui = () => new Date().toISOString().slice(0, 10);
const dateFr = (j: string) => j.split('-').reverse().join('/');

/** Remise exceptionnelle : 100 % pour un testeur, ou un pourcentage ou un montant au choix. */
function RemiseCoach({ a, occupe, changer }: { a: Abonnement; occupe: boolean; changer: (m: Partial<Abonnement>) => Promise<void> }) {
  const [ouvert, setOuvert] = useState(false);
  // Pré-rempli avec la remise en place, sinon avec l'offre testeur (100 %).
  const [type, setType] = useState<Remise['type']>(a.remise?.type ?? 'pourcent');
  const [valeur, setValeur] = useState(String(a.remise?.valeur ?? 100).replace('.', ','));
  const [motif, setMotif] = useState(a.remise ? (a.remise.motif ?? '') : 'Merci d’être testeur');
  const [fin, setFin] = useState(a.remise?.jusquAu ? dateFr(a.remise.jusquAu) : '');
  const [erreur, setErreur] = useState<string>();
  const p = prixAvecRemise(prixAbonnement(a), a.remise, aujourdhui());
  const enCours = remiseEnCours(a.remise, aujourdhui());
  const suffixe = suffixeAbonnement(a);

  const appliquer = () => {
    const r = lireRemise(type, valeur, motif, fin);
    if (typeof r === 'string') return setErreur(r);
    setErreur(undefined);
    void changer({ remise: r }).then(() => setOuvert(false));
  };

  return (
    <View style={{ gap: espace(2) }}>
      <Texte style={{ fontSize: 14 }}>
        {enCours
          ? `Prix ${euros(p.prix)} · remise −${euros(p.remise)} · à encaisser ${euros(p.aPayer)} ${suffixe}${p.offert ? ' (offert)' : ''}.`
          : `À encaisser : ${euros(p.prix)} ${suffixe}.`}
      </Texte>
      {a.remise && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espace(2) }}>
          <Texte doux style={{ fontSize: 13, flexShrink: 1 }}>
            Remise : {libelleRemise(a.remise)}
            {a.remise.motif ? ` · « ${a.remise.motif} »` : ''}
            {!enCours ? ' · terminée' : ''}
          </Texte>
          <Pressable accessibilityRole="button" onPress={() => !occupe && changer({ remise: undefined })} disabled={occupe}>
            <Text style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.rouge }}>Retirer</Text>
          </Pressable>
        </View>
      )}
      {!ouvert ? (
        <Bouton variante="discret" libelle={a.remise ? 'Changer la remise' : 'Accorder une remise (testeur, geste…)'} onPress={() => setOuvert(true)} desactive={occupe} />
      ) : (
        <View style={{ gap: espace(2) }}>
          <Selecteur
            libelle="Type de remise"
            options={[
              { cle: 'pourcent', libelle: 'En pourcentage (100 % = offert)' },
              { cle: 'montant', libelle: 'En euros par mois' },
            ]}
            valeur={type}
            onChange={(v) => setType(v as Remise['type'])}
          />
          <Saisie libelle={type === 'pourcent' ? 'Remise (%)' : 'Remise (€ par mois)'} type="nombre" valeur={valeur} onChange={setValeur} />
          <Saisie libelle="Message affiché au client" valeur={motif} onChange={setMotif} aide="Par exemple « Merci d’être testeur ». Il voit le prix normal et ta remise." />
          <Saisie libelle="Jusqu’au (facultatif)" valeur={fin} onChange={setFin} placeholder="31/12/2026" aide="Vide : la remise reste jusqu’à ce que tu la retires." />
          {erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
          <View style={{ flexDirection: 'row', gap: espace(2) }}>
            <View style={{ flex: 1 }}>
              <Bouton libelle="Appliquer la remise" onPress={appliquer} chargement={occupe} />
            </View>
            <View style={{ flex: 1 }}>
              <Bouton variante="discret" libelle="Annuler" onPress={() => setOuvert(false)} />
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

/** Mode de paiement : à la main (lignes « En attente » dans la Gestion) ou prélèvement Stripe. */
function PaiementCoach({ clientId, prenom, a, recharger }: { clientId: string; prenom: string; a: Abonnement; recharger: () => void }) {
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [info, setInfo] = useState<string>();
  const [lien, setLien] = useState<string>();
  const [resilier, setResilier] = useState(false);
  const p = prixAvecRemise(prixAbonnement(a), a.remise, aujourdhui());
  const statut = a.statutStripe;
  const enCours = !!statut && statutOuvreAcces(statut);

  async function faire(action: () => Promise<void>) {
    setErreur(undefined);
    setInfo(undefined);
    setOccupe(true);
    try {
      await action();
      recharger();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Action impossible pour le moment.');
    } finally {
      setOccupe(false);
    }
  }
  const demarrer = () =>
    faire(async () => {
      const r = await abonnements.demarrerStripe(clientId);
      setLien(r.lien);
      if (r.demarre) setInfo(enCours ? 'Prélèvement mis à jour : l’offre et la remise s’appliquent à la prochaine échéance.' : `Abonnement démarré : ${prenom} n’a rien à payer.`);
    });
  const message = (url: string) =>
    `Bonjour ${prenom}, voici le lien pour régler ton abonnement (${a.offre?.nom ?? 'coaching'}, ${euros(p.aPayer)} ${suffixeAbonnement(a)}) : ${url}`;

  return (
    <View style={{ gap: espace(2) }}>
      <Selecteur
        libelle="Paiement"
        options={[
          { cle: 'manuel', libelle: 'À la main (virement, espèces…)' },
          { cle: 'stripe', libelle: 'Prélèvement automatique (Stripe)' },
        ]}
        valeur={a.paiement ?? 'manuel'}
        onChange={(v) => !occupe && faire(() => abonnements.changer(clientId, { paiement: v as 'manuel' | 'stripe' }))}
      />
      {a.paiement !== 'stripe' ? (
        <Texte doux style={{ fontSize: 13 }}>
          {p.offert ? 'Offert : la ligne du mois arrive « Payé » à 0 € dans ta Gestion.' : 'Chaque mois, une ligne « En attente » arrive dans ta Gestion : passe-la à « Payé » quand tu as encaissé.'}
        </Texte>
      ) : (
        <>
          <Texte style={{ fontSize: 14 }}>
            {statut ? LIBELLES_STATUT_STRIPE[statut] : 'Pas encore démarré'}
            {a.prochaineEcheance ? ` · prochain prélèvement le ${dateFr(a.prochaineEcheance)}` : ''}
          </Texte>
          {!a.offre && <Texte doux style={{ fontSize: 13 }}>Choisis une de tes offres pour passer par Stripe.</Texte>}
          {a.offre && (
            <Bouton
              libelle={enCours ? 'Appliquer l’offre et la remise au prélèvement' : p.offert ? 'Démarrer l’abonnement offert' : 'Créer le lien de paiement'}
              onPress={demarrer}
              chargement={occupe}
            />
          )}
          {lien && (
            <View style={{ gap: espace(2) }}>
              <Text selectable style={{ fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux }}>
                {lien}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) }}>
                <View style={{ flexGrow: 1 }}>
                  <Bouton variante="discret" libelle="Envoyer par WhatsApp" onPress={() => void ouvrirLien(`https://wa.me/?text=${encodeURIComponent(message(lien))}`)} />
                </View>
                {Platform.OS !== 'web' && (
                  <View style={{ flexGrow: 1 }}>
                    <Bouton variante="discret" libelle="Partager…" onPress={() => void Share.share({ message: message(lien) })} />
                  </View>
                )}
              </View>
            </View>
          )}
          {enCours && (
            <Bouton
              variante="discret"
              libelle={resilier ? 'Confirmer : arrêter à la fin du mois payé' : 'Résilier le prélèvement'}
              onPress={() => (resilier ? faire(() => abonnements.resilierStripe(clientId)).then(() => setResilier(false)) : setResilier(true))}
              desactive={occupe}
            />
          )}
        </>
      )}
      {info && <Texte style={{ fontSize: 14 }}>{info}</Texte>}
      {erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
    </View>
  );
}

/** Fiche du contact : ce que le client a payé, et donc ce qu'il voit dans l'appli. */
export function AbonnementClient({ clientId, prenom, onChange }: { clientId: string; prenom: string; onChange?: (a: Abonnement) => void }) {
  const abo = useCharger(() => abonnements.lire(clientId), `abo-${clientId}`);
  const packs = useCharger(() => abonnements.packs(clientId), `packs-${clientId}`);
  const [erreur, setErreur] = useState<string>();
  const [occupe, setOccupe] = useState(false);
  const [aSupprimer, setASupprimer] = useState<string>();
  const [tarif, setTarif] = useState<string>();
  const [prixNegocie, setPrixNegocie] = useState('');
  const { profil } = useSession();
  const coachId = profil?.role === 'coach' ? profil.coachId : '';
  const autres = useCharger(() => (coachId ? depot.clientsDuCoach(coachId) : Promise.resolve([])), `clients-${coachId}`);
  const mesOffres = useCharger(() => offres.lister(), 'offres');
  const [prixSurMesure, setPrixSurMesure] = useState<string>();

  async function faire(action: () => Promise<void>, apres: () => void) {
    setErreur(undefined);
    setOccupe(true);
    try {
      await action();
      apres();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Action impossible pour le moment.');
    } finally {
      setOccupe(false);
    }
  }

  const changer = (modif: Partial<Abonnement>) =>
    faire(
      () => abonnements.changer(clientId, modif),
      () => {
        if (abo.donnee) onChange?.({ ...abo.donnee, ...modif });
        abo.recharger();
      },
    );
  const prixSaisi = prixNegocie.trim() ? Number(prixNegocie.replace(',', '.')) : undefined;
  const prixValide = prixSaisi === undefined || (Number.isFinite(prixSaisi) && prixSaisi >= 0);
  const ajouter = (type: TypePack) =>
    faire(
      () => abonnements.ajouterPack(clientId, type, prixSaisi),
      () => {
        setPrixNegocie('');
        packs.recharger();
      },
    );
  const partager = (packId: string, autre: string) => faire(() => abonnements.partagerPack(packId, autre), packs.recharger);
  const retirerPartage = (packId: string, autre: string) => faire(() => abonnements.retirerPartage(packId, autre), packs.recharger);
  const tarifSaisi = tarif === undefined ? undefined : Number(tarif.replace(',', '.'));
  const enregistrerTarif = () =>
    tarifSaisi !== undefined && Number.isFinite(tarifSaisi) && tarifSaisi >= 0
      ? changer({ tarifSeance: tarifSaisi }).then(() => setTarif(undefined))
      : setErreur('Tarif illisible : écris un montant comme 50 ou 47,50.');
  const decompter = (sens: 1 | -1) => faire(() => abonnements.decompter(clientId, sens), packs.recharger);
  const supprimer = (packId: string) =>
    faire(
      () => abonnements.supprimerPack(packId),
      () => {
        setASupprimer(undefined);
        packs.recharger();
      },
    );

  if (abo.erreur) return <Erreur message={abo.erreur} onReessayer={abo.recharger} />;
  const a = abo.donnee;
  const liste = packs.donnee ?? [];
  const solde = soldeSeances(liste);
  const dejaFaites = liste.some((p) => p.seancesFaites > 0);

  return (
    <Carte>
      <SousTitre>Abonnement</SousTitre>
      {a && (
        <>
          <Selecteur
            libelle="Offre"
            options={[
              // Ses offres en vente (abonnements), et celle du client même si elle n'est plus proposée.
              ...(mesOffres.donnee ?? [])
                .filter((o) => o.periodicite !== 'unique' && (o.active || o.id === a.offre?.id))
                .map((o) => ({ cle: o.id, libelle: `${o.nom} · ${libellePrix(o)}${o.active ? '' : ' (plus proposée)'}` })),
              { cle: 'sur-mesure', libelle: 'Sur mesure (cases ci-dessous)' },
              { cle: 'aucune', libelle: 'Séances seulement, sans appli' },
            ]}
            valeur={a.offre?.id ?? (a.accesAppli ? 'sur-mesure' : 'aucune')}
            onChange={(v) => {
              if (occupe) return;
              const o = mesOffres.donnee?.find((x) => x.id === v);
              void changer(
                o
                  ? // Nouvelle offre : le client paiera son prix actuel.
                    { offre: o, offrePrix: o.prix, ...droitsOffre(o) }
                  : v === 'aucune'
                    ? { offre: undefined, offrePrix: undefined, accesAppli: false, optionNutrition: false }
                    : { offre: undefined, accesAppli: true },
              );
            }}
          />
          {(mesOffres.donnee ?? []).length === 0 && !mesOffres.erreur && (
            <Texte doux style={{ fontSize: 13 }}>Crée tes offres dans « Mes offres » (menu de l’Accueil) pour les proposer ici.</Texte>
          )}
          {a.offre && (
            <Texte doux style={{ fontSize: 13 }}>
              {contenuOffre(a.offre).join(' · ')}
              {a.offrePrix !== undefined && a.offrePrix !== a.offre.prix
                ? `\nPrix gardé : ${libellePrix(a.offre, a.offrePrix)} (prix actuel de l’offre : ${libellePrix(a.offre)}).`
                : ''}
            </Texte>
          )}
          {a.accesAppli && !a.offre && (
            <>
              <CaseACocher
                libelle="Accès à l’appli (programmes, séances, suivi, macros)"
                valeur={a.accesAppli}
                onChange={(v) => !occupe && changer(v ? { accesAppli: true } : { accesAppli: false, optionNutrition: false })}
              />
              <CaseACocher
                libelle="Nutrition complète (recettes, plan de repas)"
                valeur={a.optionNutrition}
                onChange={(v) => !occupe && changer({ optionNutrition: v })}
              />
              <Selecteur
                libelle={`Vidéos corrigées incluses par mois (au-delà : ${euros(TARIFS.video)} la vidéo)`}
                options={Array.from({ length: MAX_VIDEOS_MOIS + 1 }, (_, n) => ({ cle: String(n), libelle: n === 0 ? 'Aucune' : `${n} par mois` }))}
                valeur={String(a.videosMois ?? 0)}
                onChange={(v) => !occupe && changer({ videosMois: Number(v) })}
              />
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: espace(2) }}>
                <View style={{ flex: 1 }}>
                  <Saisie
                    libelle="Prix par mois (€)"
                    type="nombre"
                    valeur={prixSurMesure ?? (a.offrePrix === undefined ? '' : String(a.offrePrix).replace('.', ','))}
                    onChange={setPrixSurMesure}
                    aide="Vide : rien à encaisser chaque mois."
                  />
                </View>
                {prixSurMesure !== undefined && (
                  <View style={{ marginBottom: espace(6) }}>
                    <Bouton
                      libelle="Enregistrer"
                      chargement={occupe}
                      onPress={() => {
                        const n = prixSurMesure.trim() ? Number(prixSurMesure.replace(',', '.')) : undefined;
                        if (n !== undefined && !(Number.isFinite(n) && n >= 0)) return setErreur('Prix illisible : écris un montant comme 79 ou 79,90.');
                        void changer({ offrePrix: n }).then(() => setPrixSurMesure(undefined));
                      }}
                    />
                  </View>
                )}
              </View>
            </>
          )}
          {a.accesAppli ? (
            <>
              <RemiseCoach a={a} occupe={occupe} changer={changer} />
              <PaiementCoach clientId={clientId} prenom={prenom} a={a} recharger={abo.recharger} />
            </>
          ) : (
            <Texte doux style={{ fontSize: 13 }}>{`${prenom} n’a pas accès à l’appli : tu l’enregistres ici, il ne peut pas se connecter.`}</Texte>
          )}
        </>
      )}

      <View style={{ height: 1, backgroundColor: couleurs.bordure, marginVertical: espace(2) }} />
      <SousTitre>Séances avec toi</SousTitre>
      {a && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: espace(2) }}>
          <View style={{ flex: 1 }}>
            <Saisie
              libelle="Tarif d’une séance à l’unité (€)"
              type="nombre"
              valeur={tarif ?? String(a.tarifSeance ?? TARIFS.seance).replace('.', ',')}
              onChange={setTarif}
              aide="Partagé entre les personnes présentes quand elles viennent à plusieurs."
            />
          </View>
          {tarif !== undefined && (
            <View style={{ marginBottom: espace(6) }}>
              <Bouton libelle="Enregistrer" onPress={enregistrerTarif} chargement={occupe} />
            </View>
          )}
        </View>
      )}
      {packs.erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{packs.erreur}</Texte>}
      <Texte style={{ fontSize: 14 }}>
        {solde.total ? `${solde.restantes} séance${solde.restantes > 1 ? 's' : ''} restante${solde.restantes > 1 ? 's' : ''} sur ${solde.total}.` : 'Aucune séance en cours.'}
      </Texte>
      {liste
        .filter((p) => restantes(p) > 0)
        .map((p) => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espace(2) }}>
            <View style={{ flexShrink: 1, gap: espace(1) }}>
              <Texte doux style={{ fontSize: 13 }}>
                {p.seancesTotal === 1 ? 'Séance à l’unité' : `Pack de ${p.seancesTotal}`} du {p.acheteLe.split('-').reverse().join('/')} : {p.seancesFaites} faite
                {p.seancesFaites > 1 ? 's' : ''}
                {p.titulaire ? ` · pack de ${p.titulaire.prenom || 'un autre client'}, partagé` : ''}
              </Texte>
              {!p.titulaire &&
                p.partageAvec?.map((x) => (
                  <View key={x.clientId} style={{ flexDirection: 'row', alignItems: 'center', gap: espace(2) }}>
                    <Texte doux style={{ fontSize: 13 }}>Partagé avec {x.prenom || 'un client'}</Texte>
                    <Pressable accessibilityRole="button" onPress={() => retirerPartage(p.id, x.clientId)} disabled={occupe}>
                      <Text style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.rouge }}>Retirer</Text>
                    </Pressable>
                  </View>
                ))}
              {!p.titulaire && (autres.donnee ?? []).length > 1 && (
                <Selecteur
                  libelle="Partager ce pack avec…"
                  sansLibelle
                  options={[
                    { cle: '', libelle: 'Partager ce pack avec… (couple, duo)' },
                    ...(autres.donnee ?? [])
                      .filter((c) => c.id !== clientId && !p.partageAvec?.some((x) => x.clientId === c.id))
                      .map((c) => ({ cle: c.id, libelle: `${c.prenom} ${c.nom}`.trim() })),
                  ]}
                  valeur=""
                  onChange={(id) => id && partager(p.id, id)}
                />
              )}
            </View>
            {/* Deux appuis : le premier demande confirmation. */}
            {!p.titulaire && (
              <Pressable accessibilityRole="button" onPress={() => (aSupprimer === p.id ? supprimer(p.id) : setASupprimer(p.id))} disabled={occupe} style={{ padding: espace(2) }}>
                <Text style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.rouge }}>{aSupprimer === p.id ? 'Confirmer la suppression' : 'Supprimer'}</Text>
              </Pressable>
            )}
          </View>
        ))}
      <Texte doux style={{ fontSize: 13 }}>Les séances de l’agenda se décomptent toutes seules une fois passées. Ce bouton sert aux séances faites hors agenda.</Texte>
      <Bouton libelle="Séance faite (−1)" onPress={() => decompter(1)} desactive={!solde.restantes} chargement={occupe} />
      <Saisie
        libelle="Prix négocié du prochain pack (€, facultatif)"
        type="nombre"
        valeur={prixNegocie}
        onChange={setPrixNegocie}
        erreur={prixValide ? undefined : 'Montant illisible.'}
        aide="Vide : prix habituel du pack."
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) }}>
        {(Object.keys(PACKS) as TypePack[]).map((t) => (
          <View key={t} style={{ flexGrow: 1 }}>
            <Bouton
              variante="discret"
              libelle={`+ ${PACKS[t].libelle} · ${euros(prixSaisi ?? PACKS[t].prix)}`}
              onPress={() => ajouter(t)}
              desactive={occupe || !prixValide}
            />
          </View>
        ))}
      </View>
      {dejaFaites && <Bouton variante="discret" libelle="Annuler la dernière séance décomptée" onPress={() => decompter(-1)} desactive={occupe} />}
      {erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
    </Carte>
  );
}

/** Espace client : séances restantes avec le coach, affiché seulement s'il a un pack en cours. */
export function SeancesRestantes({ clientId }: { clientId: string }) {
  const { donnee } = useCharger(() => abonnements.packs(clientId), `packs-${clientId}`);
  const solde = soldeSeances(donnee ?? []);
  if (!solde.total) return null;
  return (
    <Carte>
      <Texte style={{ fontSize: 15 }}>
        Séances avec ton coach : <Texte style={{ fontSize: 15, color: couleurs.rouge }}>{solde.restantes}</Texte> restante{solde.restantes > 1 ? 's' : ''} sur{' '}
        {solde.total}
      </Texte>
    </Carte>
  );
}

/** Accueil d'un client dont le coach a mis l'accès en pause. */
export function AccesSuspendu({ prenom }: { prenom: string }) {
  return (
    <Carte>
      <SousTitre>Bonjour {prenom}</SousTitre>
      <Texte style={{ fontSize: 15 }}>Ton accès à l’appli est en pause pour le moment. Tout ton suivi est conservé et sera là quand il reprendra.</Texte>
      <Texte doux style={{ fontSize: 14 }}>Pour toute question, contacte ton coach.</Texte>
    </Carte>
  );
}
