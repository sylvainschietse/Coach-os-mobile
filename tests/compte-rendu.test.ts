import { describe, expect, it } from 'vitest';

import { compteRenduHtml, construireCompteRendu, emailCompteRendu, messageCompteRenduEnvoye } from '../src/domain/compte-rendu';
import { lienEnvoi } from '../src/domain/crm';
import type { Booster, Contact } from '../src/domain/crm';

const contact: Contact = { id: 'c', prenom: 'Karim', nom: 'Benali', statut: 'booster_fait', creeLe: '2026-10-10T10:00:00Z' };
const booster: Booster = {
  id: 'b',
  contactId: 'c',
  date: '2026-10-20T16:30:00Z',
  statut: 'fait',
  priorites: ['Renforcer les épaules', 'Bouger 3 fois par semaine', 'Dormir 7 h'],
  compteRendu: 'Super première séance <3',
  entretien: { projection: 'Retrouver mon niveau', freins: 'Horaires de travail' },
  evaluation: {
    tests: {
      poussee: { resultat: 'Correct', observations: ['Asymétrie'] },
      cardio: { resultat: 'Bonne aisance', observations: [], rpe: 6 },
      tirage: { observations: ['Asymétrie'] },
    },
    douleur: 'Non',
  },
};

describe('compte rendu du Booster', () => {
  it('assemble bilan, évaluation, entretien et priorités', () => {
    const cr = construireCompteRendu(contact, booster, { objectif: 'Prendre du muscle', stress: '8', obstacle: 'Manque de temps' }, 'Sylvain');
    const section = (t: string) => cr.sections.find((s) => s.titre === t)?.lignes;
    expect(cr.sections[0].titre).toBe('Le mot de ton coach');
    expect(section('Ton point de départ')).toEqual(['Objectif : Prendre du muscle', 'Dans six mois : Retrouver mon niveau']);
    // Un test sans résultat n'apparaît pas chez le client.
    expect(section('Ton évaluation physique')?.map((l) => l.split('\n')[0])).toEqual(['Poussée : Correct (Asymétrie)', 'Cardio : Bonne aisance (effort ressenti 6/10)']);
    // Chaque test est expliqué, avec la suite du travail.
    expect(section('Ton évaluation physique')?.[0]).toContain('un côté travaille plus que l’autre');
    expect(section('Tes habitudes à travailler')).toEqual(['Stress : 8/10']);
    expect(section('Ce qui peut te freiner')).toEqual(['Horaires de travail', 'Principal obstacle : manque de temps']);
    expect(cr.sections.find((x) => x.titre === 'Tes 3 priorités')).toMatchObject({ numerotee: true });
    expect(section('Le regard du coach')?.[0]).toContain('Karim, merci');
    expect(section('Cette semaine')?.at(-1)).toBe('Noter chaque soir ton énergie et ta motivation de 1 à 10');
    expect(section('La suite')?.at(-1)).toBe('Faire un point ensemble dans 3 à 4 semaines');
    expect(cr.conclusion.at(-1)).toBe('Sylvain');
  });

  it('échappe le texte saisi dans le PDF', () => {
    const html = compteRenduHtml(construireCompteRendu(contact, booster, undefined, 'Sylvain'));
    expect(html).toContain('Super première séance &lt;3');
    expect(html).toContain('<div class="num">1</div><div><div class="titre-p">Renforcer les épaules</div>');
    expect(html).not.toContain('Tirage');
  });
});

describe('envoi du compte rendu', () => {
  it('prépare l’e-mail et le message WhatsApp au prénom du client', () => {
    const cr = construireCompteRendu(contact, booster, undefined, 'Sylvain');
    const mail = emailCompteRendu(cr);
    expect(mail.sujet).toContain('plan d’action personnalisé');
    expect(mail.corps.startsWith('Bonjour Karim,')).toBe(true);
    expect(mail.corps).toContain('pièce jointe');
    const message = messageCompteRenduEnvoye(cr);
    expect(message).toContain('Karim, c’est Sylvain');
    expect(lienEnvoi('whatsapp', { ...contact, telephone: '33612345678' }, message)).toMatch(/^https:\/\/wa\.me\/33612345678\?text=Bonjour%20Karim/);
  });
});

describe('compte rendu de démonstration', () => {
  it('se construit pour Sophie à partir des contacts fictifs', async () => {
    const { carnetDemo } = await import('../src/data/crm-demo');
    const c = carnetDemo(new Date());
    const b = c.boosters.find((x) => x.id === 'b-sophie')!;
    const sophie = c.contacts.find((x) => x.id === b.contactId)!;
    const cr = construireCompteRendu(sophie, b, c.questionnaires.find((q) => q.contactId === sophie.id)?.reponses, 'Sylvain');
    expect(cr.sections.find((s) => s.titre === 'Ton évaluation physique')?.lignes).toHaveLength(6);
    expect(cr.pdf.tests.every((t) => t.explication)).toBe(true);
    expect(cr.pdf.priorites.every((p) => p.texte)).toBe(true);
  });
});
