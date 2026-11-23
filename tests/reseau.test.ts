import { describe, expect, it, vi } from 'vitest';

import {
  estErreurReseau,
  estMessageReseau,
  fetchAvecDelai,
  MESSAGE_LENT,
  MESSAGE_RESEAU,
  messageReseau,
  profilApresVerification,
  sansDelai,
} from '@/domain/reseau';

describe('reconnaître une coupure réseau', () => {
  it('reconnaît les messages des navigateurs et téléphones', () => {
    expect(estErreurReseau(new TypeError('Failed to fetch'))).toBe(true);
    expect(estErreurReseau(new TypeError('Network request failed'))).toBe(true);
    expect(estErreurReseau(new TypeError('Load failed'))).toBe(true);
    expect(estErreurReseau({ message: 'TypeError: Failed to fetch', code: '' })).toBe(true);
    expect(estErreurReseau({ name: 'AuthRetryableFetchError', message: '' })).toBe(true);
    expect(estErreurReseau({ name: 'AbortError', message: 'The operation was aborted.' })).toBe(true);
  });

  it('ne confond pas un vrai refus du serveur avec une coupure', () => {
    expect(estErreurReseau({ message: 'JWT expired', code: 'PGRST301' })).toBe(false);
    expect(estErreurReseau(new Error('permission denied for table clients'))).toBe(false);
    expect(estErreurReseau(null)).toBe(false);
  });

  it('donne un message lisible et reconnaissable', () => {
    expect(messageReseau(new TypeError('Failed to fetch'))).toBe(MESSAGE_RESEAU);
    expect(messageReseau(new Error('Délai dépassé (timeout)'))).toBe(MESSAGE_LENT);
    expect(messageReseau(new Error('autre chose'))).toBeNull();
    expect(estMessageReseau(MESSAGE_RESEAU)).toBe(true);
    expect(estMessageReseau('Ce Booster n’existe plus.')).toBe(false);
  });
});

describe('profil au démarrage', () => {
  const garde: { profil: Record<string, string> } = { profil: { role: 'client', clientId: 'c1', prenom: 'Léa' } };

  it('sans réseau, garde le dernier profil connu au lieu de déconnecter', () => {
    expect(profilApresVerification(garde, { ok: false, erreur: new TypeError('Failed to fetch') })).toEqual(garde.profil);
  });

  it('suit toujours la réponse du serveur quand il répond', () => {
    expect(profilApresVerification(garde, { ok: true, profil: null })).toBeNull();
    const autre: Record<string, string> = { role: 'coach', coachId: 'k1' };
    expect(profilApresVerification(garde, { ok: true, profil: autre })).toEqual(autre);
  });

  it('une autre erreur que le réseau ne garde pas le profil', () => {
    expect(profilApresVerification(garde, { ok: false, erreur: new Error('compte supprimé') })).toBeNull();
    expect(profilApresVerification(null, { ok: false, erreur: new TypeError('Failed to fetch') })).toBeNull();
  });
});

describe('délai maximum des demandes', () => {
  it('abandonne une demande qui ne répond pas', async () => {
    vi.useFakeTimers();
    const lent = vi.fn((_e: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_ok, ko) => init?.signal?.addEventListener('abort', () => ko(init.signal?.reason))),
    );
    const f = fetchAvecDelai(lent, 1000);
    const promesse = f('https://x.supabase.co/rest/v1/clients');
    const attendu = expect(promesse).rejects.toThrow(/timeout/);
    await vi.advanceTimersByTimeAsync(1001);
    await attendu;
    vi.useRealTimers();
  });

  it('laisse passer une demande rapide', async () => {
    const f = fetchAvecDelai(async () => new Response('ok'), 1000);
    expect(await (await f('https://x.supabase.co/rest/v1/clients')).text()).toBe('ok');
  });

  it('respecte une annulation demandée par l’appelant', async () => {
    const lent = (_e: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_ok, ko) => init?.signal?.addEventListener('abort', () => ko(new Error('annulé'))));
    const controle = new AbortController();
    const promesse = fetchAvecDelai(lent, 60_000)('https://x.supabase.co/rest/v1/a', { signal: controle.signal });
    controle.abort();
    await expect(promesse).rejects.toThrow('annulé');
  });

  it('ne limite pas les envois de photos et les fonctions IA', () => {
    expect(sansDelai('https://x.supabase.co/storage/v1/object/photos/a.jpg')).toBe(true);
    expect(sansDelai('https://x.supabase.co/functions/v1/analyser-repas')).toBe(true);
    expect(sansDelai('https://x.supabase.co/rest/v1/clients')).toBe(false);
  });
});
