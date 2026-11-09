// Agenda du coach : vues Jour, Semaine et Mois (sur téléphone comme sur ordinateur), création d'un rendez-vous en touchant
// un créneau, alertes « fin de pack » et « client inactif », réglages de l'agenda.
import { CalendarPlus, ChevronLeft, ChevronRight, Settings, Zap } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { depot } from '@/data';
import { abonnements } from '@/data/abonnements';
import { agenda, retenirClientsDemo } from '@/data/agenda';
import { crm, ecouterCrm } from '@/data/crm';
import {
  ajouterJours,
  boostersDansPeriode,
  cleJour,
  clientsInactifs,
  grilleMois,
  heureDe,
  lundiDe,
  nomsParticipants,
  occupe,
  packsBientotFinis,
  surLeJour,
  TYPES_RDV,
  type BoosterAgenda,
  type ReglagesAgenda,
  type RendezVous,
} from '@/domain/agenda';
import { soldeSeances } from '@/domain/abonnements';
import type { Occupation } from '@/domain/agenda-google';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { BoutonContour, Vide } from '../coque';
import { Carte, Chargement, Erreur, Puce, Puces, SousTitre, Texte } from '../composants';
import { nomComplet } from '../crm/commun';
import { CaseACocher, Saisie } from '../crm/dossier';
import { EditeurBoosterModale } from '../crm/editeur-booster';
import { ConfirmerSuppression } from '../crm/suppression';
import { couleurs, espace, LARGEUR_LARGE, polices } from '../theme';

import { COULEURS_STATUT, jourCourt, jourLong, majuscule, PastilleStatutRdv } from './commun';
import { EditeurRendezVous, type ClientAgenda } from './editeur-rdv';
import { GoogleAgenda } from './google';

type Vue = 'jour' | 'semaine' | 'mois';
const HAUTEUR_HEURE = 52;

/** Période affichée : [début, fin[ en heure locale. */
function periode(vue: Vue, date: Date) {
  if (vue === 'jour') {
    const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return { du: d, au: ajouterJours(d, 1) };
  }
  if (vue === 'semaine') {
    const d = lundiDe(date);
    return { du: d, au: ajouterJours(d, 7) };
  }
  const jours = grilleMois(date);
  return { du: jours[0], au: ajouterJours(jours.at(-1)!, 1) };
}

function titrePeriode(vue: Vue, date: Date) {
  if (vue === 'jour') return jourLong(cleJour(date));
  if (vue === 'mois') return date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const { du } = periode('semaine', date);
  const fin = ajouterJours(du, 6);
  const memeMois = du.getMonth() === fin.getMonth();
  const mois = (d: Date) => d.toLocaleDateString('fr-FR', { month: 'short' });
  return memeMois ? `${du.getDate()} – ${fin.getDate()} ${mois(fin)}` : `${du.getDate()} ${mois(du)} – ${fin.getDate()} ${mois(fin)}`;
}

/**
 * Réglages de l'agenda et Google Agenda : rangés dans Mon profil ; « Réglages » de l'agenda y mène.
 * Sur l'accueil (`accueil`) : même agenda, ouvert sur le jour, sans Réglages ni alertes, pour rester court.
 */
