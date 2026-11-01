// Abonnements côté coach (formule du client, packs de séances) et côté client (séances restantes).
// Rien ne s'achète dans l'appli : le client ne voit aucun prix ni bouton d'achat (règles Apple et Google).
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { depot } from '@/data';
import { abonnements } from '@/data/abonnements';
import { useSession } from '@/data/session';
import { mensualite, PACKS, restantes, soldeSeances, TARIFS, type Abonnement, type TypePack } from '@/domain/abonnements';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Erreur, SousTitre, Texte } from './composants';
import { Selecteur } from './coque';
import { CaseACocher, Saisie } from './crm/dossier';
import { couleurs, espace, polices } from './theme';

const euros = (n: number) => `${n.toLocaleString('fr-FR')} €`;

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
          <CaseACocher
            libelle={`Accès à l’appli · ${euros(TARIFS.appli)}/mois (programmes, séances, suivi, macros)`}
            valeur={a.accesAppli}
            onChange={(v) => !occupe && changer(v ? { accesAppli: true } : { accesAppli: false, optionNutrition: false })}
          />
          {a.accesAppli && (
            <CaseACocher
              libelle={`Option nutrition · +${euros(TARIFS.optionNutrition)}/mois (recettes, plan de repas)`}
              valeur={a.optionNutrition}
              onChange={(v) => !occupe && changer({ optionNutrition: v })}
            />
          )}
          <Texte doux style={{ fontSize: 13 }}>
            {a.accesAppli
              ? `À encaisser : ${euros(mensualite(a))} par mois.`
              : `${prenom} n’a pas accès à l’appli : tu l’enregistres ici, il ne peut pas se connecter.`}
          </Texte>
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
