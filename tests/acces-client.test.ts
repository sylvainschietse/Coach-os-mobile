import { describe, expect, it } from 'vitest';

import { messageAcces, verifierCoordonnees, verifierMotDePasse } from '../src/domain/acces-client';

describe('accès client', () => {
  it('le message donne l’e-mail, le mot de passe provisoire et le lien d’installation', () => {
    const m = messageAcces('Marc', 'Sylvain', { email: 'marc@exemple.fr', motDePasse: 'abcd-efgh-jkmn' }, 'https://exemple.fr/appli');
    expect(m).toContain('Salut Marc');
    expect(m).toContain('E-mail : marc@exemple.fr');
    expect(m).toContain('Mot de passe provisoire : abcd-efgh-jkmn');
    expect(m).toContain('https://exemple.fr/appli');
    expect(m).toContain('À bientôt, Sylvain');
  });

  it('le message donne le lien de la vidéo de mise en route', () => {
    const m = messageAcces('Marc', 'Sylvain', { email: 'm@e.fr', motDePasse: 'x' }, 'https://exemple.fr/appli', 'https://exemple.fr/tuto.mp4');
    expect(m).toContain('regarde la vidéo (1 min 30) : https://exemple.fr/tuto.mp4');
    expect(m).not.toContain('\n\n');
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

describe('coordonnées modifiées par le client', () => {
  it('exige un e-mail valide, le téléphone est facultatif', () => {
    expect(verifierCoordonnees('', '')).toMatch(/e-mail/);
    expect(verifierCoordonnees('pas-un-email', '')).toMatch(/e-mail/);
    expect(verifierCoordonnees('zoe@exemple.fr', '')).toBeNull();
    expect(verifierCoordonnees(' Zoe@Exemple.fr ', '06 12 34 56 78')).toBeNull();
  });

  it('refuse un numéro de téléphone illisible', () => {
    expect(verifierCoordonnees('zoe@exemple.fr', '12')).toMatch(/téléphone/);
  });
});