export function AgendaCoach({ coachId, onReglages, accueil }: { coachId: string; onReglages?: () => void; accueil?: boolean }) {
  const { width } = useWindowDimensions();
  const large = width >= LARGEUR_LARGE;
  const [vue, setVue] = useState<Vue>(large && !accueil ? 'semaine' : 'jour');
  const [date, setDate] = useState(() => new Date());
  const [edition, setEdition] = useState<{ rdv?: RendezVous; jour?: string; heure?: string; clientId?: string }>();
  const [boosterOuvert, setBoosterOuvert] = useState<BoosterAgenda>();

  const { du, au } = periode(vue, date);
  const clients = useCharger(async () => {
    const liste = await depot.clientsDuCoach(coachId);
    retenirClientsDemo(liste);
    return liste;
  }, `agenda-clients-${coachId}`);
  const reglages = useCharger(() => agenda.reglages(), 'agenda-reglages');
  const rdv = useCharger(() => agenda.rendezVous(du.toISOString(), au.toISOString()), `agenda-${vue}-${cleJour(du)}`);
  const perso = useCharger(() => agenda.occupations(du.toISOString(), au.toISOString()), `agenda-perso-${vue}-${cleJour(du)}`);
  const alertes = useAlertes(clients.donnee, reglages.donnee);
  const boosters = useBoosters();

  const recharger = useCallback(() => {
    rdv.recharger();
    perso.recharger();
    alertes.recharger();
  }, [rdv, perso, alertes]);

  const deplacer = (sens: 1 | -1) =>
    setDate((d) => (vue === 'jour' ? ajouterJours(d, sens) : vue === 'semaine' ? ajouterJours(d, 7 * sens) : new Date(d.getFullYear(), d.getMonth() + sens, 1)));
  const ouvrirJour = (d: Date) => {
    setDate(d);
    setVue('jour');
  };
  const nouveau = (jour?: string, heure?: string, clientId?: string) => setEdition({ jour: jour ?? cleJour(vue === 'semaine' && !jour ? (cleJour(lundiDe(new Date())) === cleJour(lundiDe(date)) ? new Date() : lundiDe(date)) : date), heure, clientId });

  const liste = rdv.donnee ?? [];
  const occupations = perso.donnee ?? [];
  const lesBoosters = boostersDansPeriode(boosters.donnee ?? [], du, au);
  const ouvrirBooster = (b: BoosterAgenda) => setBoosterOuvert(b);
  const jours = vue === 'mois' ? grilleMois(date) : vue === 'semaine' ? Array.from({ length: 7 }, (_, i) => ajouterJours(du, i)) : [du];
  const duJour = (d: Date) => liste.filter((r) => cleJour(r.debut) === cleJour(d));

  return (
    <View style={{ gap: espace(4) }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: espace(3) }}>
        <Puces>
          <Puce libelle="Jour" actif={vue === 'jour'} onPress={() => setVue('jour')} />
          <Puce libelle="Semaine" actif={vue === 'semaine'} onPress={() => setVue('semaine')} />
          <Puce libelle="Mois" actif={vue === 'mois'} onPress={() => setVue('mois')} />
        </Puces>
        <View style={{ flexDirection: 'row', gap: espace(2) }}>
          {onReglages && !accueil && <BoutonContour libelle="Réglages" icone={Settings} iconeAGauche onPress={onReglages} />}
          <BoutonContour libelle={accueil ? 'RDV' : 'Rendez-vous'} icone={CalendarPlus} iconeAGauche onPress={() => nouveau()} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espace(2) }}>
        <Fleche nom="Période précédente" gauche onPress={() => deplacer(-1)} />
        <Text style={{ flex: 1, textAlign: 'center', fontFamily: polices.texteGras, fontSize: 17, color: couleurs.texte,  }}>
          {majuscule(titrePeriode(vue, date))}
        </Text>
        <Fleche nom="Période suivante" onPress={() => deplacer(1)} />
        <Pressable accessibilityRole="button" onPress={() => setDate(new Date())} style={{ paddingHorizontal: espace(3), paddingVertical: espace(2), borderRadius: 10, borderWidth: 1, borderColor: couleurs.bordure, backgroundColor: couleurs.carte }}>
          <Text style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.texte }}>Aujourd’hui</Text>
        </Pressable>
      </View>


      {rdv.erreur && <Erreur message={rdv.erreur} onReessayer={rdv.recharger} />}
      {!rdv.donnee && !rdv.erreur && <Chargement />}
      {rdv.donnee &&
        (vue === 'jour' ? (
          <VueJour rdv={duJour(du)} perso={surLeJour(occupations, du)} boosters={lesBoosters} onOuvrir={(r) => setEdition({ rdv: r })} onBooster={ouvrirBooster} onNouveau={() => nouveau(cleJour(du))} />
        ) : vue === 'semaine' ? (
          large ? (
            <GrilleSemaine jours={jours} rdv={liste} perso={occupations} boosters={lesBoosters} onOuvrir={(r) => setEdition({ rdv: r })} onBooster={ouvrirBooster} onCreneau={(j, h) => nouveau(j, h)} onJour={ouvrirJour} />
          ) : (
            <ListeSemaine jours={jours} rdv={liste} perso={occupations} boosters={lesBoosters} onOuvrir={(r) => setEdition({ rdv: r })} onBooster={ouvrirBooster} onJour={ouvrirJour} onNouveau={(j) => nouveau(j)} />
          )
        ) : (
          <GrilleMois jours={jours} mois={date.getMonth()} rdv={liste} perso={occupations} boosters={lesBoosters} large={large} onJour={ouvrirJour} />
        ))}

      {!accueil && <AlertesAgenda alertes={alertes} onProposer={(clientId) => nouveau(undefined, undefined, clientId)} />}

      {edition && clients.donnee && reglages.donnee && (
        <EditeurRendezVous
          key={edition.rdv?.id ?? 'nouveau'}
          rdv={edition.rdv}
          creneau={edition.rdv ? undefined : { jour: edition.jour ?? cleJour(new Date()), heure: edition.heure ?? '18:00' }}
          clientInitial={edition.clientId}
          clients={clients.donnee as ClientAgenda[]}
          reglages={reglages.donnee}
          onFermer={() => setEdition(undefined)}
          onEnregistre={() => {
            setEdition(undefined);
            recharger();
          }}
        />
      )}

      <BoosterDepuisAgenda booster={boosterOuvert} onFermer={() => setBoosterOuvert(undefined)} />
    </View>
  );
}

/** Tous les Boosters du coach ; rechargés quand le CRM change (création, nouvelle date, suppression). */
function useBoosters() {
  const boosters = useCharger(() => crm.boosters().catch(() => []), 'agenda-boosters');
  useRechargerSur(boosters.recharger, ecouterCrm);
  return boosters;
}

