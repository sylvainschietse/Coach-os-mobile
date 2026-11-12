// Mes newsletters : lecture et écriture des newsletters du coach (table newsletters), illustration rangée dans le
// compartiment public « newsletters », destinataires comptés pour l'écran et envoi d'un test à soi-même (fonction Edge
// envoyer-newsletters). En démo, tout reste en mémoire et rien ne part.
import { compterDestinataires, type Article, type ContactNewsletter, type Newsletter } from '@/domain/newsletters';
import { nouvelId } from '@/lib/identifiant';

import { crm } from './crm';
import { supabase } from './supabase';

export type Comptes = ReturnType<typeof compterDestinataires>;

/** Une illustration à ranger : ses octets, ou déjà rangée (chemin du stockage). */
export type ImageAEnregistrer = { octets: ArrayBuffer; type: string } | { chemin: string } | null;

const abonnes = new Set<() => void>();
export function ecouterNewsletters(fn: () => void) {
  abonnes.add(fn);
  return () => {
    abonnes.delete(fn);
  };
}
const prevenir = () => abonnes.forEach((fn) => fn());

type Ligne = {
  id: string;
  rubrique: string;
  objet: string;
  chapeau: string;
  message: string;
  image: string | null;
  bouton_libelle: string | null;
  bouton_lien: string | null;
  cibles: Newsletter['cibles'];
  par_email: boolean;
  par_notif: boolean;
  envoi_le: string | null;
  etat: Newsletter['etat'];
  envoyee_le: string | null;
  nb_emails: number;
  nb_notifs: number;
  cree_le: string;
};
const COLONNES = 'id, rubrique, objet, chapeau, message, image, bouton_libelle, bouton_lien, cibles, par_email, par_notif, envoi_le, etat, envoyee_le, nb_emails, nb_notifs, cree_le';

const lire = (l: Ligne): Newsletter => ({
  id: l.id,
  rubrique: l.rubrique,
  objet: l.objet,
  chapeau: l.chapeau,
  message: l.message,
  image: l.image ?? undefined,
  boutonLibelle: l.bouton_libelle ?? undefined,
  boutonLien: l.bouton_lien ?? undefined,
  cibles: l.cibles,
  parEmail: l.par_email,
  parNotif: l.par_notif,
  envoiLe: l.envoi_le ?? undefined,
  etat: l.etat,
  envoyeeLe: l.envoyee_le ?? undefined,
  nbEmails: l.nb_emails,
  nbNotifs: l.nb_notifs,
  creeLe: l.cree_le,
});

const ecrire = (n: Newsletter, image: string | null) => ({
  id: n.id,
  rubrique: n.rubrique.trim(),
  objet: n.objet.trim(),
  chapeau: n.chapeau.trim(),
  message: n.message.trim(),
  image,
  bouton_libelle: n.boutonLibelle?.trim() || null,
  bouton_lien: n.boutonLibelle?.trim() ? n.boutonLien?.trim() || null : null,
  cibles: n.cibles,
  par_email: n.parEmail,
  par_notif: n.parNotif,
  envoi_le: n.envoiLe ?? null,
  etat: n.etat === 'programmee' ? 'programmee' : 'brouillon',
});

const ilYa = (jours: number, heure = 9) => {
  const d = new Date();
  d.setDate(d.getDate() - jours);
  d.setHours(heure, 0, 0, 0);
  return d.toISOString();
};

// Démo : une newsletter déjà partie, pour montrer la liste.
let memoire: Newsletter[] = [
  {
    id: 'demo-newsletter-1',
    rubrique: 'Le défi du mois',
    objet: '10 000 pas par jour pendant 30 jours',
    chapeau: 'Ce mois-ci, un défi simple qui fait une vraie différence sur l’énergie.',
    message: '## Le principe\nChaque jour, atteins 10 000 pas.',
    image: 'theme:defi',
    cibles: ['clients'],
    parEmail: true,
    parNotif: true,
    envoiLe: ilYa(9),
    etat: 'envoyee',
    envoyeeLe: ilYa(9),
    nbEmails: 6,
    nbNotifs: 4,
    creeLe: ilYa(10),
  },
];
const imagesDemo = new Map<string, string>();

