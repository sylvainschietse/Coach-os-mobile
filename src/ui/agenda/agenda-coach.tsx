// Agenda du coach : vues Jour, Semaine et Mois (sur téléphone comme sur ordinateur), création d'un rendez-vous en touchant
// un créneau, alertes « fin de pack » et « client inactif », réglages de l'agenda.
import { CalendarPlus, ChevronLeft, ChevronRight, Settings } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { depot } from '@/data';
import { abonnements } from '@/data/abonnements';
import { agenda, retenirClientsDemo } from '@/data/agenda';
import {
  ajouterJours,
  cleJour,
  clientsInactifs,
  grilleMois,
  heureDe,
  lundiDe,
  nomsParticipants,
  occupe,
  packsBientotFinis,
  TYPES_RDV,
  type ReglagesAgenda,
  type RendezVous,
} from '@/domain/agenda';
import { soldeSeances } from '@/domain/abonnements';
import { useCharger } from '@/lib/useCharger';

import { BoutonContour, Vide } from '../coque';
import { Carte, Chargement, Erreur, Puce, Puces, SousTitre, Texte } from '../composants';
import { CaseACocher, Saisie } from '../crm/dossier';
import { couleurs, espace, LARGEUR_LARGE, polices } from '../theme';

import { COULEURS_STATUT, jourCourt, jourLong, majuscule, PastilleStatutRdv } from './commun';
import { EditeurRendezVous, type ClientAgenda } from './editeur-rdv';

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

