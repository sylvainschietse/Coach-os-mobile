import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import brut from '@/data/modeles-demo.json';
import { clePhotoProgramme, CLES_PROGRAMME } from '@/domain/illustration-programme';

const doc = brut as unknown as { d: string[]; p: [string, number, number | null, number | null, ...unknown[]][] };
const modeles = doc.p.map(([, titre, , objectif, , , env, mat]) => ({
  titre: doc.d[titre],
  objectif: objectif === null ? undefined : doc.d[objectif],
  environnement: env === null ? undefined : doc.d[env as number],
  materiel: mat === null ? undefined : doc.d[mat as number],
}));

describe('photo des programmes', () => {
  it('chaque photo existe dans les fichiers de l’app', () => {
    for (const cle of CLES_PROGRAMME) expect(existsSync(`assets/images/programmes/${cle}.jpg`), cle).toBe(true);
  });

  it('les méthodes de référence montrent leur exercice', () => {
    const cle = (debut: string) => clePhotoProgramme(modeles.find((m) => m.titre.startsWith(debut))!);
    expect(cle('CAL-TRACTIONS-2')).toBe('cal-tractions');
    expect(cle('CAL-BASE-2')).toBe('cal-base');
    expect(cle('REF-CARRIO-3')).toBe('maison-elastiques-2');
    expect(cle('REF-AX-2')).toBe('maison-halteres');
    expect(cle('REF-BWS-3')).toBe('ref-bws');
  });

  it('les modèles en salle suivent leur objectif', () => {
    const salle = modeles.filter((m) => m.titre.startsWith('MOD-SAL-'));
    expect(salle).toHaveLength(80);
    const attendu: Record<string, string> = { 'Perte de poids': 'perte', 'Prise de muscle': 'muscle', 'Prise de force': 'force', 'Remise en forme': 'forme' };
    for (const m of salle) expect(clePhotoProgramme(m), m.titre).toMatch(new RegExp(`^salle-${attendu[m.objectif!]}-[123]$`));
    // Les trois photos de chaque objectif servent.
    expect(new Set(salle.map(clePhotoProgramme)).size).toBe(12);
  });

  it('un programme créé par le coach reçoit une photo, même sans objectif', () => {
    expect(clePhotoProgramme({ titre: 'Mon programme', objectif: 'Prise de force' })).toMatch(/^salle-force-/);
    expect(clePhotoProgramme({ titre: 'Reprise douce', environnement: 'Poids du corps' })).toBe('cal-base');
    expect(clePhotoProgramme({ titre: 'Séance seule · Haut du corps' })).toBe('coaching');
    expect(CLES_PROGRAMME).toContain(clePhotoProgramme({ titre: 'Sans rien' }));
  });
});
