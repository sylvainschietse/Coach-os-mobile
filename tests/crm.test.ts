import { describe, expect, it } from 'vitest';

import {
  ajouterRelance,
  annulerBooster,
  archiver,
  CARNET_VIDE,
  creerContact,
  devenirClient,
  filtrerContacts,
  formaterTelephone,
  lienEnvoi,
  listeContacts,
  lireDateHeure,
  normaliserTelephone,
  planifierBooster,
  reactiver,
  recevoirQuestionnaire,
  rediger,
  relancesDuJour,
  terminerBooster,
  trouverDoublon,
  type Contexte,
} from '../src/domain/crm';

function contexte(iso = '2026-10-19T09:00:00'): Contexte {
  let n = 0;
  return { nouvelId: () => `id-${++n}`, maintenant: new Date(iso) };
}

function avecJulie(ctx: Contexte) {
  const r = creerContact(CARNET_VIDE, { prenom: 'Julie', telephone: '06 12 34 56 78' }, ctx);
  if ('doublon' in r) throw new Error('inattendu');
  return r;
}

describe('téléphone', () => {
  it('ramène toutes les écritures françaises à la même clé', () => {
    for (const t of ['06 12 34 56 78', '06.12.34.56.78', '+33 6 12 34 56 78', '0033612345678', '+33 (0)6 12 34 56 78']) {
      expect(normaliserTelephone(t)).toBe('33612345678');
    }
    expect(normaliserTelephone('+32 470 12 34 56')).toBe('32470123456');
    expect(normaliserTelephone('12')).toBeUndefined();
    expect(formaterTelephone('33612345678')).toBe('06 12 34 56 78');
  });
});

describe('contacts et doublons', () => {
  it('crée un prospect avec un téléphone seul et prévoit l’envoi du questionnaire', () => {
    const ctx = contexte();
    const { carnet, contact } = avecJulie(ctx);
    expect(contact).toMatchObject({ prenom: 'Julie', telephone: '33612345678', statut: 'prospect' });
    expect(relancesDuJour(carnet, ctx.maintenant).map((r) => r.modele)).toEqual(['questionnaire']);
  });

  it('refuse un deuxième contact avec le même numéro, écrit autrement', () => {
    const ctx = contexte();
    const { carnet } = avecJulie(ctx);
    const r = creerContact(carnet, { prenom: 'Jules', telephone: '+33612345678' }, ctx);
    expect('doublon' in r && r.doublon.contact.prenom).toBe('Julie');
  });

  it('ne rapproche jamais deux personnes sur leur seul nom', () => {
    const ctx = contexte();
    const { carnet } = avecJulie(ctx);
    expect(trouverDoublon(carnet.contacts, { telephone: '07 00 00 00 00' })).toBeNull();
    const r = creerContact(carnet, { prenom: 'Julie', telephone: '07 00 00 00 00' }, ctx);
    expect('contact' in r).toBe(true);
  });

  it('cherche par nom sans accents ou par morceau de numéro', () => {
    const ctx = contexte();
    let { carnet } = avecJulie(ctx);
    const r = creerContact(carnet, { prenom: 'Hélène', nom: 'Durand', telephone: '0700000000' }, ctx);
    if ('contact' in r) carnet = r.carnet;
    const liste = listeContacts(carnet);
    expect(filtrerContacts(liste, 'helene').map((c) => c.prenom)).toEqual(['Hélène']);
    expect(filtrerContacts(liste, '3456').map((c) => c.prenom)).toEqual(['Julie']);
  });
});