export function AgendaCoach({ coachId }: { coachId: string }) {
  const { width } = useWindowDimensions();
  const large = width >= LARGEUR_LARGE;
  const [vue, setVue] = useState<Vue>(large ? 'semaine' : 'jour');
  const [date, setDate] = useState(() => new Date());
  const [edition, setEdition] = useState<{ rdv?: RendezVous; jour?: string; heure?: string; clientId?: string }>();
  const [reglagesOuverts, setReglagesOuverts] = useState(false);

  const { du, au } = periode(vue, date);
  const clients = useCharger(async () => {
    const liste = await depot.clientsDuCoach(coachId);
    retenirClientsDemo(liste);
    return liste;
  }, `agenda-clients-${coachId}`);
  const reglages = useCharger(() => agenda.reglages(), 'agenda-reglages');
  const rdv = useCharger(() => agenda.rendezVous(du.toISOString(), au.toISOString()), `agenda-${vue}-${cleJour(du)}`);
  const alertes = useAlertes(clients.donnee, reglages.donnee);

  const recharger = useCallback(() => {
    rdv.recharger();
    alertes.recharger();
  }, [rdv, alertes]);

  const deplacer = (sens: 1 | -1) =>
    setDate((d) => (vue === 'jour' ? ajouterJours(d, sens) : vue === 'semaine' ? ajouterJours(d, 7 * sens) : new Date(d.getFullYear(), d.getMonth() + sens, 1)));
  const ouvrirJour = (d: Date) => {
    setDate(d);
    setVue('jour');
  };
  const nouveau = (jour?: string, heure?: string, clientId?: string) => setEdition({ jour: jour ?? cleJour(vue === 'semaine' && !jour ? (cleJour(lundiDe(new Date())) === cleJour(lundiDe(date)) ? new Date() : lundiDe(date)) : date), heure, clientId });

  const liste = rdv.donnee ?? [];
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
          <BoutonContour libelle="Réglages" icone={Settings} iconeAGauche onPress={() => setReglagesOuverts((o) => !o)} />
          <BoutonContour libelle="Rendez-vous" icone={CalendarPlus} iconeAGauche onPress={() => nouveau()} />
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

      {reglagesOuverts && reglages.donnee && (
        <Reglages
          initial={reglages.donnee}
          onEnregistre={() => {
            setReglagesOuverts(false);
            reglages.recharger();
          }}
        />
      )}

      {rdv.erreur && <Erreur message={rdv.erreur} onReessayer={rdv.recharger} />}
      {!rdv.donnee && !rdv.erreur && <Chargement />}
      {rdv.donnee &&
        (vue === 'jour' ? (
          <VueJour rdv={duJour(du)} onOuvrir={(r) => setEdition({ rdv: r })} onNouveau={() => nouveau(cleJour(du))} />
        ) : vue === 'semaine' ? (
          large ? (
            <GrilleSemaine jours={jours} rdv={liste} onOuvrir={(r) => setEdition({ rdv: r })} onCreneau={(j, h) => nouveau(j, h)} onJour={ouvrirJour} />
          ) : (
            <ListeSemaine jours={jours} rdv={liste} onOuvrir={(r) => setEdition({ rdv: r })} onJour={ouvrirJour} onNouveau={(j) => nouveau(j)} />
          )
        ) : (
          <GrilleMois jours={jours} mois={date.getMonth()} rdv={liste} large={large} onJour={ouvrirJour} />
        ))}

      <AlertesAgenda alertes={alertes} onProposer={(clientId) => nouveau(undefined, undefined, clientId)} />

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
    </View>
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

function VueJour({ rdv, onOuvrir, onNouveau }: { rdv: RendezVous[]; onOuvrir: (r: RendezVous) => void; onNouveau: () => void }) {
  if (!rdv.length)
    return (
      <Vide titre="Aucun rendez-vous ce jour-là" texte="Touche « Rendez-vous » pour en poser un.">
        <BoutonContour libelle="Ajouter un rendez-vous" icone={CalendarPlus} iconeAGauche onPress={onNouveau} />
      </Vide>
    );
  return (
    <View style={{ gap: espace(2) }}>
      {rdv.map((r) => (
        <CarteRdv key={r.id} r={r} onPress={() => onOuvrir(r)} />
      ))}
    </View>
  );
}

/** Téléphone : les sept jours l'un sous l'autre, avec leurs rendez-vous. */
function ListeSemaine({
  jours,
  rdv,
  onOuvrir,
  onJour,
  onNouveau,
}: {
  jours: Date[];
  rdv: RendezVous[];
  onOuvrir: (r: RendezVous) => void;
  onJour: (d: Date) => void;
  onNouveau: (jour: string) => void;
}) {
  const aujourdhui = cleJour(new Date());
  return (
    <View style={{ gap: espace(3) }}>
      {jours.map((d) => {
        const siens = rdv.filter((r) => cleJour(r.debut) === cleJour(d));
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
            {siens.length ? (
              siens.map((r) => <CarteRdv key={r.id} r={r} compacte onPress={() => onOuvrir(r)} />)
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
  onOuvrir,
  onCreneau,
  onJour,
}: {
  jours: Date[];
  rdv: RendezVous[];
  onOuvrir: (r: RendezVous) => void;
  onCreneau: (jour: string, heure: string) => void;
  onJour: (d: Date) => void;
}) {
  const heures = rdv.map((r) => new Date(r.debut).getHours());
  const debut = Math.min(7, ...heures);
  const fin = Math.max(21, ...rdv.map((r) => new Date(r.fin).getHours() + 1));
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
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Mois : nombre de rendez-vous par jour (prénoms sur ordinateur) ; toucher un jour l'ouvre. */
function GrilleMois({ jours, mois, rdv, large, onJour }: { jours: Date[]; mois: number; rdv: RendezVous[]; large: boolean; onJour: (d: Date) => void }) {
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
            const horsMois = d.getMonth() !== mois;
            return (
              <Pressable
                key={cleJour(d)}
                accessibilityRole="button"
                accessibilityLabel={`${jourLong(cleJour(d))} : ${siens.length} rendez-vous`}
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
                    {siens.slice(0, 3).map((r) => (
                      <Text key={r.id} numberOfLines={1} style={{ fontFamily: polices.texte, fontSize: 11, color: COULEURS_STATUT[r.statut].texte }}>
                        {heureDe(r.debut)} {r.participants.map((p) => p.prenom).join(', ')}
                      </Text>
                    ))}
                    {siens.length > 3 && <Text style={{ fontFamily: polices.texte, fontSize: 11, color: couleurs.texteDoux }}>+{siens.length - 3}</Text>}
                  </>
                ) : (
                  siens.length > 0 && (
                    <View style={{ alignSelf: 'flex-start', minWidth: 20, paddingHorizontal: 5, borderRadius: 999, backgroundColor: couleurs.rouge }}>
                      <Text style={{ fontFamily: polices.texteGras, fontSize: 11, color: '#FFFFFF', textAlign: 'center' }}>{siens.length}</Text>
                    </View>
                  )
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
