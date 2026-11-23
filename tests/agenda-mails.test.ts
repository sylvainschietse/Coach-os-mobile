/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { base64, corpsBrevoAgenda, dateLisible, fichierIcs, mailCoachPrevenu, mailFinDePack, mailRendezVous, type InfosRdv } from '@/domain/agenda-mails';

const rdv: InfosRdv = {
  id: 'abc',
  type: 'seance',
  debut: '2026-11-03T17:30:00Z',
  fin: '2026-11-03T18:30:00Z',
  lieu: 'Salle Fitness, Villefranche',
  coach: 'Sylvain',
  lien: 'https://coachgo.app/rdv/123',
  delaiAnnulationHeures: 24,
};

describe('mails de l’agenda', () => {
  it('écrit la date à l’heure de Paris', () => {
    expect(dateLisible('2026-11-03T17:30:00Z')).toBe('mardi 3 novembre à 18 h 30');
    expect(dateLisible('2026-07-03T16:00:00Z')).toBe('vendredi 3 juillet à 18 h');
  });

  it('fabrique un .ics lisible, et un .ics d’annulation pour le même événement', () => {
    const ics = fichierIcs(rdv, { sequence: 1, maintenant: new Date('2026-11-01T10:00:00Z') });
    expect(ics).toContain('UID:abc@coachgo');
    expect(ics).toContain('DTSTART:20261103T173000Z');
    expect(ics).toContain('LOCATION:Salle Fitness\\, Villefranche');
    expect(ics).toContain('\r\nEND:VCALENDAR\r\n');
    const annule = fichierIcs(rdv, { sequence: 2, annule: true });
    expect(annule).toContain('METHOD:CANCEL');
    expect(annule).toContain('STATUS:CANCELLED');
  });

  it('invitation : date, lieu, lien et délai d’annulation', () => {
    const m = mailRendezVous('invitation', 'Inès', { ...rdv, avec: 'Bruno' });
    expect(m.sujet).toBe('Rendez-vous le mardi 3 novembre à 18 h 30');
    expect(m.texte).toContain('Bonjour Inès,');
    expect(m.texte).toContain('(avec Bruno)');
    expect(m.texte).toContain('Lieu : Salle Fitness, Villefranche');
    expect(m.texte).toContain('jusqu’à 24 h avant');
    expect(m.html).toContain('href="https://coachgo.app/rdv/123"');
  });

  it('rappel court d’une visio : bouton pour rejoindre', () => {
    const m = mailRendezVous('rappel_court', 'Inès', { ...rdv, type: 'visio', lieu: '', lienVisio: 'https://meet.google.com/abc' });
    expect(m.texte).toContain('Rejoindre la visio : https://meet.google.com/abc');
  });

  it('fin de pack et alerte au coach', () => {
    expect(mailFinDePack('Inès', 'Sylvain', 2).sujet).toBe('Plus que 2 séances sur ton pack');
    expect(mailFinDePack('Inès', 'Sylvain', 0).sujet).toBe('Ton pack de séances est terminé');
    expect(mailCoachPrevenu('Sylvain', 'Inès', 'annule', rdv.debut).sujet).toBe('Inès a annulé le mardi 3 novembre à 18 h 30');
  });

  it('prépare la demande Brevo avec le .ics en pièce jointe', () => {
    const corps = corpsBrevoAgenda({ email: 'coach@x.fr', nom: 'Sylvain' }, { email: 'ines@x.fr', nom: 'Inès' }, mailRendezVous('rappel', 'Inès', rdv), {
      ics: 'é',
      repondreA: 'sylvain@x.fr',
      tag: 'rappel',
    });
    expect(corps.attachment).toEqual([{ content: base64('é'), name: 'rendez-vous.ics' }]);
    expect(Buffer.from(corps.attachment![0].content, 'base64').toString('utf8')).toBe('é');
    expect(corps.replyTo).toEqual({ email: 'sylvain@x.fr' });
  });

  it('la copie de la fonction Edge est identique', () => {
    const lire = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8');
    expect(lire('supabase/functions/_shared/agenda-mails.ts')).toBe(lire('src/domain/agenda-mails.ts'));
  });
});
