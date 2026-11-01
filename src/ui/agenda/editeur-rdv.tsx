// Création et modification d'un rendez-vous : une ou plusieurs personnes (duo, couple), jour, heure, durée, lieu,
// répétition chaque semaine. Pour un rendez-vous existant : son statut et ce qui a été compté (pack ou paiement).
import { ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { abonnements } from '@/data/abonnements';
import { agenda } from '@/data/agenda';
import {
  ajouterJours,
  chevauchements,
  cleJour,
  dureeMinutes,
  erreursRendezVous,
  heureDe,
  repeter,
  STATUTS_RDV,
  TYPES_RDV,
  versIso,
  type ReglagesAgenda,
  type RendezVous,
  type StatutRdv,
  type TypeRdv,
} from '@/domain/agenda';
import { soldeSeances, TARIFS } from '@/domain/abonnements';
import { maintenantMs } from '@/lib/temps';
import { useCharger } from '@/lib/useCharger';

import { Selecteur } from '../coque';
import { Puce, Puces, Texte } from '../composants';
import { BoutonPied, Cellule, Grille, Libelle, Modale, Saisie } from '../crm/dossier';
import { couleurs, espace, polices } from '../theme';

import { jourLong } from './commun';

export interface ClientAgenda {
  id: string;
  prenom: string;
  nom: string;
}

const DUREES = [30, 45, 60, 90];
const euros = (n: number) => `${n.toLocaleString('fr-FR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;

export function EditeurRendezVous({
  rdv,
  creneau,
  clientInitial,
  clients,
  reglages,
  onFermer,
  onEnregistre,
}: {
  /** Création depuis une alerte : client déjà choisi. */
  clientInitial?: string;
  /** Rendez-vous existant ; absent pour une création. */
  rdv?: RendezVous;
  /** Création : jour et heure proposés (créneau touché dans l'agenda). */
  creneau?: { jour: string; heure: string };
  clients: ClientAgenda[];
  reglages: ReglagesAgenda;
  onFermer: () => void;
  onEnregistre: () => void;
}) {
  const [clientIds, setClientIds] = useState<string[]>(rdv?.participants.map((p) => p.clientId) ?? (clientInitial ? [clientInitial] : []));
  const [type, setType] = useState<TypeRdv>(rdv?.type ?? 'seance');
  const [jour, setJour] = useState(rdv ? cleJour(rdv.debut) : (creneau?.jour ?? cleJour(new Date())));
  const [heure, setHeure] = useState(rdv ? heureDe(rdv.debut) : (creneau?.heure ?? '18:00'));
  const [duree, setDuree] = useState(String(rdv ? dureeMinutes(rdv) : reglages.dureeMinutes));
  const [lieu, setLieu] = useState(rdv?.lieu ?? reglages.lieuDefaut);
  const [lienVisio, setLienVisio] = useState(rdv?.lienVisio ?? '');
  const [note, setNote] = useState(rdv?.note ?? '');
  const [semaines, setSemaines] = useState('1');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string>();
  const [statutDemande, setStatutDemande] = useState<StatutRdv>();
  const [suppression, setSuppression] = useState(false);
  const [maintenant] = useState(maintenantMs);

  const minutes = Number(duree);
  const fois = Math.max(1, Math.min(52, Math.floor(Number(semaines) || 1)));
  const erreurs = erreursRendezVous({ clientIds, jour, heure, duree: minutes, type, lienVisio });
  const creneaux = useMemo(() => {
    if (erreurs.length) return [];
    const debut = versIso(jour, heure.trim());
    const fin = new Date(new Date(debut).getTime() + minutes * 60_000).toISOString();
    return rdv ? [{ debut, fin }] : repeter({ debut, fin }, fois);
  }, [jour, heure, minutes, fois, rdv, erreurs.length]);

  // Rendez-vous déjà pris sur la période, pour prévenir d'un chevauchement.
  const periode = creneaux.length ? `${creneaux[0].debut}|${creneaux.at(-1)!.fin}` : '';
  const autour = useCharger(
    () => (periode ? agenda.rendezVous(ajouterJours(new Date(creneaux[0].debut), -1).toISOString(), ajouterJours(new Date(creneaux.at(-1)!.fin), 1).toISOString()) : Promise.resolve([])),
    `autour-${periode}`,
  );
  const conflits = creneaux.flatMap((c) => chevauchements(c, autour.donnee ?? [], reglages.tamponMinutes, rdv?.id));

  // Séances restantes de chaque personne : décompte du pack ou part du prix à l'unité.
  const cle = clientIds.join(',');
  const soldes = useCharger(
    () => Promise.all(clientIds.map(async (id) => ({ id, packs: await abonnements.packs(id), abo: await abonnements.lire(id) }))),
    `soldes-${cle}`,
  );

  const nom = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c ? `${c.prenom} ${c.nom}`.trim() : 'Client';
  };

  async function faire(action: () => Promise<void>) {
    setErreur(undefined);
    setOccupe(true);
    try {
      await action();
      onEnregistre();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Action impossible pour le moment.');
    } finally {
      setOccupe(false);
    }
  }

  const enregistrer = () => {
    if (erreurs.length) return setErreur(erreurs.join('\n'));
    const commun = { type, clientIds, lieu, lienVisio: type === 'visio' ? lienVisio : undefined, note };
    return faire(() => (rdv ? agenda.modifier(rdv.id, { ...commun, ...creneaux[0] }) : agenda.creer({ ...commun, creneaux })));
  };
  const changerStatut = (statut: StatutRdv, compter = true) => faire(() => agenda.changerStatut(rdv!.id, statut, compter));

  const passe = rdv ? new Date(rdv.debut).getTime() < maintenant : false;
  const restants = clients.filter((c) => !clientIds.includes(c.id));

  return (
    <Modale
      titre={rdv ? 'Rendez-vous' : 'Nouveau rendez-vous'}
      onFermer={onFermer}
      pied={
        <View style={{ gap: espace(3) }}>
          {erreur && <Text style={{ color: couleurs.rouge, fontFamily: polices.texte, fontSize: 14 }}>{erreur}</Text>}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: espace(3) }}>
            {rdv && !rdv.compte && (
              <BoutonPied
                libelle={suppression ? 'Confirmer la suppression' : 'Supprimer'}
                danger
                desactive={occupe}
                onPress={() => (suppression ? faire(() => agenda.supprimer(rdv.id)) : setSuppression(true))}
              />
            )}
            <BoutonPied libelle="Fermer" onPress={onFermer} />
            <BoutonPied libelle={occupe ? 'Enregistrement…' : creneaux.length > 1 ? `Créer ${creneaux.length} rendez-vous` : 'Enregistrer'} onPress={enregistrer} desactive={occupe} />
          </View>
        </View>
      }
    >
      {rdv && (
        <View style={{ gap: espace(2), padding: espace(3), borderRadius: 12, backgroundColor: couleurs.discret }}>
          <Text style={{ fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte }}>{STATUTS_RDV[rdv.statut]}</Text>
          {rdv.participants.map((p) => (
            <Texte key={p.clientId} doux style={{ fontSize: 13 }}>
              {p.prenom} :{' '}
              {p.decompte ? 'séance décomptée de son pack' : p.packId ? 'séance comptée sur le pack partagé' : p.montant !== undefined ? `${euros(p.montant)} à régler (dans Paiements)` : rdv.compte ? 'rien à compter' : 'pas encore compté'}
            </Texte>
          ))}
          <Libelle>Changer le statut</Libelle>
          <Puces>
            {!passe && <Puce libelle="Confirmé" actif={rdv.statut === 'confirme'} onPress={() => changerStatut('confirme')} />}
            <Puce libelle="Réalisé" actif={rdv.statut === 'realise'} onPress={() => changerStatut('realise')} />
            <Puce libelle="Absent…" actif={rdv.statut === 'absent' || statutDemande === 'absent'} onPress={() => setStatutDemande('absent')} />
            <Puce libelle="Annulé tard…" actif={rdv.statut === 'annule_tard' || statutDemande === 'annule_tard'} onPress={() => setStatutDemande('annule_tard')} />
            <Puce libelle="Annulé" actif={rdv.statut === 'annule'} onPress={() => changerStatut('annule')} />
          </Puces>
          {statutDemande && (
            <View style={{ gap: espace(2) }}>
              <Texte style={{ fontSize: 14 }}>
                {statutDemande === 'absent' ? 'Absent sans prévenir' : 'Annulé à moins de 24 h'} : la séance est-elle due ?
              </Texte>
              <Puces>
                <Puce libelle="Oui, décomptée / due" onPress={() => changerStatut(statutDemande, true)} />
                <Puce libelle="Non, offerte" onPress={() => changerStatut(statutDemande, false)} />
              </Puces>
            </View>
          )}
        </View>
      )}

      <View style={{ gap: espace(2) }}>
        <Libelle>{clientIds.length > 1 ? `Personnes (${clientIds.length})` : 'Client'}</Libelle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(2) }}>
          {clientIds.map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={`Retirer ${nom(id)}`}
              disabled={rdv?.compte}
              onPress={() => setClientIds((l) => l.filter((x) => x !== id))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: couleurs.rougeClair }}
            >
              <Text style={{ fontFamily: polices.texteMoyen, fontSize: 14, color: couleurs.rougeTexte }}>{nom(id)}</Text>
              {!rdv?.compte && <X size={14} color={couleurs.rougeTexte} />}
            </Pressable>
          ))}
        </View>
        {!rdv?.compte && restants.length > 0 && (
          <Selecteur
            libelle={clientIds.length ? 'Ajouter une personne (duo, couple)' : 'Choisir le client'}
            sansLibelle
            options={[
              { cle: '', libelle: clientIds.length ? '+ Ajouter une personne (duo, couple)' : 'Choisir le client…' },
              ...restants.map((c) => ({ cle: c.id, libelle: `${c.prenom} ${c.nom}`.trim() })),
            ]}
            valeur=""
            onChange={(id) => id && setClientIds((l) => [...l, id])}
          />
        )}
        {soldes.donnee?.map((s) => {
          const solde = soldeSeances(s.packs);
          const partage = s.packs.some((p) => p.titulaire || p.partageAvec?.length);
          const tarif = s.abo.tarifSeance ?? TARIFS.seance;
          return (
            <Texte key={s.id} doux style={{ fontSize: 13, color: solde.total && solde.restantes <= reglages.seuilFinPack ? couleurs.orange : couleurs.texteDoux }}>
              {nom(s.id)} :{' '}
              {solde.restantes
                ? `${solde.restantes} séance${solde.restantes > 1 ? 's' : ''} restante${solde.restantes > 1 ? 's' : ''}${partage ? ' (pack partagé)' : ''}`
                : `pas de pack en cours, ${euros(tarif)} la séance${clientIds.length > 1 ? `, soit ${euros(Math.round((tarif / clientIds.length) * 100) / 100)} à ${clientIds.length}` : ''}`}
            </Texte>
          );
        })}
      </View>

      <Puces>
        {(Object.keys(TYPES_RDV) as TypeRdv[]).map((t) => (
          <Puce key={t} libelle={TYPES_RDV[t]} actif={type === t} onPress={() => setType(t)} />
        ))}
      </Puces>

      <View style={{ gap: espace(2) }}>
        <Libelle>Jour</Libelle>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(2) }}>
          <Fleche nom="Jour précédent" gauche onPress={() => setJour(cleJour(ajouterJours(new Date(`${jour}T12:00:00`), -1)))} />
          <Text style={{ flex: 1, textAlign: 'center', fontFamily: polices.texteMoyen, fontSize: 15, color: couleurs.texte }}>{jourLong(jour)}</Text>
          <Fleche nom="Jour suivant" onPress={() => setJour(cleJour(ajouterJours(new Date(`${jour}T12:00:00`), 1)))} />
        </View>
      </View>
      <Grille>
        <Cellule>
          <Saisie libelle="Heure" valeur={heure} onChange={setHeure} placeholder="18:30" erreur={heure && !/^\d{1,2}:\d{2}$/.test(heure.trim()) ? 'Écris l’heure comme 18:30.' : undefined} />
        </Cellule>
        <Cellule>
          <Saisie libelle="Durée (minutes)" type="nombre" valeur={duree} onChange={setDuree} />
          <View style={{ marginTop: espace(2) }}>
            <Puces>
              {DUREES.map((d) => (
                <Puce key={d} libelle={`${d} min`} actif={minutes === d} onPress={() => setDuree(String(d))} />
              ))}
            </Puces>
          </View>
        </Cellule>
        <Cellule pleine>
          {type === 'visio' ? (
            <Saisie libelle="Lien visio" valeur={lienVisio} onChange={setLienVisio} placeholder="https://meet.google.com/…" aide="Le lien automatique viendra avec la synchro Google." />
          ) : (
            <Saisie libelle="Lieu" valeur={lieu} onChange={setLieu} placeholder="Salle, domicile, parc…" />
          )}
        </Cellule>
        {!rdv && (
          <Cellule pleine>
            <Saisie libelle="Répéter chaque semaine, nombre de séances" type="nombre" valeur={semaines} onChange={setSemaines} aide="1 : une seule fois. 10 : le même créneau pendant 10 semaines." />
          </Cellule>
        )}
        <Cellule pleine>
          <Saisie libelle="Note (visible par toi seul)" long valeur={note} onChange={setNote} />
        </Cellule>
      </Grille>

      {conflits.length > 0 && (
        <View style={{ padding: espace(3), borderRadius: 12, backgroundColor: couleurs.orangeClair }}>
          <Texte style={{ fontSize: 14, color: couleurs.orange }}>
            Attention, ce créneau chevauche {conflits.length > 1 ? `${conflits.length} rendez-vous` : 'un rendez-vous'} :{' '}
            {conflits
              .slice(0, 3)
              .map((c) => `${jourLong(cleJour(c.debut))} ${heureDe(c.debut)} (${c.participants.map((p) => p.prenom).join(' et ')})`)
              .join(', ')}
            {reglages.tamponMinutes ? `, temps de trajet de ${reglages.tamponMinutes} min compris` : ''}. Tu peux quand même enregistrer.
          </Texte>
        </View>
      )}
      {!rdv && clientIds.length > 0 && (
        <Texte doux style={{ fontSize: 13 }}>
          {clientIds.length > 1 ? 'Chaque personne reçoit' : 'Le client reçoit'} un mail pour confirmer ou refuser, puis un rappel {reglages.rappelHeures} h avant.
        </Texte>
      )}
    </Modale>
  );
}

function Fleche({ nom, gauche, onPress }: { nom: string; gauche?: boolean; onPress: () => void }) {
  const Icone = gauche ? ChevronLeft : ChevronRight;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={nom} onPress={onPress} style={{ padding: espace(2), borderRadius: 10, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.carte }}>
      <Icone size={18} color={couleurs.texte} />
    </Pressable>
  );
}
