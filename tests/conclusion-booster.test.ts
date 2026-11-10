import { describe, expect, it } from 'vitest';

import {
  boosterAConclure,
  CARNET_VIDE,
  conclureBooster,
  creerContact,
  devenirClient,
  listeBoosters,
  passerEnVeille,
  planifierBooster,
  rangerBoosters,
  statutContact,
  terminerBooster,
  type Contexte,
} from '../src/domain/crm';

function contexte(iso = '2026-11-10T09:00:00'): Contexte {
  let n = 0;
  return { nouvelId: () => `id-${++n}`, maintenant: new Date(iso) };
}

/** Julie a fait son Booster ; Karim a le sien la semaine prochaine. */
function depart() {
  const ctx = contexte();
  const julie = creerContact(CARNET_VIDE, { prenom: 'Julie', telephone: '06 12 34 56 78' }, ctx);
  if ('doublon' in julie) throw new Error('inattendu');
  const karim = creerContact(julie.carnet, { prenom: 'Karim', telephone: '06 98 76 54 32' }, ctx);
  if ('doublon' in karim) throw new Error('inattendu');
  let carnet = planifierBooster(karim.carnet, julie.contact.id, '2026-11-09T10:00:00.000Z', ctx);
  carnet = planifierBooster(carnet, karim.contact.id, '2026-11-17T10:00:00.000Z', ctx);
  const boosterJulie = carnet.boosters.find((b) => b.contactId === julie.contact.id)!;
  carnet = terminerBooster(carnet, boosterJulie.id, { priorites: ['a', 'b', 'c'] }, ctx);
  return { ctx, carnet, julie: julie.contact.id, karim: karim.contact.id, boosterJulie: boosterJulie.id };
}

describe('après le Booster', () => {
  it('range le Booster fait sans suite décidée dans « À conclure », le prochain dans « À venir »', () => {
    const { carnet, julie, karim } = depart();
    const r = rangerBoosters(listeBoosters(carnet));
    expect(r.aConclure.map((b) => b.contactId)).toEqual([julie]);
    expect(r.aVenir.map((b) => b.contactId)).toEqual([karim]);
    expect(r.passes).toEqual([]);
  });

  it('« En veille » sort le Booster de la liste et range le contact dans Prospects › En veille, relances gardées', () => {
    const { carnet, julie, boosterJulie } = depart();
    const apres = conclureBooster(carnet, boosterJulie, 'veille');
    const contact = apres.contacts.find((c) => c.id === julie)!;
    expect(statutContact(contact)).toBe('En veille');
    expect(contact.statut).toBe('booster_fait');
    expect(apres.boosters.find((b) => b.id === boosterJulie)?.resultatCommercial).toBe('En veille');
    const r = rangerBoosters(listeBoosters(apres));
    expect(r.aConclure).toEqual([]);
    expect(r.passes.map((b) => b.id)).toEqual([boosterJulie]);
    expect(apres.relances.filter((x) => x.contactId === julie && !x.faiteLe).map((x) => x.modele)).toEqual(
      expect.arrayContaining(['nouvelles_10j', 'nouvelles_1mois']),
    );
  });

  it('« Client actif » marque le Booster vendu et le contact client actif (la fiche client est ouverte ensuite)', () => {
    const { carnet, julie, boosterJulie } = depart();
    const apres = conclureBooster(carnet, boosterJulie, 'client');
    expect(apres.contacts.find((c) => c.id === julie)?.statutCrm).toBe('Client actif');
    expect(apres.boosters.find((b) => b.id === boosterJulie)?.resultatCommercial).toBe('Vendu');
    expect(rangerBoosters(listeBoosters(apres)).aConclure).toEqual([]);
  });

  it('un contact déjà client n’a rien à conclure (cas de Jean-Marc)', () => {
    const { carnet, ctx, julie } = depart();
    const client = devenirClient(carnet, julie, 'client-julie', ctx);
    const b = listeBoosters(client).find((x) => x.contactId === julie)!;
    expect(boosterAConclure(b)).toBe(false);
  });

  it('passer en veille un client le sort des clients et garde le lien vers sa fiche client', () => {
    const { carnet, ctx, julie } = depart();
    const apres = passerEnVeille(devenirClient(carnet, julie, 'client-julie', ctx), julie);
    expect(apres.contacts.find((c) => c.id === julie)).toMatchObject({ statut: 'booster_fait', statutCrm: 'En veille', clientId: 'client-julie' });
  });
});
