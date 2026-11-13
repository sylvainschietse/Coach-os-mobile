// Bilan du mois du coach : où il en est (encaissé, à encaisser, abonnements, packs, séances, clients) et l'évolution
// mois par mois et année par année. Paiements du carnet, rendez-vous de l'agenda.
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { agenda } from '@/data/agenda';
import { abonnements } from '@/data/abonnements';
import { crm, ecouterCrm } from '@/data/crm';
import type { RendezVous } from '@/domain/agenda';
import {
  chiffresDuMois,
  decalerMois,
  detailDuMois,
  ecart,
  evolutionAnnuelle,
  evolutionMensuelle,
  MESURES,
  moisDe,
  moisParDefaut,
  nomMois,
  SOURCES,
  type Donnees,
  type Mesure,
  type Mois,
  type Point,
  type Tuile,
} from '@/domain/bilan-mois';
import { montantLisible, type Paiement } from '@/domain/gestion';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { Stat } from '../coque';
import { Carte, Chargement, Erreur, Puce, Puces } from '../composants';
import { Modale } from './dossier';
import { couleurs, polices } from '../theme';

/** Tous les rendez-vous depuis la première activité, trimestre par trimestre (une lecture rend 1 000 lignes au plus). */
async function toutLAgenda(depuis: number, maintenant: Date): Promise<RendezVous[]> {
  const fin = new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1);
  const tranches: [string, string][] = [];
  for (let d = new Date(depuis, 0, 1); d < fin; d = new Date(d.getFullYear(), d.getMonth() + 3, 1)) {
    const suite = new Date(d.getFullYear(), d.getMonth() + 3, 1);
    tranches.push([d.toISOString(), (suite < fin ? suite : fin).toISOString()]);
  }
  return (await Promise.all(tranches.map(([du, au]) => agenda.rendezVous(du, au)))).flat();
}

async function charger(): Promise<Donnees> {
  // Les abonnements du mois deviennent des lignes « En attente » avant de lire les paiements.
  await abonnements.preparerEcheances().catch(() => undefined);
  const carnet = await crm.carnet();
  const maintenant = new Date();
  const annees = carnet.paiements.filter((p) => p.date).map((p) => Number(p.date!.slice(0, 4)));
  // L'agenda est arrivé en 2026 : rien avant, sauf paiements plus anciens saisis à la main.
  const depuis = Math.min(maintenant.getFullYear(), ...annees.filter((a) => a >= 2020));
  const rendezVous = await toutLAgenda(depuis, maintenant);
  return { paiements: carnet.paiements, rendezVous, contacts: carnet.contacts };
}

const nombre = (n: number) => new Intl.NumberFormat('fr-FR').format(n);
const enEuros = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
/** « +12 % par rapport à septembre », ou « comme en septembre ». */
const evolution = (e: number, quand: string) => (e === 0 ? `comme en ${quand}` : `${e > 0 ? '+' : ''}${e} % par rapport à ${quand}`);
const valeurDe = (p: Point, m: Mesure) => (m === 'encaisse' ? p.encaisse : m === 'seances' ? p.seances : p.clients);
const lisible = (v: number, m: Mesure) => (m === 'encaisse' ? enEuros(v) : nombre(v));

/** Montant d'une tuile : sans centimes quand il n'y en a pas, pour tenir sur une ligne. */
const enTuile = (v: number) => (Number.isInteger(v) ? enEuros(v) : montantLisible(v));

