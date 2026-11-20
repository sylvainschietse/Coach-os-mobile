/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, it } from 'vitest';

// Les sonneries étaient muettes (un simple décalage continu au lieu d'une onde) : chaque fichier doit vraiment sonner.
const dossier = join(__dirname, '../assets/sons');

it.each(readdirSync(dossier).filter((f) => f.endsWith('.wav') && f !== 'silence.wav'))('%s fait un vrai son', (f) => {
  const b = readFileSync(join(dossier, f));
  const donnees = b.subarray(44);
  const n = donnees.length / 2;
  let somme = 0;
  let carres = 0;
  let passages = 0;
  let avant = 0;
  for (let i = 0; i < n; i++) {
    const v = donnees.readInt16LE(i * 2) / 32767;
    somme += v;
    carres += v * v;
    if ((v > 0) !== (avant > 0)) passages++;
    avant = v;
  }
  const secondes = n / b.readUInt32LE(24);
  expect(Math.abs(somme / n)).toBeLessThan(0.02); // pas de décalage continu
  expect(Math.sqrt(carres / n)).toBeGreaterThan(0.1); // assez fort
  expect(passages / 2 / secondes).toBeGreaterThan(300); // au-dessus de 300 Hz en moyenne : audible sur un haut-parleur de téléphone
});