/** Un Booster touché dans l'agenda s'ouvre dans son éditeur, sans quitter l'agenda. */
function BoosterDepuisAgenda({ booster, onFermer }: { booster?: BoosterAgenda; onFermer: () => void }) {
  const [suppression, setSuppression] = useState<{ booster: { id: string; nom?: string }; contact: { prenom: string; nom: string } }>();
  return (
    <>
      {booster && !suppression && <EditeurBoosterModale key={booster.id} boosterId={booster.id} contactId={booster.contactId} onFermer={onFermer} onSupprimer={(booster, contact) => setSuppression({ booster, contact })} />}
      {suppression && (
        <ConfirmerSuppression
          quoi="ce Booster"
          nom={suppression.booster.nom || 'Booster'}
          contact={nomComplet(suppression.contact)}
          onSupprimer={async () => {
            await crm.supprimerBooster(suppression.booster.id);
            onFermer();
          }}
          onFermer={() => setSuppression(undefined)}
        />
      )}
    </>
  );
}

/** Accueil du coach : ses rendez-vous et ses événements Google du jour ; un appui ouvre l'agenda. */
export function AgendaDuJour({ onOuvrirAgenda }: { onOuvrirAgenda: () => void }) {
  const [jour] = useState(() => new Date(new Date().setHours(0, 0, 0, 0)));
  const du = jour.toISOString();
  const au = ajouterJours(jour, 1).toISOString();
  const rdv = useCharger(() => agenda.rendezVous(du, au), `accueil-agenda-${cleJour(jour)}`);
  const perso = useCharger(() => agenda.occupations(du, au).catch(() => [] as Occupation[]), `accueil-perso-${cleJour(jour)}`);
  const boosters = useBoosters();
  const [boosterOuvert, setBoosterOuvert] = useState<BoosterAgenda>();
  const duJour = (rdv.donnee ?? []).filter((r) => cleJour(r.debut) === cleJour(jour) && r.statut !== 'annule' && r.statut !== 'refuse');
  const occupations = surLeJour(perso.donnee ?? [], jour);
  const boostersDuJour = boostersDansPeriode(boosters.donnee ?? [], jour, ajouterJours(jour, 1));
  return (
    <Carte style={{ padding: 20, gap: espace(2) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espace(3) }}>
        <View style={{ flexShrink: 1 }}>
          <Text style={{ fontSize: 16, fontFamily: polices.texteGras, color: couleurs.texte }}>Aujourd’hui</Text>
          <Text style={{ fontSize: 13, fontFamily: polices.texte, color: couleurs.texteDoux }}>{majuscule(jourLong(cleJour(jour)))}</Text>
        </View>
        <BoutonContour libelle="Agenda" icone={ChevronRight} onPress={onOuvrirAgenda} />
      </View>
      {rdv.erreur && <Erreur message={rdv.erreur} onReessayer={rdv.recharger} />}
      {!rdv.donnee && !rdv.erreur && <Chargement />}
      {rdv.donnee && !duJour.length && !occupations.length && !boostersDuJour.length && (
        <Text style={{ fontSize: 13, fontFamily: polices.texte, color: couleurs.texteDoux }}>Aucun rendez-vous aujourd’hui.</Text>
      )}
      {rdv.donnee && <JourMele rdv={duJour} perso={occupations} boosters={boostersDuJour} onOuvrir={onOuvrirAgenda} onBooster={setBoosterOuvert} />}
      <BoosterDepuisAgenda booster={boosterOuvert} onFermer={() => setBoosterOuvert(undefined)} />
    </Carte>
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

/** Une ligne de rendez-vous : heure, personnes, type et lieu, statut. */
function CarteRdv({ r, onPress, compacte }: { r: RendezVous; onPress: () => void; compacte?: boolean }) {
  const barre = occupe(r) ? COULEURS_STATUT[r.statut].texte : couleurs.suggestion;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: espace(3),
        padding: compacte ? espace(2) : espace(3),
        borderRadius: 12,
        borderWidth: 1,
        borderColor: couleurs.bordure,
        borderLeftWidth: 4,
        borderLeftColor: barre,
        backgroundColor: couleurs.carte,
        opacity: pressed ? 0.85 : occupe(r) ? 1 : 0.6,
      })}
    >
      <Text style={{ fontFamily: polices.chiffres, fontSize: 13, color: couleurs.texte, minWidth: 44 }}>{heureDe(r.debut)}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte, textDecorationLine: occupe(r) ? 'none' : 'line-through' }} numberOfLines={1}>
          {nomsParticipants(r)}
        </Text>
        {!compacte && (
          <Text style={{ fontFamily: polices.texte, fontSize: 13, color: couleurs.texteDoux }} numberOfLines={1}>
            {TYPES_RDV[r.type]} · {heureDe(r.debut)}–{heureDe(r.fin)}
            {r.lieu ? ` · ${r.lieu}` : ''}
          </Text>
        )}
        <PastilleStatutRdv statut={r.statut} />
      </View>
    </Pressable>
  );
}

