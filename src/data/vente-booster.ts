// « Vendu » à la fin d'un Booster : le contact devient client actif avec l'offre recommandée dans la conclusion.
import { droitsOffre, libellePrix, type Offre } from '@/domain/offres';

import { abonnements } from './abonnements';
import { crm } from './crm';
import { offres } from './offres';

/** Libellé d'une offre du coach dans « Offre recommandée » (enregistré tel quel sur le Booster). */
export const libelleOffre = (o: Pick<Offre, 'nom' | 'prix' | 'periodicite'>) => `${o.nom} · ${libellePrix(o)}`;

/**
 * Applique à la fiche client l'offre dont le libellé a été choisi : un abonnement remplace la formule du client,
 * un pack (paiement unique) est ajouté. Rend le nom de l'offre appliquée, ou rien si le libellé ne correspond à aucune offre.
 */
export async function appliquerOffreVendue(contactId: string, libelle: string | undefined): Promise<string | undefined> {
  if (!libelle) return undefined;
  const liste = await offres.lister();
  // Anciens libellés fixes (« Appli + nutrition – 99 €/mois ») : on reconnaît l'offre à son nom.
  const offre =
    liste.find((o) => libelleOffre(o) === libelle) ??
    liste.filter((o) => libelle === o.nom || libelle.startsWith(`${o.nom} –`)).sort((a, b) => b.nom.length - a.nom.length)[0];
  if (!offre) return undefined;
  const clientId = (await crm.fiche(contactId)).contact.clientId;
  if (!clientId) return undefined;
  if (offre.periodicite === 'unique') {
    await abonnements.ajouterPack(clientId, { libelle: offre.nom, seances: offre.seances, prix: offre.prix });
  } else {
    await abonnements.changer(clientId, { offre, offrePrix: offre.prix, ...droitsOffre(offre) });
  }
  return offre.nom;
}
