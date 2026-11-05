// « Mes offres » : le coach crée ses formules à partir d'un modèle (Suivi en ligne, Hybride, Présentiel, Pack de séances),
// règle le prix, la durée et le contenu, voit l'aperçu tel que ses clients le verront, et partage le lien de paiement.
// L'argent arrive sur son propre compte Stripe, qu'il ouvre ici en quelques minutes.
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Platform, Pressable, Share, Text, View } from 'react-native';

import { factures } from '@/data/factures';
import { offres, type EtatStripe } from '@/data/offres';
import { useSession } from '@/data/session';
import { brochureHtml, offresDeLaBrochure } from '@/domain/brochure';
import { libellePrix, lireOffre, MODELES, PERIODICITES, type ModeleOffre, type Offre, type Periodicite, type SaisieOffre } from '@/domain/offres';
import { adresseWeb } from '@/lib/adresse-web';
import { ouvrirLien } from '@/lib/ouvrir-lien';
import { ouvrirPdf, voirPdf } from '@/lib/pdf';
import { BEBAS_NEUE_BASE64 } from '@/lib/police-titre-pdf';
import { JOST_400_BASE64, JOST_600_BASE64, PHOTO_BROCHURE_BASE64 } from '@/lib/visuels-brochure-pdf';
import { messageErreur, useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, Erreur, SousTitre, Texte } from '../composants';
import { Selecteur } from '../coque';
import { CaseACocher, Saisie } from '../crm/dossier';
import { couleurs, espace, polices } from '../theme';
import { CarteOffre } from './carte-offre';

export const lienOffre = (id: string) => adresseWeb(`/offre/${id}`);