export function BilanMois({
  onPaiements,
  onOuvrirPaiement,
  onOuvrirContact,
}: {
  /** Ouvre la liste complète des paiements (absent quand elle est déjà sous le bilan). */
  onPaiements?: () => void;
  onOuvrirPaiement: (id: string) => void;
  onOuvrirContact: (id: string) => void;
}) {
  const [tuile, setTuile] = useState<Tuile>();
  const { width } = useWindowDimensions();
  const maintenant = new Date();
  const [mois, setMois] = useState<Mois>(() => moisParDefaut(maintenant));
  const [mesure, setMesure] = useState<Mesure>('encaisse');
  const chargement = useCharger(charger, 'bilan-mois');
  useRechargerSur(chargement.recharger, ecouterCrm);

  if (chargement.erreur && !chargement.donnee) return <Erreur message={chargement.erreur} onReessayer={chargement.recharger} />;
  if (!chargement.donnee) return <Chargement />;
  const d = chargement.donnee;

  const c = chiffresDuMois(d, mois);
  const precedent = chiffresDuMois(d, decalerMois(mois, -1));
  const anPasse = chiffresDuMois(d, decalerMois(mois, -12));
  const annee = Number(mois.slice(0, 4));
  const parMois = evolutionMensuelle(d, annee);
  const parAn = evolutionAnnuelle(d, maintenant);
  const enCours = mois === moisDe(maintenant);
  const dernier = mois >= moisDe(maintenant);

  // Deux colonnes dès le téléphone : huit chiffres restent lisibles d'un coup d'œil.
  const colonnes = width >= 1280 ? 4 : 2;
  const base = `${100 / colonnes - 2}%` as const;
  const large = width >= 1100;
  const vsPrecedent = ecart(c.encaisse, precedent.encaisse);
  const vsAnPasse = ecart(c.encaisse, anPasse.encaisse);

  return (
    <View style={{ gap: 24 }}>
      {/* Choix du mois */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Fleche sens="avant" onPress={() => setMois(decalerMois(mois, -1))} />
        <View style={{ alignItems: 'center', flexShrink: 1 }}>
          <Text style={{ fontFamily: polices.titre, fontSize: 30, color: couleurs.texte, textTransform: 'uppercase', letterSpacing: 1 }}>{nomMois(mois)}</Text>
          {enCours && <Text style={doux}>Mois en cours : les chiffres bougent jusqu’au dernier jour.</Text>}
        </View>
        <Fleche sens="apres" desactive={dernier} onPress={() => setMois(decalerMois(mois, 1))} />
      </View>

      {/* La phrase qui résume le mois */}
      <Carte style={{ padding: 20, gap: 6, borderColor: couleurs.rouge }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>
          {enCours ? 'Ce mois-ci, tu as encaissé ' : `En ${nomMois(mois).split(' ')[0]}, tu as encaissé `}
          <Text style={{ color: couleurs.rouge }}>{montantLisible(c.encaisse)}</Text>
          {vsPrecedent !== null && ` (${evolution(vsPrecedent, nomMois(precedent.mois).split(' ')[0])})`}.
        </Text>
        <Text style={doux}>
          {nombre(c.seancesRealisees)} séance{c.seancesRealisees > 1 ? 's' : ''} réalisée{c.seancesRealisees > 1 ? 's' : ''} avec {nombre(c.clientsVus)} client
          {c.clientsVus > 1 ? 's' : ''}
          {c.nouveauxClients ? `, dont ${c.nouveauxClients} nouveau${c.nouveauxClients > 1 ? 'x' : ''}` : ''}.
          {c.aEncaisser > 0 ? ` Il reste ${montantLisible(c.aEncaisser)} à encaisser.` : ''}
          {vsAnPasse !== null ? ` Encaissé : ${evolution(vsAnPasse, nomMois(anPasse.mois))}.` : ''}
        </Text>
      </Carte>

      {/* Les chiffres du mois */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Stat style={{ flexBasis: base }} libelle="Encaissé" valeur={enTuile(c.encaisse)} onPress={() => setTuile('encaisse')} />
        <Stat style={{ flexBasis: base }} libelle="À encaisser" valeur={enTuile(c.aEncaisser)} onPress={() => setTuile('aEncaisser')} />
        <Stat
          style={{ flexBasis: base }}
          libelle={c.abonnementsOfferts ? `Abonnements réglés (+ ${c.abonnementsOfferts} offert${c.abonnementsOfferts > 1 ? 's' : ''})` : 'Abonnements réglés'}
          valeur={nombre(c.abonnementsRegles)}
          onPress={() => setTuile('abonnements')}
        />
        <Stat style={{ flexBasis: base }} libelle="Packs vendus" valeur={nombre(c.packsVendus)} onPress={() => setTuile('packs')} />
        <Stat style={{ flexBasis: base }} libelle="Séances réalisées" valeur={nombre(c.seancesRealisees)} onPress={() => setTuile('seances')} />
        <Stat style={{ flexBasis: base }} libelle="Clients vus" valeur={nombre(c.clientsVus)} onPress={() => setTuile('clients')} />
        <Stat style={{ flexBasis: base }} libelle="Nouveaux clients" valeur={nombre(c.nouveauxClients)} onPress={() => setTuile('nouveaux')} />
        <Stat
          style={{ flexBasis: base }}
          libelle="Absences et annulations tardives"
          valeur={nombre(c.seancesManquees)}
          onPress={() => setTuile('manquees')}
        />
      </View>

      <View style={{ flexDirection: large ? 'row' : 'column', gap: 20 }}>
        {/* D'où vient l'argent */}
        <Carte style={{ flex: large ? 1 : undefined, padding: 20 }}>
          <Text style={titreCarte}>D’où vient l’argent</Text>
          {c.parSource.length === 0 && <Text style={doux}>Aucun paiement réglé ce mois-ci.</Text>}
          {c.parSource.map((s) => (
            <View key={s.source} style={{ paddingVertical: 8, gap: 6 }}>
              <View style={ligne}>
                <Text style={texte}>
                  {SOURCES[s.source]} <Text style={doux}>· {s.nombre}</Text>
                </Text>
                <Text style={[texte, { fontFamily: polices.texteGras }]}>{montantLisible(s.montant)}</Text>
              </View>
              <Jauge part={c.encaisse ? s.montant / c.encaisse : 0} />
            </View>
          ))}
          {c.rembourse > 0 && <Text style={[doux, { marginTop: 8 }]}>Remboursé ce mois-ci : {montantLisible(c.rembourse)}</Text>}
        </Carte>

        {/* Clients du mois */}
        <Carte style={{ flex: large ? 1 : undefined, padding: 20 }}>
          <Text style={titreCarte}>Clients du mois</Text>
          {c.meilleursClients.length === 0 && <Text style={doux}>Aucun client vu ni réglé ce mois-ci.</Text>}
          {c.meilleursClients.map((x, i, l) => (
            <View key={x.cle} style={[ligne, { paddingVertical: 10 }, i < l.length - 1 && bordure]}>
              <View style={{ flexShrink: 1 }}>
                <Text style={texte}>{x.nom}</Text>
                <Text style={doux}>{x.seances ? `${x.seances} séance${x.seances > 1 ? 's' : ''}` : 'Pas de séance ce mois-ci'}</Text>
              </View>
              <Text style={[texte, { fontFamily: polices.texteGras }]}>{x.montant ? montantLisible(x.montant) : '—'}</Text>
            </View>
          ))}
        </Carte>
      </View>

      {/* Évolution */}
      <Carte style={{ padding: 20, gap: 16 }}>
        <View style={[ligne, { flexWrap: 'wrap' }]}>
          <Text style={[titreCarte, { marginBottom: 0 }]}>Mois par mois · {annee}</Text>
          <Puces>
            {(Object.keys(MESURES) as Mesure[]).map((m) => (
              <Puce key={m} libelle={MESURES[m]} actif={mesure === m} onPress={() => setMesure(m)} />
            ))}
          </Puces>
        </View>
        <Barres
          points={parMois}
          mesure={mesure}
          choisi={mois}
          libelle={(p) => nomMois(p.cle, true).replace('.', '')}
          onChoisir={(cle) => cle <= moisDe(maintenant) && setMois(cle)}
        />
        <Text style={doux}>
          Total {annee} : {lisible(parMois.reduce((s, p) => s + valeurDe(p, mesure), 0), mesure)}
          {mesure === 'clients' ? ' (un client vu plusieurs mois compte chaque mois)' : ''}. Touche un mois pour voir son bilan.
        </Text>
      </Carte>

      <Carte style={{ padding: 20, gap: 16 }}>
        <Text style={[titreCarte, { marginBottom: 0 }]}>Année par année · {MESURES[mesure].toLowerCase()}</Text>
        <Barres
          points={parAn}
          mesure={mesure}
          choisi={String(annee)}
          libelle={(p) => p.cle}
          onChoisir={(cle) => setMois(cle === String(maintenant.getFullYear()) ? moisDe(maintenant) : `${cle}-12`)}
        />
        {parAn.length > 1 && (
          <Text style={doux}>
            {(() => {
              const [a, b] = parAn.slice(-2);
              const e = ecart(valeurDe(b, mesure), valeurDe(a, mesure));
              return e === null ? '' : `${b.cle} : ${evolution(e, a.cle)}${b.cle === String(maintenant.getFullYear()) ? ' (année en cours, pas encore terminée)' : ''}.`;
            })()}
          </Text>
        )}
      </Carte>

      {tuile && (
        <DetailTuile
          tuile={tuile}
          mois={mois}
          donnees={d}
          onFermer={() => setTuile(undefined)}
          onPaiements={
            onPaiements &&
            (() => {
              setTuile(undefined);
              onPaiements();
            })
          }
          onOuvrirPaiement={(id) => {
            setTuile(undefined);
            onOuvrirPaiement(id);
          }}
          onOuvrirContact={(id) => {
            setTuile(undefined);
            onOuvrirContact(id);
          }}
        />
      )}
    </View>
  );
}

const TITRES: Record<Tuile, string> = {
  encaisse: 'Encaissé',
  aEncaisser: 'À encaisser',
  abonnements: 'Abonnements réglés',
  packs: 'Packs vendus',
  seances: 'Séances réalisées',
  clients: 'Clients vus',
  nouveaux: 'Nouveaux clients',
  manquees: 'Absences et annulations tardives',
};
const VIDES: Record<Tuile, string> = {
  encaisse: 'Aucun paiement réglé ce mois-ci.',
  aEncaisser: 'Rien à encaisser ce mois-ci.',
  abonnements: 'Aucun abonnement réglé ce mois-ci.',
  packs: 'Aucun pack vendu ce mois-ci.',
  seances: 'Aucune séance réalisée ce mois-ci.',
  clients: 'Aucun client vu en séance ce mois-ci.',
  nouveaux: 'Aucun nouveau client ce mois-ci.',
  manquees: 'Aucune absence ni annulation tardive ce mois-ci.',
};

const jourHeure = (iso: string) =>
  new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const jour = (date?: string) => (date ? new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : 'Sans date');

/** Ce qu'il y a derrière une tuile : les paiements, les séances ou les clients du mois. Un paiement ouvre sa fiche, un client la sienne. */
function DetailTuile({
  tuile,
  mois,
  donnees,
  onFermer,
  onPaiements,
  onOuvrirPaiement,
  onOuvrirContact,
}: {
  tuile: Tuile;
  mois: Mois;
  donnees: Donnees;
  onFermer: () => void;
  onPaiements?: () => void;
  onOuvrirPaiement: (id: string) => void;
  onOuvrirContact: (id: string) => void;
}) {
  const detail = detailDuMois(donnees, mois);
  const contacts = new Map(donnees.contacts.map((x) => [x.id, `${x.prenom} ${x.nom}`.trim()]));
  const parClient = new Map(donnees.contacts.filter((x) => x.clientId).map((x) => [x.clientId!, x.id]));
  const titre = `${TITRES[tuile]} · ${nomMois(mois)}`;

  const paiements: Paiement[] | undefined =
    tuile === 'encaisse' ? detail.encaisse : tuile === 'aEncaisser' ? detail.aEncaisser : tuile === 'abonnements' ? detail.abonnements : tuile === 'packs' ? detail.packs : undefined;
  const seances = tuile === 'seances' ? detail.seances : tuile === 'manquees' ? detail.manquees : undefined;
  const personnes = tuile === 'clients' ? detail.clients : tuile === 'nouveaux' ? detail.nouveaux : undefined;
  const nombreLignes = (paiements ?? seances ?? personnes ?? []).length;

  return (
    <Modale titre={titre} onFermer={onFermer}>
      {nombreLignes === 0 && <Text style={doux}>{VIDES[tuile]}</Text>}

      {paiements?.map((p, i, l) => (
        <Ligne key={p.id} dernier={i === l.length - 1} onPress={() => onOuvrirPaiement(p.id)} libelle={`Ouvrir le paiement ${p.titre}`}>
          <View style={{ flexShrink: 1 }}>
            <Text style={texte} numberOfLines={2}>
              {(p.contactId && contacts.get(p.contactId)) || p.titre}
            </Text>
            <Text style={doux} numberOfLines={2}>
              {jour(p.date)}
              {p.contactId && contacts.get(p.contactId) ? ` · ${p.titre}` : ''}
              {p.moyen ? ` · ${p.moyen}` : ''}
            </Text>
          </View>
          <Text style={[texte, { fontFamily: polices.texteGras }]}>{p.montant === 0 ? 'Offert' : montantLisible(p.montant)}</Text>
        </Ligne>
      ))}
      {paiements && paiements.length > 0 && (
        <Text style={[doux, { marginTop: 4 }]}>
          Total : {montantLisible(Math.round(paiements.reduce((s, p) => s + (p.montant ?? 0), 0) * 100) / 100)}. Touche un paiement pour l’ouvrir.
        </Text>
      )}

      {seances?.map((r, i, l) => {
        const seul = r.participants.length === 1 ? parClient.get(r.participants[0].clientId) : undefined;
        const noms = r.participants.map((x) => (parClient.get(x.clientId) && contacts.get(parClient.get(x.clientId)!)) || `${x.prenom} ${x.nom}`.trim()).join(', ');
        return (
          <Ligne key={r.id} dernier={i === l.length - 1} onPress={seul ? () => onOuvrirContact(seul) : undefined} libelle={`Ouvrir la fiche de ${noms}`}>
            <View style={{ flexShrink: 1 }}>
              <Text style={texte} numberOfLines={2}>
                {noms || 'Séance'}
              </Text>
              <Text style={doux}>
                {jourHeure(r.debut)}
                {r.type === 'visio' ? ' · visio' : ''}
              </Text>
            </View>
            {tuile === 'manquees' && <Text style={doux}>{r.statut === 'absent' ? 'Absent' : 'Annulée tard'}</Text>}
          </Ligne>
        );
      })}

      {personnes?.map((x, i, l) => (
        <Ligne
          key={x.cle}
          dernier={i === l.length - 1}
          onPress={x.contactId ? () => onOuvrirContact(x.contactId!) : undefined}
          libelle={`Ouvrir la fiche de ${x.nom}`}
        >
          <View style={{ flexShrink: 1 }}>
            <Text style={texte} numberOfLines={2}>
              {x.nom}
            </Text>
            <Text style={doux}>{x.seances ? `${x.seances} séance${x.seances > 1 ? 's' : ''}` : 'Pas de séance ce mois-ci'}</Text>
          </View>
          <Text style={[texte, { fontFamily: polices.texteGras }]}>{x.montant ? montantLisible(x.montant) : '—'}</Text>
        </Ligne>
      ))}

      {onPaiements && paiements && (
        <Pressable accessibilityRole="button" onPress={onPaiements} style={{ paddingVertical: 10 }}>
          <Text style={[texte, { color: couleurs.rouge, fontFamily: polices.texteGras }]}>Voir tous les paiements</Text>
        </Pressable>
      )}
    </Modale>
  );
}

function Ligne({ children, dernier, onPress, libelle }: { children: ReactNode; dernier: boolean; onPress?: () => void; libelle: string }) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? libelle : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [ligne, { paddingVertical: 12, opacity: pressed ? 0.6 : 1 }, !dernier && bordure]}
    >
      {children}
      {onPress && <ChevronRight size={16} color={couleurs.texteDoux} />}
    </Pressable>
  );
}

