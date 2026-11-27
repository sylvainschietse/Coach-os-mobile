// « Sur ta machine Technogym » : sous la vidéo habituelle d'un exercice sur machine, les machines équivalentes des
// marques du club du client (questionnaire de Ma nutrition, étape « Où t'entraînes-tu ? »), avec leur vidéo, pour
// qu'il reconnaisse celle de sa salle. Replié par défaut : la séance garde ses séries visibles.
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { nutrition } from '@/data/nutrition';
import { machinesPour, type MachineMarque, type MachinesDeMarque } from '@/domain/machines-marques';
import { salleDe } from '@/domain/salle-sport';
import type { Exercice } from '@/domain/types';
import { etatA11y } from '@/lib/accessibilite';
import { useCharger } from '@/lib/useCharger';
import { ChevronDown, ChevronUp, Dumbbell } from '@/ui/icones';

import { couleurs, nuit, polices } from '../theme';
import { VideoIntegree } from './video-integree';

/** Les marques de machines du club du client : celles qu'il a cochées, sinon celles connues de son enseigne. */
export function useMarquesClient(clientId: string, actif = true): string[] {
  const { donnee } = useCharger(async () => (actif ? nutrition.profil(clientId).catch(() => null) : null), `profil-nutrition-${clientId}${actif ? '' : '-attente'}`);
  const p = donnee?.preferences;
  if (!p) return [];
  return p.marques.length ? p.marques : (salleDe(p.salle)?.marques ?? []);
}

export function SurTaMachine({ exercice, marques, sombre }: { exercice: Pick<Exercice, 'nom' | 'materiel'>; marques: readonly string[]; sombre?: boolean }) {
  const groupes = machinesPour(exercice, marques);
  if (!groupes.length) return null;
  return (
    <View style={{ gap: 6 }}>
      {groupes.map((g) => (
        <Marque key={g.marque} groupe={g} sombre={sombre} />
      ))}
    </View>
  );
}

function Marque({ groupe, sombre }: { groupe: MachinesDeMarque; sombre?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [choisie, setChoisie] = useState<MachineMarque>(groupe.machines[0]);
  const c = sombre
    ? { fond: nuit.surface, texte: nuit.texte, doux: nuit.texteTertiaire, accent: nuit.rougeDoux, actif: nuit.rouge, puce: nuit.champ, bordure: nuit.bordureForte }
    : { fond: couleurs.carte, texte: couleurs.texte, doux: couleurs.texteDoux, accent: couleurs.rouge, actif: couleurs.rouge, puce: couleurs.discret, bordure: couleurs.bordure };
  const n = groupe.machines.length;
  const Chevron = ouvert ? ChevronUp : ChevronDown;
  return (
    <View style={[styles.boite, { backgroundColor: c.fond, borderColor: c.bordure }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sur ta machine ${groupe.marque}`}
        {...etatA11y({ expanded: ouvert })}
        onPress={() => setOuvert((o) => !o)}
        style={({ pressed }) => [styles.entete, pressed && { opacity: 0.7 }]}
      >
        <Dumbbell size={16} color={c.accent} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontFamily: polices.texteMoyen, fontSize: 14, color: c.texte }}>Sur ta machine {groupe.marque}</Text>
          <Text style={{ fontFamily: polices.texte, fontSize: 12, color: c.doux }}>
            {n === 1 ? `${choisie.gamme} · ${choisie.nom}` : `${n} machines, choisis celle de ta salle`}
          </Text>
        </View>
        <Chevron size={18} color={c.doux} />
      </Pressable>
      {ouvert && (
        <View style={{ gap: 8, paddingHorizontal: 10, paddingBottom: 10 }}>
          {n > 1 && (
            <View style={styles.puces}>
              {groupe.machines.map((m) => {
                const actif = m.ref === choisie.ref;
                return (
                  <Pressable
                    key={m.ref}
                    accessibilityRole="button"
                    accessibilityLabel={`${groupe.marque} ${m.gamme}, ${m.nom}`}
                    {...etatA11y({ selected: actif })}
                    onPress={() => setChoisie(m)}
                    style={[styles.puce, { backgroundColor: actif ? c.actif : c.puce, borderColor: actif ? c.actif : c.bordure }]}
                  >
                    <Text style={{ fontFamily: polices.texteMoyen, fontSize: 12, color: actif ? couleurs.blanc : c.texte }}>{m.gamme}</Text>
                    <Text style={{ fontFamily: polices.texte, fontSize: 12, color: actif ? couleurs.blanc : c.doux }}>{m.nom}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <View style={{ borderRadius: 8, overflow: 'hidden' }}>
            <VideoIntegree key={choisie.ref} url={choisie.videoUrl} nom={`${choisie.nom}, ${groupe.marque} ${choisie.gamme}`} />
          </View>
          <Text style={{ fontFamily: polices.texte, fontSize: 12, color: c.doux }}>
            {groupe.marque} {choisie.nomOfficiel.startsWith(choisie.gamme) ? choisie.nomOfficiel : `${choisie.gamme} ${choisie.nomOfficiel}`}. Même mouvement que l’exercice prévu, sur la machine de ta salle.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  boite: { borderRadius: 10, borderWidth: 1, overflow: 'hidden' },
  entete: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 9 },
  puces: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  puce: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 6, maxWidth: '100%' },
});