describe('questionnaire d’accueil', () => {
  it('rattache les réponses au contact créé par téléphone et complète sa fiche (le cas du doublon Tally)', () => {
    const ctx = contexte();
    const { carnet } = avecJulie(ctx);
    const r = recevoirQuestionnaire(
      carnet,
      { prenom: 'Julie', nom: 'Moreau', telephone: '+33 6 12 34 56 78', email: 'Julie.M@exemple.fr', objectif: 'Remise en forme' },
      ctx,
    );
    expect(r.carnet.contacts).toHaveLength(1);
    expect(r.contact).toMatchObject({ nom: 'Moreau', email: 'julie.m@exemple.fr' });
    expect(r.questionnaire.alertes).toEqual([]);
    // Le questionnaire est arrivé : on passe à la proposition de Booster.
    expect(relancesDuJour(r.carnet, ctx.maintenant).map((x) => x.modele)).toEqual(['booster']);
  });

  it('crée la fiche quand la personne est inconnue', () => {
    const ctx = contexte();
    const r = recevoirQuestionnaire(CARNET_VIDE, { prenom: 'Karim', telephone: '0611111111', email: 'k@exemple.fr' }, ctx);
    expect(r.carnet.contacts.map((c) => c.prenom)).toEqual(['Karim']);
  });

  it('n’écrase pas la fiche et signale les différences au coach', () => {
    const ctx = contexte();
    let { carnet } = avecJulie(ctx);
    carnet = recevoirQuestionnaire(carnet, { prenom: 'Julie', telephone: '0612345678', email: 'julie@exemple.fr' }, ctx).carnet;
    const r = recevoirQuestionnaire(carnet, { prenom: 'Julie', telephone: '0612345678', email: 'autre@exemple.fr' }, ctx);
    expect(r.contact.email).toBe('julie@exemple.fr');
    expect(r.questionnaire.alertes).toEqual(['E-mail différent dans le questionnaire : autre@exemple.fr (fiche : julie@exemple.fr).']);
  });

  it('signale un cas ambigu : le téléphone et l’e-mail désignent deux fiches différentes', () => {
    const ctx = contexte();
    let { carnet } = avecJulie(ctx);
    const r1 = creerContact(carnet, { prenom: 'Paul', email: 'paul@exemple.fr' }, ctx);
    if ('carnet' in r1) carnet = r1.carnet;
    const r = recevoirQuestionnaire(carnet, { prenom: 'Julie', telephone: '0612345678', email: 'paul@exemple.fr' }, ctx);
    expect(r.contact.prenom).toBe('Julie');
    expect(r.questionnaire.alertes[0]).toMatch(/fiche de Paul/);
    expect(r.carnet.contacts).toHaveLength(2);
  });

  it('réactive un contact archivé qui revient', () => {
    const ctx = contexte();
    const { carnet, contact } = avecJulie(ctx);
    const r = recevoirQuestionnaire(archiver(carnet, contact.id, ctx), { telephone: '0612345678' }, ctx);
    expect(r.contact.statut).toBe('prospect');
    expect(r.questionnaire.alertes).toContain('Ce contact était archivé : il a été réactivé par ses réponses.');
  });
});

