// Espace client : ses prochains rendez-vous avec le coach. Confirmer ou refuser une invitation, annuler jusqu'au délai
// du coach (24 h par défaut) ; ensuite, le bouton devient « Appeler mon coach ».
import { useState } from 'react';
import { View } from 'react-native';

import { monCoach } from '@/data/acces-client';
import { agenda, type ActionClient } from '@/data/agenda';
import { annulableEnLigne, cleJour, heureDe, TYPES_RDV, type MonRendezVous } from '@/domain/agenda';
import { normaliserTelephone } from '@/domain/crm';
import { ouvrirLien } from '@/lib/ouvrir-lien';
import { maintenantMs } from '@/lib/temps';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, SousTitre, Texte } from '../composants';
import { couleurs, espace } from '../theme';

import { jourLong, majuscule, PastilleStatutRdv } from './commun';

const A_VENIR = ['propose', 'confirme'];

export function MesRendezVous({ clientId }: { clientId: string }) {
  const rdv = useCharger(() => agenda.mesRendezVous(clientId), `mes-rdv-${clientId}`);
  const coach = useCharger(() => monCoach(), 'mon-coach');
  const [maintenant] = useState(maintenantMs);
  const prochains = (rdv.donnee ?? []).filter((r) => A_VENIR.includes(r.statut) && new Date(r.fin).getTime() > maintenant).slice(0, 3);
  if (!prochains.length) return null;
  const telephone = normaliserTelephone(coach.donnee?.telephone);
  return (
    <Carte>
      <SousTitre>{prochains.length > 1 ? 'Mes prochains rendez-vous' : 'Mon prochain rendez-vous'}</SousTitre>
      {prochains.map((r, i) => (
        <View key={r.id} style={{ gap: espace(2), paddingTop: i ? espace(3) : 0, borderTopWidth: i ? 1 : 0, borderTopColor: couleurs.bordure }}>
          <LigneRdv r={r} telephone={telephone} coach={coach.donnee?.nom} maintenant={maintenant} onChange={rdv.recharger} />
        </View>
      ))}
    </Carte>
  );
}

function LigneRdv({ r, telephone, coach, maintenant, onChange }: { r: MonRendezVous; telephone?: string; coach?: string; maintenant: number; onChange: () => void }) {
  const [occupe, setOccupe] = useState<ActionClient>();
  const [erreur, setErreur] = useState<string>();
  const [annulation, setAnnulation] = useState(false);
  const agir = async (action: ActionClient) => {
    setOccupe(action);
    setErreur(undefined);
    try {
      await agenda.repondre(r.id, action);
      onChange();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Réponse non enregistrée.');
    } finally {
      setOccupe(undefined);
    }
  };
  const annulable = annulableEnLigne(r, new Date(maintenant));
  return (
    <>
      <Texte style={{ fontSize: 16 }}>
        {majuscule(jourLong(cleJour(r.debut)))} · {heureDe(r.debut)}–{heureDe(r.fin)}
      </Texte>
      <Texte doux style={{ fontSize: 14 }}>
        {TYPES_RDV[r.type]}
        {r.avec ? ` avec ${r.avec}` : ''}
        {r.lieu ? ` · ${r.lieu}` : ''}
      </Texte>
      <PastilleStatutRdv statut={r.statut} />
      {r.lienVisio && <Bouton variante="discret" libelle="Rejoindre la visio" onPress={() => ouvrirLien(r.lienVisio!).catch(() => undefined)} />}
      {r.statut === 'propose' && (
        <View style={{ flexDirection: 'row', gap: espace(2) }}>
          <View style={{ flex: 1 }}>
            <Bouton libelle="Je confirme" onPress={() => agir('confirme')} chargement={occupe === 'confirme'} desactive={!!occupe} />
          </View>
          <View style={{ flex: 1 }}>
            <Bouton variante="discret" libelle="Je ne peux pas" onPress={() => agir('refuse')} chargement={occupe === 'refuse'} desactive={!!occupe} />
          </View>
        </View>
      )}
      {annulable ? (
        annulation ? (
          <View style={{ flexDirection: 'row', gap: espace(2) }}>
            <View style={{ flex: 1 }}>
              <Bouton libelle="Oui, annuler" onPress={() => agir('annule')} chargement={occupe === 'annule'} desactive={!!occupe} />
            </View>
            <View style={{ flex: 1 }}>
              <Bouton variante="discret" libelle="Non, garder" onPress={() => setAnnulation(false)} desactive={!!occupe} />
            </View>
          </View>
        ) : (
          r.statut === 'confirme' && <Bouton variante="discret" libelle="Annuler ce rendez-vous" onPress={() => setAnnulation(true)} />
        )
      ) : (
        <>
          <Texte doux style={{ fontSize: 13 }}>Moins de 24 h avant : pour annuler, appelle {coach ?? 'ton coach'}.</Texte>
          {telephone && <Bouton variante="discret" libelle={`Appeler ${coach ?? 'mon coach'}`} onPress={() => ouvrirLien(`tel:+${telephone}`).catch(() => undefined)} />}
        </>
      )}
      {erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
    </>
  );
}