/** Événement perso du Google Agenda : en gris, pour information. */
function CartePerso({ o }: { o: Occupation }) {
  return (
    <View
      accessibilityLabel={`Occupé dans Google Agenda : ${o.titre}`}
      style={{ flexDirection: 'row', gap: espace(3), padding: espace(2), borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: couleurs.bordure, backgroundColor: couleurs.discret }}
    >
      <Text style={{ fontFamily: polices.chiffres, fontSize: 13, color: couleurs.texteDoux, minWidth: 44 }}>{o.journee ? 'Jour' : heureDe(o.debut)}</Text>
      <Text style={{ flex: 1, fontFamily: polices.texte, fontSize: 14, color: couleurs.texteDoux }} numberOfLines={1}>
        {o.titre}
        {o.journee ? '' : ` · ${heureDe(o.debut)}–${heureDe(o.fin)}`} · Google
      </Text>
    </View>
  );
}

/** Booster du CRM : barre et fond rouges, pour le distinguer d'un rendez-vous. */
function CarteBooster({ b, onPress, compacte }: { b: BoosterAgenda; onPress: () => void; compacte?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${b.titre}, ${heureDe(b.debut)}${b.fait ? ', fait' : ''}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        gap: espace(3),
        padding: compacte ? espace(2) : espace(3),
        borderRadius: 12,
        borderWidth: 1,
        borderColor: couleurs.bordure,
        borderLeftWidth: 4,
        borderLeftColor: couleurs.rouge,
        backgroundColor: couleurs.rougeClair,
        opacity: pressed ? 0.85 : b.fait ? 0.7 : 1,
      })}
    >
      <Text style={{ fontFamily: polices.chiffres, fontSize: 13, color: couleurs.texte, minWidth: 44 }}>{heureDe(b.debut)}</Text>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontFamily: polices.texteGras, fontSize: 15, color: couleurs.texte }} numberOfLines={1}>
          {b.titre}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Zap size={12} color={couleurs.rougeTexte} />
          <Text style={{ fontFamily: polices.texteMoyen, fontSize: 12, color: couleurs.rougeTexte }}>{b.fait ? 'Booster fait' : 'Booster'}</Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Rendez-vous, Boosters et événements perso d'une journée, dans l'ordre de l'heure. */
function JourMele({
  rdv,
  perso,
  boosters = [],
  compacte,
  onOuvrir,
  onBooster,
}: {
  rdv: RendezVous[];
  perso: Occupation[];
  boosters?: BoosterAgenda[];
  compacte?: boolean;
  onOuvrir: (r: RendezVous) => void;
  onBooster?: (b: BoosterAgenda) => void;
}) {
  const elements = [
    ...rdv.map((r) => ({ debut: r.debut, r })),
    ...boosters.map((b) => ({ debut: b.debut, b })),
    ...perso.map((o) => ({ debut: o.journee ? '' : o.debut, o })),
  ].sort((a, b) => a.debut.localeCompare(b.debut));
  return (
    <>
      {elements.map((e) =>
        'r' in e ? (
          <CarteRdv key={e.r.id} r={e.r} compacte={compacte} onPress={() => onOuvrir(e.r)} />
        ) : 'b' in e ? (
          <CarteBooster key={`b-${e.b.id}`} b={e.b} compacte={compacte} onPress={() => onBooster?.(e.b)} />
        ) : (
          <CartePerso key={`g-${e.o.id}`} o={e.o} />
        ),
      )}
    </>
  );
}

function VueJour({
  rdv,
  perso,
  boosters,
  onOuvrir,
  onBooster,
  onNouveau,
}: {
  rdv: RendezVous[];
  perso: Occupation[];
  boosters: BoosterAgenda[];
  onOuvrir: (r: RendezVous) => void;
  onBooster: (b: BoosterAgenda) => void;
  onNouveau: () => void;
}) {
  if (!rdv.length && !perso.length && !boosters.length)
    return (
      <Vide titre="Aucun rendez-vous ce jour-là" texte="Touche « Rendez-vous » pour en poser un.">
        <BoutonContour libelle="Ajouter un rendez-vous" icone={CalendarPlus} iconeAGauche onPress={onNouveau} />
      </Vide>
    );
  return (
    <View style={{ gap: espace(2) }}>
      <JourMele rdv={rdv} perso={perso} boosters={boosters} onOuvrir={onOuvrir} onBooster={onBooster} />
      {!rdv.length && (
        <BoutonContour libelle="Ajouter un rendez-vous" icone={CalendarPlus} iconeAGauche onPress={onNouveau} />
      )}
    </View>
  );
}