/** Compte Stripe du coach : où arrive l'argent de ses clients. */
function CompteStripe({ etat, recharger }: { etat: EtatStripe | null; recharger: () => void }) {
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const ouvrir = async (lien: () => Promise<string>) => {
    setErreur(undefined);
    setOccupe(true);
    try {
      await ouvrirLien(await lien());
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  };

  return (
    <Carte>
      <SousTitre>Être payé par tes clients</SousTitre>
      {!etat ? (
        <Texte doux style={{ fontSize: 14 }}>Vérification de ton compte Stripe…</Texte>
      ) : etat.pret ? (
        <>
          <Texte style={{ fontSize: 14 }}>✓ Ton compte Stripe est prêt : tes clients paient par carte et l’argent arrive sur ton compte bancaire.</Texte>
          <Bouton variante="discret" libelle="Mon tableau de bord Stripe (virements, factures)" onPress={() => ouvrir(offres.tableauStripe)} chargement={occupe} />
        </>
      ) : etat.enAttente ? (
        <>
          <Texte style={{ fontSize: 14 }}>Stripe vérifie ton dossier. Tu peux déjà préparer tes offres ; le paiement s’ouvrira dès la validation.</Texte>
          <Bouton variante="discret" libelle="Compléter mon dossier Stripe" onPress={() => ouvrir(offres.connecterStripe)} chargement={occupe} />
        </>
      ) : (
        <>
          <Texte style={{ fontSize: 14 }}>
            Ouvre ton compte Stripe en quelques minutes (identité, IBAN). Tes clients te paient directement : CoachGo ne prend rien sur tes ventes.
          </Texte>
          <Bouton libelle={etat.compte ? 'Terminer l’ouverture de mon compte Stripe' : 'Ouvrir mon compte Stripe'} onPress={() => ouvrir(offres.connecterStripe)} chargement={occupe} />
        </>
      )}
      {etat?.compte && !etat.pret && <Bouton variante="discret" libelle="J’ai terminé, vérifier" onPress={recharger} desactive={occupe} />}
      {erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
    </Carte>
  );
}

type Brouillon = Omit<SaisieOffre, 'prix'> & { prix: string };
const versBrouillon = (o: SaisieOffre): Brouillon => ({ ...o, prix: String(o.prix).replace('.', ',') });

/** Création ou modification d'une offre, avec l'aperçu client en direct. */
function EditeurOffre({ offre, onFini }: { offre?: Offre; onFini: () => void }) {
  const [modele, setModele] = useState<ModeleOffre | undefined>(offre?.modele);
  const [b, setB] = useState<Brouillon | undefined>(offre ? versBrouillon(offre) : undefined);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();

  if (!b) {
    return (
      <Carte>
        <SousTitre>Nouvelle offre : choisis un modèle</SousTitre>
        <Texte doux style={{ fontSize: 13 }}>Tout reste modifiable ensuite : nom, prix, durée et contenu.</Texte>
        {(Object.keys(MODELES) as (keyof typeof MODELES)[]).map((m) => (
          <Pressable
            key={m}
            accessibilityRole="button"
            onPress={() => {
              setModele(m);
              setB(versBrouillon(MODELES[m].base));
            }}
            style={({ pressed }) => ({ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 12, padding: espace(3), gap: 2, opacity: pressed ? 0.7 : 1 })}
          >
            <Text style={{ fontFamily: polices.texteMoyen, fontSize: 16, color: couleurs.texte }}>{MODELES[m].libelle}</Text>
            <Texte doux style={{ fontSize: 13 }}>{MODELES[m].description}</Texte>
          </Pressable>
        ))}
        <Bouton variante="discret" libelle="Partir de zéro" onPress={() => setB(versBrouillon({ ...MODELES.en_ligne.base, modele: 'libre', nom: '', accroche: '', prix: 0 }))} />
        <Bouton variante="discret" libelle="Annuler" onPress={onFini} />
      </Carte>
    );
  }

  const maj = (m: Partial<Brouillon>) => setB({ ...b, ...m });
  const unique = b.periodicite === 'unique';
  const lu = lireOffre(b);
  const apercu = typeof lu === 'string' ? { ...b, prix: Number(b.prix.replace(',', '.')) || 0 } : lu;

  const enregistrer = async () => {
    if (typeof lu === 'string') return setErreur(lu);
    setErreur(undefined);
    setOccupe(true);
    try {
      const id = await offres.enregistrer({ ...lu, modele: modele ?? lu.modele }, offre?.id);
      // Mise en ligne sur Stripe tout de suite si le compte est prêt ; sinon elle se fera au premier paiement.
      await offres.publier(id).catch(() => undefined);
      onFini();
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  };

  return (
    <>
      <Carte>
        <SousTitre>{offre ? 'Modifier l’offre' : `Nouvelle offre${modele && modele !== 'libre' ? ` · ${MODELES[modele].libelle}` : ''}`}</SousTitre>
        <Saisie libelle="Nom de l’offre" valeur={b.nom} onChange={(v) => maj({ nom: v })} max={60} placeholder="Suivi en ligne" />
        <Saisie libelle="Phrase d’accroche (facultatif)" valeur={b.accroche ?? ''} onChange={(v) => maj({ accroche: v })} max={140} />
        <Selecteur
          libelle="Durée"
          options={(Object.keys(PERIODICITES) as Periodicite[]).map((p) => ({ cle: p, libelle: PERIODICITES[p].libelle }))}
          valeur={b.periodicite}
          onChange={(p) =>
            maj(
              p === 'unique'
                ? { periodicite: p, accesAppli: false, nutrition: false, videosMois: 0, essaiJours: 0, seances: Math.max(1, b.seances) }
                : { periodicite: p, accesAppli: b.periodicite === 'unique' ? true : b.accesAppli },
            )
          }
        />
        <Saisie libelle={`Prix (€ ${PERIODICITES[b.periodicite].suffixe})`} type="nombre" valeur={b.prix} onChange={(v) => maj({ prix: v })} />
        {offre && offre.prix !== Number(b.prix.replace(',', '.')) && (
          <Texte doux style={{ fontSize: 13 }}>Tes clients déjà abonnés gardent leur prix actuel. Le nouveau prix vaut pour les prochains.</Texte>
        )}

        <Texte style={{ fontFamily: polices.texteMoyen, fontSize: 15, marginTop: espace(2) }}>Ce qui est inclus</Texte>
        <Selecteur
          libelle={unique ? 'Séances dans le pack' : `Séances avec toi (en salle ou en visio) ${b.periodicite === 'annee' ? 'par an' : b.periodicite === 'trimestre' ? 'par trimestre' : 'par mois'}`}
          options={Array.from({ length: unique ? 30 : 21 }, (_, i) => (unique ? i + 1 : i)).map((n) => ({ cle: String(n), libelle: n === 0 ? 'Aucune' : String(n) }))}
          valeur={String(b.seances)}
          onChange={(v) => maj({ seances: Number(v) })}
        />
        {!unique && (
          <>
            <CaseACocher
              libelle="Programme et suivi dans l’appli"
              valeur={b.accesAppli}
              onChange={(v) => maj({ accesAppli: v, nutrition: v ? b.nutrition : false, videosMois: v ? b.videosMois : 0 })}
            />
            {b.accesAppli && (
              <CaseACocher libelle="Nutrition complète (recettes, plan de repas, photo d’assiette)" valeur={b.nutrition} onChange={(v) => maj({ nutrition: v })} />
            )}
            <CaseACocher libelle="Messagerie avec toi" valeur={b.messagerie} onChange={(v) => maj({ messagerie: v })} />
            {b.accesAppli && (
              <Selecteur
                libelle="Vidéos corrigées par mois"
                options={Array.from({ length: 9 }, (_, n) => ({ cle: String(n), libelle: n === 0 ? 'Aucune' : `${n} par mois` }))}
                valeur={String(Math.min(8, b.videosMois))}
                onChange={(v) => maj({ videosMois: Number(v) })}
              />
            )}
            <Selecteur
              libelle="Essai gratuit"
              options={[0, 7, 14, 30].map((n) => ({ cle: String(n), libelle: n === 0 ? 'Pas d’essai' : `${n} jours offerts` }))}
              valeur={String([0, 7, 14, 30].includes(b.essaiJours) ? b.essaiJours : 0)}
              onChange={(v) => maj({ essaiJours: Number(v) })}
            />
          </>
        )}
        {erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
        <View style={{ flexDirection: 'row', gap: espace(2) }}>
          <View style={{ flex: 1 }}>
            <Bouton libelle={offre ? 'Enregistrer' : 'Créer l’offre'} onPress={enregistrer} chargement={occupe} />
          </View>
          <View style={{ flex: 1 }}>
            <Bouton variante="discret" libelle="Annuler" onPress={onFini} desactive={occupe} />
          </View>
        </View>
      </Carte>
      <Texte doux style={{ fontSize: 13, marginTop: espace(3), marginBottom: espace(1) }}>
        Aperçu : ce que tes clients verront
      </Texte>
      <CarteOffre offre={apercu} />
    </>
  );
}

/** Une offre de la liste : aperçu, lien à partager, modification, retrait. */
function LigneOffre({ offre, pret, onModifier, onChange }: { offre: Offre; pret: boolean; onModifier: () => void; onChange: () => void }) {
  const [confirmer, setConfirmer] = useState(false);
  const [occupe, setOccupe] = useState(false);
  const [info, setInfo] = useState<string>();
  const [copie, setCopie] = useState(false);
  const lien = lienOffre(offre.id);
  const message = `${offre.nom} · ${libellePrix(offre)}\nPour t’inscrire et payer en ligne : ${lien}`;

  const faire = async (action: () => Promise<unknown>) => {
    setOccupe(true);
    setInfo(undefined);
    try {
      await action();
      onChange();
    } catch (e) {
      setInfo(messageErreur(e));
    } finally {
      setOccupe(false);
    }
  };

  return (
    <CarteOffre offre={offre} mention={!offre.active ? 'Plus proposée' : undefined}>
      {offre.active && (
        <>
          <Text selectable style={{ fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux }}>
            {lien}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) }}>
            <View style={{ flexGrow: 1 }}>
              <Bouton variante="discret" libelle="Envoyer par WhatsApp" onPress={() => void ouvrirLien(`https://wa.me/?text=${encodeURIComponent(message)}`)} />
            </View>
            <View style={{ flexGrow: 1 }}>
              {Platform.OS !== 'web' ? (
                <Bouton variante="discret" libelle="Partager le lien…" onPress={() => void Share.share({ message })} />
              ) : (
                <Bouton
                  variante="discret"
                  libelle={copie ? 'Lien copié ✓' : 'Copier le lien'}
                  onPress={() =>
                    void navigator.clipboard?.writeText(lien).then(() => {
                      setCopie(true);
                      setTimeout(() => setCopie(false), 2000);
                    })
                  }
                />
              )}
            </View>
          </View>
          {!pret && <Texte doux style={{ fontSize: 13 }}>Le paiement s’ouvrira sur cette page dès que ton compte Stripe sera prêt.</Texte>}
        </>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) }}>
        <View style={{ flexGrow: 1 }}>
          <Bouton variante="discret" libelle="Modifier" onPress={onModifier} desactive={occupe} />
        </View>
        <View style={{ flexGrow: 1 }}>
          {offre.active ? (
            <Bouton
              variante="discret"
              libelle={confirmer ? 'Confirmer le retrait' : 'Retirer'}
              onPress={() =>
                confirmer
                  ? faire(async () => {
                      const r = await offres.retirer(offre.id);
                      if (r === 'retiree') setInfo('Des clients ont cette offre : elle n’est plus proposée, mais ils la gardent à leur prix.');
                    })
                  : setConfirmer(true)
              }
              chargement={occupe}
            />
          ) : (
            <Bouton
              variante="discret"
              libelle="Proposer à nouveau"
              onPress={() => faire(() => offres.enregistrer({ ...offre, active: true }, offre.id))}
              chargement={occupe}
            />
          )}
        </View>
      </View>
      {confirmer && offre.active && !occupe && (
        <>
          <Texte doux style={{ fontSize: 13 }}>Plus personne ne pourra la prendre. Tes clients qui l’ont déjà la gardent, à leur prix.</Texte>
          <Bouton variante="discret" libelle="Garder l’offre" onPress={() => setConfirmer(false)} />
        </>
      )}
      {info && <Texte doux style={{ fontSize: 13 }}>{info}</Texte>}
    </CarteOffre>
  );
}

