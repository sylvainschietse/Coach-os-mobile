// Attribuer un programme ou une séance à un client depuis la bibliothèque : une copie à son nom, rangée dans un cycle
// de son suivi (un cycle encore vide, ou un nouveau cycle de quatre semaines).
import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { attribuerAuClient, entrainement, type CibleAttribution } from '@/data/entrainement';
import { ecrireJour, lireJour } from '@/domain/crm';
import { aujourdhuiParis, correspondRecherche, finSuivi } from '@/domain/entrainement';
import type { SuiviClient } from '@/domain/entrainement-etat';
import { useCharger } from '@/lib/useCharger';

import { Modale, Recherche, Saisie } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { Action, CaseSelection, Etat, jourCourt, Ligne, ListeChoix, ts } from './commun';

const NOUVEAU = 'nouveau';

export function AttributionClient({
  coachId,
  source,
  nom,
  onFermer,
}: {
  coachId: string;
  source: { programmeId: string } | { seanceId: string };
  nom: string;
  onFermer: () => void;
}) {
  const { donnee, erreur: erreurLecture } = useCharger(() => entrainement.suivis(coachId), `suivis-${coachId}`);
  const [q, setQ] = useState('');
  const [clientId, setClientId] = useState('');
  const [cycleId, setCycleId] = useState(NOUVEAU);
  const [activer, setActiver] = useState(true);
  const [debut, setDebut] = useState(ecrireJour(aujourdhuiParis()));
  const [mois, setMois] = useState('3');
  const [occupe, setOccupe] = useState(false);
  const [etat, setEtat] = useState<{ message?: string; erreur?: string }>({});

  const clients = useMemo(() => (donnee ? donnee.filter((c) => correspondRecherche(c.nom, q)) : null), [donnee, q]);
  const client = donnee?.find((c) => c.clientId === clientId);
  const vides = client?.cycles.filter((c) => !c.programmeId && c.statut !== 'Terminé') ?? [];
  const actif = client?.cycles.find((c) => c.statut === 'Actif');
  const jour = lireJour(debut);
  const n = Number(mois);
  const suiviValide = !!client?.suivi || (!!jour && Number.isInteger(n) && n >= 1 && n <= 24);
  const fait = !!etat.message;

  const choisirClient = (c: SuiviClient) => {
    setClientId(c.clientId);
    setCycleId(NOUVEAU);
    setEtat({});
  };

  const valider = async () => {
    if (!client || occupe) return;
    setOccupe(true);
    setEtat({});
    try {
      const cible: CibleAttribution = cycleId === NOUVEAU ? { nouveau: true, activer } : { cycleId };
      const r = await attribuerAuClient(coachId, source, client, cible, client.suivi ? undefined : { debut: jour!, dureeMois: n });
      setEtat({
        message: r.active
          ? `Attribué à ${client.nom} dans « ${r.cycle} », visible dès maintenant dans son espace.`
          : `Attribué à ${client.nom} dans « ${r.cycle} » (prêt). Activez ce cycle depuis Suivis quand il doit commencer.`,
      });
    } catch (e) {
      setEtat({ erreur: e instanceof Error ? e.message : 'Attribution impossible' });
    } finally {
      setOccupe(false);
    }
  };

  return (
    <Modale
      titre={`Attribuer « ${nom} »`}
      largeur={640}
      onFermer={() => !occupe && onFermer()}
      pied={
        <Ligne style={{ justifyContent: 'flex-end' }}>
          <Action libelle={fait ? 'Fermer' : 'Annuler'} variante="contour" desactive={occupe} onPress={onFermer} />
          {!fait && <Action libelle="Attribuer" chargement={occupe} desactive={!client || !suiviValide} onPress={valider} />}
        </Ligne>
      }
    >
      <Text style={ts.doux}>Le client reçoit une copie à son nom. Vous pouvez la modifier pour lui sans toucher au modèle de la bibliothèque.</Text>
      <Text style={ts.titreChamp}>Client</Text>
      <View style={{ flexDirection: 'row' }}>
        <Recherche valeur={q} onChange={setQ} libelle="Rechercher un client" placeholder="Rechercher un client…" />
      </View>
      {erreurLecture ? (
        <Etat erreur={erreurLecture} />
      ) : (
        <ListeChoix
          elements={clients}
          cle={(c) => c.clientId}
          libelle={(c) => c.nom}
          detail={(c) => (c.suivi ? `Suivi jusqu’au ${jourCourt(finSuivi(c.suivi.debut, c.suivi.dureeMois))}` : 'Pas encore de suivi')}
          choisi={clientId}
          onChoisir={choisirClient}
          vide="Aucun client actif ne correspond."
        />
      )}

      {client && !client.suivi && (
        <View style={{ gap: 8 }}>
          <Text style={ts.texte}>{client.nom} n’a pas encore de suivi : il sera créé avec ces dates.</Text>
          <Ligne style={{ alignItems: 'flex-start' }}>
            <View style={{ flexBasis: 160, flexGrow: 1, minWidth: 0 }}>
              <Saisie libelle="Début du suivi" valeur={debut} placeholder="jj/mm/aaaa" erreur={debut && !jour ? 'Écrivez la date comme 24/10/2026' : undefined} onChange={setDebut} />
            </View>
            <View style={{ flexBasis: 120, flexGrow: 1, minWidth: 0 }}>
              <Saisie libelle="Durée (mois)" valeur={mois} erreur={Number.isInteger(n) && n >= 1 && n <= 24 ? undefined : 'Entier de 1 à 24'} onChange={setMois} />
            </View>
          </Ligne>
        </View>
      )}

      {client && (
        <View style={{ gap: 8 }}>
          <Text style={ts.titreChamp}>Cycle</Text>
          <ListeChoix
            elements={[
              ...vides.map((c) => ({ id: c.id, libelle: `Remplir « ${c.nom} »`, detail: `${jourCourt(c.debut)} → ${jourCourt(c.fin)} · ${c.statut}` })),
              { id: NOUVEAU, libelle: 'Nouveau cycle de 4 semaines', detail: actif ? `Après « ${actif.nom} », à activer ensuite` : 'À la suite des cycles existants' },
            ]}
            cle={(c) => c.id}
            libelle={(c) => c.libelle}
            detail={(c) => c.detail}
            choisi={cycleId}
            onChoisir={(c) => setCycleId(c.id)}
          />
          {cycleId === NOUVEAU && !actif && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CaseSelection nom="Activer le cycle tout de suite" valeur={activer} onChange={setActiver} />
              <Text style={[ts.texte, { flex: 1, fontFamily: polices.texteMoyen }]}>Activer tout de suite (le client le voit dans son espace)</Text>
            </View>
          )}
          {actif && cycleId === NOUVEAU && <Text style={[ts.doux, { color: couleurs.texteDoux }]}>Le cycle en cours « {actif.nom} » n’est pas modifié.</Text>}
        </View>
      )}
      <Etat {...etat} />
    </Modale>
  );
}