export const newsletters = {
  async liste(): Promise<Newsletter[]> {
    if (!supabase) return [...memoire].sort((a, b) => b.creeLe.localeCompare(a.creeLe));
    const { data, error } = await supabase.from('newsletters').select(COLONNES).order('cree_le', { ascending: false }).limit(200);
    if (error) {
      if (error.code === '42P01' || /newsletters/.test(error.message)) throw new Error('Les newsletters ne sont pas encore activées sur le serveur : la base doit d’abord être mise à jour.');
      throw new Error('Impossible de charger tes newsletters pour le moment.');
    }
    return (data as Ligne[]).map(lire);
  },

  /** Enregistre (brouillon ou programmée). L'illustration est rangée d'abord : sans elle, rien n'est enregistré. */
  async enregistrer(n: Newsletter, image: ImageAEnregistrer): Promise<Newsletter> {
    const id = n.id || nouvelId();
    if (!supabase) {
      let chemin: string | undefined;
      if (image && 'octets' in image) {
        chemin = `demo/${id}`;
        imagesDemo.set(chemin, `data:${image.type};base64,${base64(image.octets)}`);
      } else if (image) chemin = image.chemin;
      const enregistree = { ...n, id, image: chemin, creeLe: n.creeLe || new Date().toISOString() };
      memoire = [enregistree, ...memoire.filter((x) => x.id !== id)];
      prevenir();
      return enregistree;
    }
    const db = supabase;
    let chemin: string | null = null;
    if (image && 'octets' in image) {
      const { data: coach } = await db.rpc('mon_coach_id');
      chemin = `${coach}/${id}-${Date.now().toString(36)}.${image.type === 'image/png' ? 'png' : 'jpg'}`;
      const envoi = await db.storage.from('newsletters').upload(chemin, image.octets, { contentType: image.type, upsert: true });
      if (envoi.error) throw new Error('L’illustration n’a pas pu être envoyée. Vérifie ta connexion et réessaie.');
    } else if (image) chemin = image.chemin;
    const ligne = ecrire({ ...n, id }, chemin);
    const r = n.id
      ? await db.from('newsletters').update({ ...ligne, maj_le: new Date().toISOString() }).eq('id', id).select(COLONNES).single()
      : await db.from('newsletters').insert(ligne).select(COLONNES).single();
    if (r.error || !r.data) {
      if (r.error?.code === '42P01') throw new Error('Les newsletters ne sont pas encore activées sur le serveur : la base doit d’abord être mise à jour.');
      if (n.id && r.error?.code === 'PGRST116') throw new Error('Cette newsletter est déjà partie : elle ne peut plus être modifiée.');
      throw new Error('Ta newsletter n’a pas pu être enregistrée. Réessaie.');
    }
    // L'ancienne illustration, remplacée, est effacée.
    if (n.id && n.image && chemin && n.image !== chemin && !n.image.startsWith('theme:')) await db.storage.from('newsletters').remove([n.image]).catch(() => undefined);
    prevenir();
    return lire(r.data as Ligne);
  },

  async supprimer(n: Newsletter) {
    if (!supabase) {
      memoire = memoire.filter((x) => x.id !== n.id);
      prevenir();
      return;
    }
    const { error } = await supabase.from('newsletters').delete().eq('id', n.id);
    if (error) throw new Error('Suppression impossible. Réessaie.');
    if (n.image && !n.image.startsWith('theme:')) await supabase.storage.from('newsletters').remove([n.image]).catch(() => undefined);
    prevenir();
  },

  /** Adresse publique d'une illustration rangée (celle que les e-mails affichent). */
  urlImage(chemin?: string): string | undefined {
    if (!chemin || chemin.startsWith('theme:')) return undefined;
    if (!supabase) return imagesDemo.get(chemin);
    return supabase.storage.from('newsletters').getPublicUrl(chemin).data.publicUrl;
  },

  /** Combien de clients actifs et en veille, et combien recevront vraiment un e-mail ou une notification. */
  async destinataires(): Promise<Comptes> {
    if (!supabase) {
      const carnet = await crm.carnet();
      return compterDestinataires(carnet.contacts.map((c) => ({ statut: c.statut, statutCrm: c.statutCrm, email: c.email, appli: !!c.clientId })));
    }
    const { data, error } = await supabase.from('contacts').select('statut, statut_crm, email, newsletter_coupee_le, clients(user_id, email)').neq('statut', 'archive');
    if (error) {
      // Base pas encore à jour : on compte sans le désabonnement.
      const carnet = await crm.carnet();
      return compterDestinataires(carnet.contacts.map((c) => ({ statut: c.statut, statutCrm: c.statutCrm, email: c.email, appli: !!c.clientId })));
    }
    return compterDestinataires(
      (data as unknown as { statut: string; statut_crm: string | null; email: string | null; newsletter_coupee_le: string | null; clients: { user_id: string | null; email: string | null } | null }[]).map(
        (c): ContactNewsletter => ({
          statut: c.statut,
          statutCrm: c.statut_crm,
          email: c.email || c.clients?.email,
          appli: !!c.clients?.user_id,
          desabonne: !!c.newsletter_coupee_le,
        }),
      ),
    );
  },

  /** Envoie l'article, tel qu'il est à l'écran, à l'adresse du coach. Rend l'adresse. */
  async envoyerTest(a: Article): Promise<string> {
    if (!supabase) throw new Error('En démonstration, aucun e-mail ne part. Connecte-toi pour recevoir le test.');
    const { data, error } = await supabase.functions.invoke<{ envoye?: string; erreur?: string }>('envoyer-newsletters', { body: { test: a } });
    if (error || !data?.envoye) {
      let detail = data?.erreur;
      try {
        detail ??= (await (error as { context?: Response })?.context?.json())?.erreur;
      } catch {
        // Réponse illisible : message par défaut.
      }
      throw new Error(detail ?? 'Le test n’a pas pu partir. Réessaie dans un instant.');
    }
    return data.envoye;
  },

  /** Lien « Ne plus recevoir ces nouvelles » : rend le nom du coach. */
  async desabonner(jeton: string): Promise<string> {
    if (!supabase) return 'ton coach';
    const { data, error } = await supabase.rpc('desabonner_newsletter', { p_jeton: jeton });
    if (error) throw new Error(/Lien inconnu/.test(error.message) ? 'Ce lien est inconnu : vérifie qu’il est complet.' : 'Le désabonnement n’a pas pu être enregistré. Réessaie.');
    return (data as string) || 'ton coach';
  },
};

function base64(b: ArrayBuffer) {
  const octets = new Uint8Array(b);
  let s = '';
  for (let i = 0; i < octets.length; i += 0x8000) s += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(s);
}