/** Brochure PDF des prix, faite à partir des offres en vente : toujours à jour, aux couleurs des factures du coach. */
function Brochure({ liste }: { liste: Offre[] }) {
  const { profil } = useSession();
  const [occupe, setOccupe] = useState<'voir' | 'envoyer'>();
  const [erreur, setErreur] = useState<string>();
  const enVente = offresDeLaBrochure(liste);
  if (!enVente.length) return null;
  const faire = async (quoi: 'voir' | 'envoyer') => {
    setErreur(undefined);
    setOccupe(quoi);
    try {
      const entete = await factures.entete().catch(() => undefined);
      const nom = profil?.role === 'coach' ? profil.nom : (entete?.nom ?? 'Coach');
      const html = brochureHtml(enVente, { nom, telephone: entete?.telephone || undefined }, {
        logo: entete?.logo,
        police: BEBAS_NEUE_BASE64,
        texte: { normal: JOST_400_BASE64, gras: JOST_600_BASE64 },
        photo: PHOTO_BROCHURE_BASE64,
        lien: lienOffre,
      });
      if (quoi === 'voir') await voirPdf(html);
      else await ouvrirPdf(html, `Les offres de ${nom}`);
    } catch (e) {
      setErreur(messageErreur(e));
    } finally {
      setOccupe(undefined);
    }
  };
  return (
    <View style={{ gap: espace(1) }}>
      <Texte style={{ fontFamily: polices.texteMoyen, fontSize: 15 }}>Ma brochure des prix (PDF)</Texte>
      <View style={{ flexDirection: 'row', gap: espace(2) }}>
        <View style={{ flex: 1 }}>
          <Bouton variante="discret" libelle="Voir" onPress={() => faire('voir')} chargement={occupe === 'voir'} desactive={!!occupe} />
        </View>
        <View style={{ flex: 1 }}>
          <Bouton variante="discret" libelle="Envoyer" onPress={() => faire('envoyer')} chargement={occupe === 'envoyer'} desactive={!!occupe} />
        </View>
      </View>
      <Texte doux style={{ fontSize: 13 }}>
        {`Faite avec tes ${enVente.length} offre${enVente.length > 1 ? 's' : ''} en vente. Toujours à jour : elle reprend tes prix du moment.`}
      </Texte>
      {erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
    </View>
  );
}

export function MesOffres() {
  const liste = useCharger(() => offres.lister(), 'offres');
  const stripe = useCharger(() => offres.etatStripe().catch(() => ({ compte: false, pret: false })), 'etat-stripe');
  const [edition, setEdition] = useState<Offre | 'nouvelle'>();
  // Retour de la page Stripe : l'état du compte se met à jour.
  const rechargerStripe = stripe.recharger;
  useFocusEffect(useCallback(() => rechargerStripe(), [rechargerStripe]));

  const fini = () => {
    setEdition(undefined);
    liste.recharger();
  };
  const toutes = liste.donnee ?? [];

  return (
    <View style={{ gap: espace(3) }}>
      <CompteStripe etat={stripe.donnee} recharger={stripe.recharger} />
      {edition ? (
        <EditeurOffre key={edition === 'nouvelle' ? 'nouvelle' : edition.id} offre={edition === 'nouvelle' ? undefined : edition} onFini={fini} />
      ) : (
        <>
          <Bouton libelle="+ Créer une offre" onPress={() => setEdition('nouvelle')} />
          <Brochure liste={toutes} />
          {liste.erreur && <Erreur message={liste.erreur} onReessayer={liste.recharger} />}
          {!liste.donnee && !liste.erreur && <Chargement />}
          {liste.donnee && toutes.length === 0 && (
            <Texte doux style={{ fontSize: 14 }}>Pas encore d’offre. Crée la première à partir d’un modèle : elle sera prête à partager en une minute.</Texte>
          )}
          {[...toutes]
            .sort((a, b) => Number(b.active) - Number(a.active) || a.ordre - b.ordre)
            .map((o) => (
              <LigneOffre key={o.id} offre={o} pret={!!stripe.donnee?.pret} onModifier={() => setEdition(o)} onChange={liste.recharger} />
            ))}
        </>
      )}
    </View>
  );
}