describe('Booster et relances', () => {
  function jusquAuBooster() {
    const ctx = contexte();
    const { carnet, contact } = avecJulie(ctx);
    const date = lireDateHeure('23/10 18:30', ctx.maintenant)!;
    return { ctx, contact, carnet: planifierBooster(carnet, contact.id, date, ctx) };
  }

  it('lit une date saisie à la main', () => {
    const maintenant = new Date('2026-10-19T09:00:00');
    expect(new Date(lireDateHeure('23/10 18h30', maintenant)!).toString()).toBe(new Date(2026, 9, 23, 18, 30).toString());
    expect(new Date(lireDateHeure('05/01 8:00', maintenant)!).getFullYear()).toBe(2027);
    expect(lireDateHeure('31/02 10:00', maintenant)).toBeUndefined();
    expect(lireDateHeure('demain', maintenant)).toBeUndefined();
  });

  it('planifier le Booster change le statut et prévoit un rappel la veille', () => {
    const { carnet, contact } = jusquAuBooster();
    expect(carnet.contacts[0].statut).toBe('booster_prevu');
    const ouvertes = carnet.relances.filter((r) => r.contactId === contact.id && !r.faiteLe);
    expect(ouvertes.map((r) => [r.modele, r.echeance])).toEqual([['rappel_booster', '2026-10-22']]);
  });

  it('le compte rendu du Booster garde 3 priorités et prévoit le suivi deux jours après', () => {
    const { carnet, contact } = jusquAuBooster();
    const ctx = contexte('2026-10-23T19:30:00');
    const apres = terminerBooster(
      carnet,
      carnet.boosters[0].id,
      { compteRendu: 'Bonne base', priorites: ['Mobilité hanches', 'Gainage', '', 'Sommeil'], paye: true },
      ctx,
    );
    expect(apres.boosters[0]).toMatchObject({ statut: 'fait', priorites: ['Mobilité hanches', 'Gainage', 'Sommeil'], paye: true });
    expect(apres.contacts[0].statut).toBe('booster_fait');
    expect(apres.relances.filter((r) => r.contactId === contact.id && !r.faiteLe).map((r) => [r.modele, r.echeance])).toEqual([
      ['suivi_booster', '2026-10-25'],
    ]);
    const client = devenirClient(apres, contact.id, 'client-julie', ctx);
    expect(client.contacts[0]).toMatchObject({ statut: 'client', clientId: 'client-julie' });
    expect(client.relances.every((r) => r.faiteLe)).toBe(true);
  });

  it('annuler le seul Booster remet le contact en prospect, à relancer', () => {
    const { carnet, ctx } = jusquAuBooster();
    const apres = annulerBooster(carnet, carnet.boosters[0].id, ctx);
    expect(apres.contacts[0].statut).toBe('prospect');
    expect(relancesDuJour(apres, ctx.maintenant).map((r) => r.modele)).toEqual(['booster']);
  });

  it('les relances en retard passent en premier ; un contact archivé disparaît de la liste du jour', () => {
    const ctx = contexte();
    const { carnet, contact } = avecJulie(ctx);
    const plusTard = new Date('2026-10-21T09:00:00');
    expect(relancesDuJour(carnet, plusTard)[0]).toMatchObject({ enRetard: true, modele: 'questionnaire' });
    expect(relancesDuJour(archiver(carnet, contact.id, ctx), plusTard)).toEqual([]);
    expect(reactiver(archiver(carnet, contact.id, ctx), contact.id).contacts[0].statut).toBe('prospect');
  });
});

describe('messages', () => {
  const julie = { id: 'c', prenom: 'Julie', nom: '', telephone: '33612345678', email: 'julie@exemple.fr', statut: 'prospect', creeLe: '' } as const;

  it('rédige le message à partir du modèle et ouvre la bonne application', () => {
    const texte = rediger('questionnaire', { ...julie }, { coach: 'Sylvain', lienQuestionnaire: 'https://exemple.fr/q' });
    expect(texte).toBe('Bonjour Julie, c’est Sylvain. Pour préparer notre première séance, peux-tu remplir ce court questionnaire ? https://exemple.fr/q');
    expect(lienEnvoi('whatsapp', { ...julie }, 'Salut')).toBe('https://wa.me/33612345678?text=Salut');
    expect(lienEnvoi('sms', { ...julie }, 'Salut à toi')).toBe('sms:+33612345678?body=Salut%20%C3%A0%20toi');
    expect(lienEnvoi('email', { ...julie, email: undefined }, 'Salut')).toBeNull();
  });
});

describe('tâches libres', () => {
  it('une tâche a un texte, arrive dans la journée et n’a pas de message', () => {
    const ctx = contexte();
    const { carnet, contact } = avecJulie(ctx);
    expect(() => ajouterRelance(carnet, contact.id, '2026-10-19', 'tache', '  ', ctx)).toThrow(/à faire/);
    const avec = ajouterRelance(carnet, contact.id, '2026-10-19', 'tache', 'Préparer son programme', ctx);
    const jour = relancesDuJour(avec, ctx.maintenant);
    expect(jour.map((r) => r.note)).toContain('Préparer son programme');
    expect(rediger('tache', contact, { coach: 'Sylvain' })).toBe('');
  });
});
