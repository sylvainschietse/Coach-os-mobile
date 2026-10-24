import { describe, expect, it } from 'vitest';

import { messageAcces, verifierMotDePasse } from '../src/domain/acces-client';

describe('accès client', () => {
  it('le message donne l’e-mail, le mot de passe provisoire et le lien d’installation', () => {
    const m = messageAcces('Marc', 'Sylvain', { email: 'marc@exemple.fr', motDePasse: 'abcd-efgh-jkmn' }, 'https://exemple.fr/appli');
    expect(m).toContain('Salut Marc');
    expect(m).toContain('E-mail : marc@exemple.fr');
    expect(m).toContain('Mot de passe provisoire : abcd-efgh-jkmn');
    expect(m).toContain('https://exemple.fr/appli');
    expect(m).toContain('À bientôt, Sylvain');
  });

  it('sans lien d’installation, pas de ligne vide', () => {
    const m = messageAcces('Marc', 'Sylvain', { email: 'm@e.fr', motDePasse: 'x' });
    expect(m).not.toContain('installer');
    expect(m).not.toContain('\n\n');
  });

  it('le nouveau mot de passe fait au moins 8 caractères et est confirmé', () => {
    expect(verifierMotDePasse('court', 'court')).toMatch(/8 caractères/);
    expect(verifierMotDePasse('assez-long', 'autre-chose')).toMatch(/identiques/);
    expect(verifierMotDePasse('assez-long', 'assez-long')).toBeNull();
  });
});