/** Téléphone : les sept jours l'un sous l'autre, avec leurs rendez-vous. */
function ListeSemaine({
  jours,
  rdv,
  perso,
  boosters,
  onOuvrir,
  onBooster,
  onJour,
  onNouveau,
}: {
  jours: Date[];
  rdv: RendezVous[];
  perso: Occupation[];
  boosters: BoosterAgenda[];
  onOuvrir: (r: RendezVous) => void;
  onBooster: (b: BoosterAgenda) => void;
  onJour: (d: Date) => void;
  onNouveau: (jour: string) => void;
}) {
  const aujourdhui = cleJour(new Date());
  return (
    <View style={{ gap: espace(3) }}>
      {jours.map((d) => {
        const siens = rdv.filter((r) => cleJour(r.debut) === cleJour(d));
        const occupes = surLeJour(perso, d);
        const sesBoosters = boosters.filter((b) => cleJour(b.debut) === cleJour(d));
        return (
          <View key={cleJour(d)} style={{ gap: espace(2) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pressable accessibilityRole="button" onPress={() => onJour(d)}>
                <Text style={{ fontFamily: polices.texteGras, fontSize: 14, color: cleJour(d) === aujourdhui ? couleurs.rouge : couleurs.texte }}>
                  {majuscule(jourLong(cleJour(d)))}
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`Ajouter un rendez-vous le ${jourLong(cleJour(d))}`} onPress={() => onNouveau(cleJour(d))} hitSlop={8}>
                <CalendarPlus size={18} color={couleurs.texteDoux} />
              </Pressable>
            </View>
            {siens.length || occupes.length || sesBoosters.length ? (
              <JourMele rdv={siens} perso={occupes} boosters={sesBoosters} compacte onOuvrir={onOuvrir} onBooster={onBooster} />
            ) : (
              <Text style={{ fontFamily: polices.texte, fontSize: 13, color: couleurs.suggestion }}>Libre</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** Ordinateur : grille horaire de la semaine ; toucher une case vide crée un rendez-vous à cette heure. */
function GrilleSemaine({
  jours,
  rdv,
  perso,
  boosters,
  onOuvrir,
  onBooster,
  onCreneau,
  onJour,
}: {
  jours: Date[];
  rdv: RendezVous[];
  perso: Occupation[];
  boosters: BoosterAgenda[];
  onOuvrir: (r: RendezVous) => void;
  onBooster: (b: BoosterAgenda) => void;
  onCreneau: (jour: string, heure: string) => void;
  onJour: (d: Date) => void;
}) {
  const blocs = [...rdv, ...boosters];
  const debut = Math.min(7, ...blocs.map((r) => new Date(r.debut).getHours()));
  const fin = Math.max(21, ...blocs.map((r) => new Date(r.fin).getHours() + 1));
  const plage = Array.from({ length: fin - debut }, (_, i) => debut + i);
  const aujourdhui = cleJour(new Date());
  return (
    <View style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 14, backgroundColor: couleurs.carte, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: couleurs.bordure }}>
        <View style={{ width: 52 }} />
        {jours.map((d) => (
          <Pressable key={cleJour(d)} accessibilityRole="button" onPress={() => onJour(d)} style={{ flex: 1, paddingVertical: espace(2), alignItems: 'center' }}>
            <Text style={{ fontFamily: polices.texteGras, fontSize: 13, color: cleJour(d) === aujourdhui ? couleurs.rouge : couleurs.texte, textTransform: 'capitalize' }}>
              {jourCourt(d)}
            </Text>
            {surLeJour(perso, d)
              .filter((o) => o.journee)
              .slice(0, 2)
              .map((o) => (
                <Text key={o.id} numberOfLines={1} style={{ fontFamily: polices.texte, fontSize: 11, color: couleurs.texteDoux, paddingHorizontal: 4 }}>
                  {o.titre}
                </Text>
              ))}
          </Pressable>
        ))}
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 52 }}>
          {plage.map((h) => (
            <Text key={h} style={{ height: HAUTEUR_HEURE, fontFamily: polices.chiffres, fontSize: 11, color: couleurs.texteDoux, textAlign: 'right', paddingRight: 6, paddingTop: 2 }}>
              {String(h).padStart(2, '0')}:00
            </Text>
          ))}
        </View>
        {jours.map((d) => {
          const siens = rdv.filter((r) => cleJour(r.debut) === cleJour(d));
          const occupes = surLeJour(perso, d).filter((o) => !o.journee);
          const sesBoosters = boosters.filter((b) => cleJour(b.debut) === cleJour(d));
          const jourMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
          return (
            <View key={cleJour(d)} style={{ flex: 1, borderLeftWidth: 1, borderLeftColor: couleurs.bordure }}>
              {plage.map((h) => (
                <Pressable
                  key={h}
                  accessibilityRole="button"
                  accessibilityLabel={`Nouveau rendez-vous ${jourLong(cleJour(d))} à ${h} h`}
                  onPress={() => onCreneau(cleJour(d), `${String(h).padStart(2, '0')}:00`)}
                  style={({ pressed }) => ({ height: HAUTEUR_HEURE, borderTopWidth: 1, borderTopColor: couleurs.discret, backgroundColor: pressed ? couleurs.rougeClair : 'transparent' })}
                />
              ))}
              {occupes.map((o) => {
                // Bornes ramenées à la journée et à la plage horaire affichée.
                const h0 = Math.max(debut, (new Date(o.debut).getTime() - jourMs) / 3_600_000);
                const h1 = Math.min(fin, (new Date(o.fin).getTime() - jourMs) / 3_600_000);
                if (h1 <= h0) return null;
                return (
                  <View
                    key={`g-${o.id}`}
                    pointerEvents="none"
                    accessibilityLabel={`Occupé dans Google Agenda : ${o.titre}`}
                    style={{
                      position: 'absolute',
                      top: (h0 - debut) * HAUTEUR_HEURE,
                      left: 2,
                      right: 2,
                      height: Math.max(18, (h1 - h0) * HAUTEUR_HEURE - 2),
                      borderRadius: 8,
                      padding: 4,
                      backgroundColor: couleurs.discret,
                      borderWidth: 1,
                      borderStyle: 'dashed',
                      borderColor: couleurs.bordure,
                      overflow: 'hidden',
                    }}
                  >
                    <Text style={{ fontFamily: polices.texte, fontSize: 11, color: couleurs.texteDoux }} numberOfLines={2}>
                      {o.titre}
                    </Text>
                  </View>
                );
              })}
              {siens.map((r) => {
                const dd = new Date(r.debut);
                const top = (dd.getHours() - debut + dd.getMinutes() / 60) * HAUTEUR_HEURE;
                const hauteur = Math.max(24, ((new Date(r.fin).getTime() - dd.getTime()) / 3_600_000) * HAUTEUR_HEURE - 2);
                const c = COULEURS_STATUT[r.statut];
                return (
                  <Pressable
                    key={r.id}
                    accessibilityRole="button"
                    onPress={() => onOuvrir(r)}
                    style={{
                      position: 'absolute',
                      top,
                      left: 2,
                      right: 2,
                      height: hauteur,
                      borderRadius: 8,
                      padding: 4,
                      backgroundColor: c.fond,
                      borderLeftWidth: 3,
                      borderLeftColor: c.texte,
                      opacity: occupe(r) ? 1 : 0.55,
                      overflow: 'hidden',
                    }}
                  >
                    <Text style={{ fontFamily: polices.texteGras, fontSize: 12, color: couleurs.texte }} numberOfLines={hauteur > 40 ? 2 : 1}>
                      {heureDe(r.debut)} {nomsParticipants(r)}
                    </Text>
                    {hauteur > 40 && (
                      <Text style={{ fontFamily: polices.texte, fontSize: 11, color: c.texte }} numberOfLines={1}>
                        {TYPES_RDV[r.type]}
                        {r.lieu ? ` · ${r.lieu}` : ''}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
              {sesBoosters.map((b) => {
                const dd = new Date(b.debut);
                const top = (dd.getHours() - debut + dd.getMinutes() / 60) * HAUTEUR_HEURE;
                const hauteur = Math.max(24, ((new Date(b.fin).getTime() - dd.getTime()) / 3_600_000) * HAUTEUR_HEURE - 2);
                return (
                  <Pressable
                    key={`b-${b.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${b.titre}, ${heureDe(b.debut)}`}
                    onPress={() => onBooster(b)}
                    style={{
                      position: 'absolute',
                      top,
                      left: 2,
                      right: 2,
                      height: hauteur,
                      borderRadius: 8,
                      padding: 4,
                      backgroundColor: couleurs.rougeClair,
                      borderLeftWidth: 3,
                      borderLeftColor: couleurs.rouge,
                      opacity: b.fait ? 0.7 : 1,
                      overflow: 'hidden',
                    }}
                  >
                    <Text style={{ fontFamily: polices.texteGras, fontSize: 12, color: couleurs.texte }} numberOfLines={hauteur > 40 ? 2 : 1}>
                      {heureDe(b.debut)} {b.titre.replace(/^Booster · /, '')}
                    </Text>
                    {hauteur > 40 && <Text style={{ fontFamily: polices.texte, fontSize: 11, color: couleurs.rougeTexte }}>{b.fait ? 'Booster fait' : 'Booster'}</Text>}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Mois : nombre de rendez-vous par jour (prénoms sur ordinateur) ; toucher un jour l'ouvre. */
function GrilleMois({
  jours,
  mois,
  rdv,
  perso,
  boosters,
  large,
  onJour,
}: {
  jours: Date[];
  mois: number;
  rdv: RendezVous[];
  perso: Occupation[];
  boosters: BoosterAgenda[];
  large: boolean;
  onJour: (d: Date) => void;
}) {
  const aujourdhui = cleJour(new Date());
  const semaines = Array.from({ length: jours.length / 7 }, (_, i) => jours.slice(i * 7, i * 7 + 7));
  return (
    <View style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 14, backgroundColor: couleurs.carte, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row' }}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((j, i) => (
          <Text key={i} style={{ flex: 1, textAlign: 'center', paddingVertical: espace(2), fontFamily: polices.texteMoyen, fontSize: 12, color: couleurs.texteDoux }}>
            {j}
          </Text>
        ))}
      </View>
      {semaines.map((s) => (
        <View key={cleJour(s[0])} style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: couleurs.discret }}>
          {s.map((d) => {
            const siens = rdv.filter((r) => cleJour(r.debut) === cleJour(d) && occupe(r));
            const sesBoosters = boosters.filter((b) => cleJour(b.debut) === cleJour(d));
            const occupes = surLeJour(perso, d);
            const lignes = [
              ...siens.map((r) => ({ cle: r.id, debut: r.debut, texte: `${heureDe(r.debut)} ${r.participants.map((p) => p.prenom).join(', ')}`, couleur: COULEURS_STATUT[r.statut].texte })),
              ...sesBoosters.map((b) => ({ cle: `b-${b.id}`, debut: b.debut, texte: `${heureDe(b.debut)} Booster ${b.titre.replace(/^Booster · /, '')}`, couleur: couleurs.rouge })),
            ].sort((a, b) => a.debut.localeCompare(b.debut));
            const horsMois = d.getMonth() !== mois;
            return (
              <Pressable
                key={cleJour(d)}
                accessibilityRole="button"
                accessibilityLabel={`${jourLong(cleJour(d))} : ${siens.length} rendez-vous${sesBoosters.length ? `, ${sesBoosters.length} Booster` : ''}`}
                onPress={() => onJour(d)}
                style={({ pressed }) => ({
                  flex: 1,
                  minHeight: large ? 92 : 56,
                  padding: 4,
                  gap: 2,
                  borderLeftWidth: 1,
                  borderLeftColor: couleurs.discret,
                  backgroundColor: pressed ? couleurs.rougeClair : 'transparent',
                  opacity: horsMois ? 0.45 : 1,
                })}
              >
                <Text style={{ fontFamily: cleJour(d) === aujourdhui ? polices.texteGras : polices.texte, fontSize: 13, color: cleJour(d) === aujourdhui ? couleurs.rouge : couleurs.texte }}>
                  {d.getDate()}
                </Text>
                {large ? (
                  <>
                    {lignes.slice(0, 3).map((l) => (
                      <Text key={l.cle} numberOfLines={1} style={{ fontFamily: polices.texte, fontSize: 11, color: l.couleur }}>
                        {l.texte}
                      </Text>
                    ))}
                    {lignes.length > 3 && <Text style={{ fontFamily: polices.texte, fontSize: 11, color: couleurs.texteDoux }}>+{lignes.length - 3}</Text>}
                    {occupes.slice(0, lignes.length >= 3 ? 0 : 3 - lignes.length).map((o) => (
                      <Text key={`g-${o.id}`} numberOfLines={1} style={{ fontFamily: polices.texte, fontSize: 11, color: couleurs.texteDoux }}>
                        {o.journee ? '' : `${heureDe(o.debut)} `}
                        {o.titre}
                      </Text>
                    ))}
                  </>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    {siens.length > 0 && (
                      <View style={{ minWidth: 20, paddingHorizontal: 5, borderRadius: 999, backgroundColor: couleurs.rouge }}>
                        <Text style={{ fontFamily: polices.texteGras, fontSize: 11, color: '#FFFFFF', textAlign: 'center' }}>{siens.length}</Text>
                      </View>
                    )}
                    {sesBoosters.length > 0 && <Zap accessibilityLabel="Booster" size={12} color={couleurs.rouge} fill={couleurs.rouge} />}
                    {occupes.length > 0 && <View accessibilityLabel="Occupé dans Google Agenda" style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: couleurs.suggestion }} />}
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Packs bientôt finis et clients inactifs, sur l'historique récent de l'agenda. */
function useAlertes(clients: { id: string; prenom: string; nom: string; derniereSeance?: { fin: string } }[] | null, reglages: ReglagesAgenda | null) {
  const cle = clients ? clients.map((c) => c.id).join(',') : '';
  return useCharger(async () => {
    if (!clients || !reglages) return null;
    const maintenant = new Date();
    const [historique, soldes] = await Promise.all([
      agenda.rendezVous(ajouterJours(maintenant, -(reglages.inactiviteJours + 60)).toISOString(), ajouterJours(maintenant, 120).toISOString()),
      Promise.all(clients.map(async (c) => ({ clientId: c.id, prenom: `${c.prenom} ${c.nom}`.trim(), ...soldeSeances(await abonnements.packs(c.id)) }))),
    ]);
    return {
      packs: packsBientotFinis(soldes, reglages.seuilFinPack),
      inactifs: clientsInactifs(clients, historique, reglages.inactiviteJours, maintenant),
      jours: reglages.inactiviteJours,
    };
  }, `alertes-${cle}-${reglages?.seuilFinPack}-${reglages?.inactiviteJours}`);
}

function AlertesAgenda({ alertes, onProposer }: { alertes: ReturnType<typeof useAlertes>; onProposer: (clientId: string) => void }) {
  const a = alertes.donnee;
  if (!a || (!a.packs.length && !a.inactifs.length)) return null;
  return (
    <Carte>
      <SousTitre>À surveiller</SousTitre>
      {a.packs.map((p) => (
        <LigneAlerte
          key={`p-${p.clientId}`}
          texte={`${p.prenom} : ${p.restantes ? `plus que ${p.restantes} séance${p.restantes > 1 ? 's' : ''} sur son pack` : 'pack terminé'}. Pense au renouvellement.`}
          couleur={couleurs.orange}
        />
      ))}
      {a.inactifs.map((c) => (
        <LigneAlerte
          key={`i-${c.id}`}
          texte={`${`${c.prenom} ${c.nom}`.trim()} : rien depuis ${c.depuisJours} jours, aucun rendez-vous prévu.`}
          couleur={couleurs.rougeTexte}
          action={{ libelle: 'Proposer un rendez-vous', onPress: () => onProposer(c.id) }}
        />
      ))}
    </Carte>
  );
}

function LigneAlerte({ texte, couleur, action }: { texte: string; couleur: string; action?: { libelle: string; onPress: () => void } }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: espace(2) }}>
      <Texte style={{ fontSize: 14, color: couleur, flexShrink: 1 }}>{texte}</Texte>
      {action && (
        <Pressable accessibilityRole="button" onPress={action.onPress}>
          <Text style={{ fontFamily: polices.texteMoyen, fontSize: 13, color: couleurs.rouge }}>{action.libelle}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Mon profil › Agenda : Google Agenda et réglages des rendez-vous. */
export function ReglagesAgendaCoach() {
  const reglages = useCharger(() => agenda.reglages(), 'agenda-reglages');
  const [enregistre, setEnregistre] = useState(false);
  return (
    <View style={{ gap: espace(4) }}>
      <GoogleAgenda onChange={() => undefined} />
      {reglages.erreur && <Erreur message={reglages.erreur} onReessayer={reglages.recharger} />}
      {!reglages.donnee && !reglages.erreur && <Chargement />}
      {reglages.donnee && (
        <Reglages
          key={JSON.stringify(reglages.donnee)}
          initial={reglages.donnee}
          onEnregistre={() => {
            setEnregistre(true);
            reglages.recharger();
          }}
        />
      )}
      {enregistre && <Texte style={{ fontSize: 14, color: couleurs.vert }}>Réglages enregistrés.</Texte>}
    </View>
  );
}

function Reglages({ initial, onEnregistre }: { initial: ReglagesAgenda; onEnregistre: () => void }) {
  const [r, setR] = useState(() => Object.fromEntries(Object.entries(initial).map(([k, v]) => [k, typeof v === 'number' ? String(v) : v])) as Record<keyof ReglagesAgenda, string | boolean>);
  const [erreur, setErreur] = useState<string>();
  const [occupe, setOccupe] = useState(false);
  const champ = (cle: keyof ReglagesAgenda, libelle: string, aide?: string) => (
    <Saisie libelle={libelle} type="nombre" valeur={String(r[cle])} onChange={(v) => setR((x) => ({ ...x, [cle]: v }))} aide={aide} />
  );
  async function enregistrer() {
    const nombre = (k: keyof ReglagesAgenda) => Number(String(r[k]).replace(',', '.'));
    const valeurs: ReglagesAgenda = {
      dureeMinutes: nombre('dureeMinutes'),
      tamponMinutes: nombre('tamponMinutes'),
      delaiAnnulationHeures: nombre('delaiAnnulationHeures'),
      rappelHeures: nombre('rappelHeures'),
      rappelCourt: r.rappelCourt === true,
      seuilFinPack: nombre('seuilFinPack'),
      inactiviteJours: nombre('inactiviteJours'),
      lieuDefaut: String(r.lieuDefaut),
    };
    setOccupe(true);
    setErreur(undefined);
    try {
      await agenda.enregistrerReglages(valeurs);
      onEnregistre();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Réglages non enregistrés.');
    } finally {
      setOccupe(false);
    }
  }
  return (
    <Carte>
      <SousTitre>Réglages de l’agenda</SousTitre>
      {champ('dureeMinutes', 'Durée d’une séance (minutes)')}
      {champ('tamponMinutes', 'Temps de trajet entre deux rendez-vous (minutes)', 'Sert à prévenir quand deux rendez-vous sont trop proches.')}
      {champ('delaiAnnulationHeures', 'Annulation en ligne jusqu’à (heures avant)', 'Après, le client doit t’appeler.')}
      {champ('rappelHeures', 'Rappel par mail (heures avant)')}
      <CaseACocher libelle="Second rappel court, 2 h avant" valeur={r.rappelCourt === true} onChange={(v) => setR((x) => ({ ...x, rappelCourt: v }))} />
      {champ('seuilFinPack', 'Alerte fin de pack à (séances restantes)')}
      {champ('inactiviteJours', 'Client inactif après (jours)')}
      <Saisie libelle="Lieu par défaut" valeur={String(r.lieuDefaut)} onChange={(v) => setR((x) => ({ ...x, lieuDefaut: v }))} placeholder="Salle, adresse…" />
      {erreur && <Texte style={{ fontSize: 14, color: couleurs.rouge }}>{erreur}</Texte>}
      <BoutonContour libelle={occupe ? 'Enregistrement…' : 'Enregistrer les réglages'} onPress={enregistrer} />
    </Carte>
  );
}