function Fleche({ sens, onPress, desactive }: { sens: 'avant' | 'apres'; onPress: () => void; desactive?: boolean }) {
  const Icone = sens === 'avant' ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sens === 'avant' ? 'Mois précédent' : 'Mois suivant'}
      accessibilityState={{ disabled: desactive }}
      disabled={desactive}
      onPress={onPress}
      style={{ width: 44, height: 44, borderRadius: 999, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.carte, alignItems: 'center', justifyContent: 'center', opacity: desactive ? 0.35 : 1 }}
    >
      <Icone size={20} color={couleurs.texte} />
    </Pressable>
  );
}

function Jauge({ part }: { part: number }) {
  return (
    <View style={{ height: 6, borderRadius: 999, backgroundColor: couleurs.discret, overflow: 'hidden' }}>
      <View style={{ width: `${Math.max(2, Math.round(part * 100))}%`, height: '100%', backgroundColor: couleurs.rouge, borderRadius: 999 }} />
    </View>
  );
}

/** Histogramme : une barre par mois ou par année ; la barre choisie est en rouge, sa valeur au-dessus. */
function Barres({
  points,
  mesure,
  choisi,
  libelle,
  onChoisir,
}: {
  points: Point[];
  mesure: Mesure;
  choisi: string;
  libelle: (p: Point) => string;
  onChoisir: (cle: string) => void;
}) {
  const hauteur = 150;
  const max = Math.max(...points.map((p) => valeurDe(p, mesure)), 0);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: hauteur + 44 }}>
      {points.map((p) => {
        const v = valeurDe(p, mesure);
        const actif = p.cle === choisi;
        return (
          <Pressable
            key={p.cle}
            accessibilityRole="button"
            accessibilityLabel={`${libelle(p)} : ${lisible(v, mesure)}`}
            onPress={() => onChoisir(p.cle)}
            style={{ flex: 1, maxWidth: 72, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}
          >
            <Text numberOfLines={1} style={{ fontFamily: actif ? polices.texteGras : polices.texte, fontSize: 10, color: actif ? couleurs.rouge : couleurs.texteDoux, marginBottom: 4 }}>
              {v ? (mesure === 'encaisse' && v >= 1000 ? `${nombre(Math.round(v / 100) / 10)} k` : lisible(v, mesure).replace(/\s?€/, '')) : ''}
            </Text>
            <View
              style={{
                width: '78%',
                height: max ? Math.max(v ? 4 : 2, (v / max) * hauteur) : 2,
                borderTopLeftRadius: 4,
                borderTopRightRadius: 4,
                backgroundColor: actif ? couleurs.rouge : v ? couleurs.secondaire : couleurs.bordure,
                opacity: actif || !v ? 1 : 0.55,
              }}
            />
            <Text numberOfLines={1} style={{ fontFamily: actif ? polices.texteGras : polices.texte, fontSize: 11, color: actif ? couleurs.texte : couleurs.texteDoux, marginTop: 6 }}>
              {libelle(p)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const titreCarte = { fontSize: 16, fontFamily: polices.texteGras, color: couleurs.texte, marginBottom: 12 } as const;
const ligne = { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 } as const;
const bordure = { borderBottomWidth: 1, borderBottomColor: couleurs.bordure } as const;
const texte = { fontSize: 14, fontFamily: polices.texte, color: couleurs.texte } as const;
const doux = { fontSize: 13, fontFamily: polices.texte, color: couleurs.texteDoux } as const;
