import { describe, expect, it } from 'vitest';

import { corpsBrevo, lireReponseBrevo } from '@/domain/envoi-email';

const demande = {
  expediteur: { email: 'coach@exemple.test', nom: 'Sylvain' },
  destinataire: { email: 'nora@exemple.test', prenom: 'Nora <b>' },
  sujet: 'Compte rendu Booster',
  pdfUrl: 'https://projet.supabase.co/storage/v1/object/sign/documents/a.pdf?token=t',
  nomFichier: 'booster.pdf',
  documentId: 'doc-1',
  cle: 'doc-1:2',
};

describe('envoi direct par Brevo', () => {
  it('joint le PDF par son lien signé et échappe le prénom', () => {
    const c = corpsBrevo(demande);
    expect(c.sender).toEqual({ email: 'coach@exemple.test', name: 'Sylvain' });
    expect(c.to).toEqual([{ email: 'nora@exemple.test', name: 'Nora <b>' }]);
    expect(c.attachment).toEqual([{ url: demande.pdfUrl, name: 'booster.pdf' }]);
    expect(c.htmlContent).toContain('Bonjour Nora &lt;b&gt;,');
    expect(c.htmlContent).not.toContain('<b>');
    expect(c.headers['X-Coach-OS-Cle']).toBe('doc-1:2');
  });

  it('sans prénom ni nom, reste poli et sans champ vide', () => {
    const c = corpsBrevo({ ...demande, expediteur: { email: 'coach@exemple.test' }, destinataire: { email: 'x@exemple.test' } });
    expect(c.sender).toEqual({ email: 'coach@exemple.test' });
    expect(c.to).toEqual([{ email: 'x@exemple.test' }]);
    expect(c.textContent.startsWith('Bonjour,')).toBe(true);
  });

  it('ne compte envoyé que si Brevo rend un messageId', () => {
    expect(lireReponseBrevo(201, '{"messageId":"<abc@smtp-relay.brevo.com>"}').etat).toBe('envoye');
    expect(lireReponseBrevo(201, '').etat).toBe('transmis');
    expect(lireReponseBrevo(200, '{}').etat).toBe('transmis');
  });

  it('crédits ou limite atteints : blocage ; clé ou expéditeur refusés : échec expliqué', () => {
    expect(lireReponseBrevo(402, '{"code":"not_enough_credits","message":"Not enough credits"}').etat).toBe('bloque');
    expect(lireReponseBrevo(429, 'Too many requests').etat).toBe('bloque');
    expect(lireReponseBrevo(401, '{"code":"unauthorized","message":"Key not found"}').detail).toContain('BREVO_API_KEY');
    expect(lireReponseBrevo(400, '{"code":"invalid_parameter","message":"sender is not valid"}').detail).toContain('expédition');
    expect(lireReponseBrevo(500, 'oops')).toEqual({ etat: 'echec', detail: 'Brevo a répondu HTTP 500' });
  });
});
