// « Ce qui s'est passé » sur l'accueil du coach : séances faites par ses clients, activités sportives importées,
// rendez-vous réalisés, bilans de la semaine, réponses au questionnaire et paiements reçus, sur une période.
// Lecture seule ; chaque table garde ses règles d'accès (un coach ne lit que ses clients et ses contacts).
import { CLIENTS_DEMO } from '@/data/demo';
import { filtrerActivite, phraseSport, type EvenementActivite } from '@/domain/activite-coach';
import { montantLisible } from '@/domain/gestion';

import { supabase } from './supabase';

type Client = { prenom: string; contacts: { id: string }[] | null } | null;
const LIMITE = 200;

const prenomDe = (c: Client) => c?.prenom?.trim() || 'Un client';
const contactDe = (c: Client) => c?.contacts?.[0]?.id;

function verifier<T>(r: { data: T[] | null; error: { message: string } | null }): T[] {
  if (r.error) throw new Error(r.error.message);
  return r.data ?? [];
}

export async function activiteRecente(du: Date, au: Date): Promise<EvenementActivite[]> {
  if (!supabase) return filtrerActivite(demo(new Date()), du, au);
  const db = supabase;
  const [a, b] = [du.toISOString(), au.toISOString()];
  const jourDu = a.slice(0, 10);
  const client = 'clients(prenom, contacts(id))';
  const [seances, sports, rdv, bilans, questionnaires, paiements] = await Promise.all([
    db.from('realisations').select(`id, fin, seance_titre, seances(titre), ${client}`).gte('fin', a).lt('fin', b).order('fin', { ascending: false }).limit(LIMITE),
    db.from('activites_sport').select(`id, debut, sport, titre, distance_m, duree_s, ${client}`).eq('retiree', false).gte('debut', a).lt('debut', b).order('debut', { ascending: false }).limit(LIMITE),
    db
      .from('rendez_vous')
      .select(`id, debut, type, rendez_vous_participants(${client})`)
      .eq('statut', 'realise')
      .gte('debut', a)
      .lt('debut', b)
      .order('debut', { ascending: false })
      .limit(LIMITE),
    db.from('bilans_hebdo').select(`id, envoye_le, ${client}`).gte('envoye_le', a).lt('envoye_le', b).order('envoye_le', { ascending: false }).limit(LIMITE),
    db.from('questionnaires').select('id, recu_le, contacts(id, prenom)').gte('recu_le', a).lt('recu_le', b).order('recu_le', { ascending: false }).limit(LIMITE),
    db.from('paiements').select('id, date, cree_le, titre, montant, contacts(id, prenom)').eq('statut', 'Payé').gte('date', jourDu).order('date', { ascending: false }).limit(LIMITE),
  ]);

  const evenements: EvenementActivite[] = [];
  for (const s of verifier(seances) as unknown as { id: string; fin: string; seance_titre: string | null; seances: { titre: string } | null; clients: Client }[]) {
    const titre = s.seance_titre?.trim() || s.seances?.titre?.trim();
    evenements.push({ id: `seance:${s.id}`, genre: 'seance', quand: s.fin, qui: prenomDe(s.clients), quoi: titre ? `a fait ${titre}` : 'a fait sa séance', contactId: contactDe(s.clients) });
  }
  for (const s of verifier(sports) as unknown as { id: string; debut: string; sport: string; titre: string; distance_m: number | null; duree_s: number; clients: Client }[]) {
    evenements.push({ id: `sport:${s.id}`, genre: 'sport', quand: s.debut, qui: prenomDe(s.clients), quoi: phraseSport(s.sport, s.titre, s.distance_m, s.duree_s), contactId: contactDe(s.clients) });
  }
  for (const r of verifier(rdv) as unknown as { id: string; debut: string; type: string; rendez_vous_participants: { clients: Client }[] }[]) {
    const gens = r.rendez_vous_participants.map((p) => p.clients);
    if (!gens.length) continue;
    const quoi = r.type === 'appel' ? 'appel avec toi' : r.type === 'visio' ? 'séance en visio avec toi' : gens.length > 1 ? 'séance en duo avec toi' : 'séance avec toi';
    evenements.push({
      id: `rdv:${r.id}`,
      genre: 'rdv',
      quand: r.debut,
      qui: gens.map(prenomDe).join(' & '),
      quoi,
      contactId: gens.length === 1 ? contactDe(gens[0]) : undefined,
    });
  }
  for (const x of verifier(bilans) as unknown as { id: string; envoye_le: string; clients: Client }[]) {
    evenements.push({ id: `bilan:${x.id}`, genre: 'bilan', quand: x.envoye_le, qui: prenomDe(x.clients), quoi: 'a envoyé son bilan de la semaine', contactId: contactDe(x.clients) });
  }
  for (const q of verifier(questionnaires) as unknown as { id: string; recu_le: string; contacts: { id: string; prenom: string } | null }[]) {
    evenements.push({ id: `questionnaire:${q.id}`, genre: 'questionnaire', quand: q.recu_le, qui: q.contacts?.prenom?.trim() || 'Un prospect', quoi: 'a répondu au questionnaire', contactId: q.contacts?.id });
  }
  for (const p of verifier(paiements) as unknown as { id: string; date: string | null; cree_le: string; titre: string; montant: number | null; contacts: { id: string; prenom: string } | null }[]) {
    // Un paiement est daté d'un jour : on le place à midi ce jour-là (heure locale).
    const quand = p.date ? new Date(`${p.date}T12:00:00`).toISOString() : p.cree_le;
    const montant = p.montant !== null ? `${montantLisible(Number(p.montant))} · ` : '';
    evenements.push({ id: `paiement:${p.id}`, genre: 'paiement', quand, qui: p.contacts?.prenom?.trim() || 'Paiement', quoi: `a réglé ${montant}${p.titre}` });
  }
  return filtrerActivite(evenements, du, au);
}

/** Démonstration : quelques lignes fictives, datées par rapport à maintenant. */
function demo(maintenant: Date): EvenementActivite[] {
  const il = (heures: number) => new Date(maintenant.getTime() - heures * 3_600_000).toISOString();
  const [lea, thomas] = CLIENTS_DEMO;
  return [
    { id: 'demo:1', genre: 'seance', quand: il(1), qui: lea.prenom, quoi: 'a fait Haut du corps' },
    { id: 'demo:2', genre: 'sport', quand: il(20), qui: thomas.prenom, quoi: 'a couru 8,2 km' },
    { id: 'demo:3', genre: 'rdv', quand: il(26), qui: `${lea.prenom} & ${thomas.prenom}`, quoi: 'séance en duo avec toi' },
    { id: 'demo:4', genre: 'questionnaire', quand: il(70), qui: 'Lucas', quoi: 'a répondu au questionnaire' },
    { id: 'demo:5', genre: 'paiement', quand: il(150), qui: thomas.prenom, quoi: 'a réglé 450,00 € · Pack 10 séances' },
  ];
}
