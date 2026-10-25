// Suivis.tsx, CycleDialog.tsx et CycleProgrammeDialog.tsx d'origine (C13, C14) : un suivi de plusieurs mois par
// client, découpé en cycles préparés puis activés par le coach. Un seul cycle actif ; activer termine le précédent.
import { ArrowDown, ArrowUp, ExternalLink, Library, Pencil, Play, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Text, TextInput, View, useWindowDimensions } from 'react-native';

import { entrainement, lierProgramme } from '@/data/entrainement';
import { ecrireJour, lireJour } from '@/domain/crm';
import { ajouterJours, aujourdhuiParis, correspondRecherche, dansDates, finSuivi, LIBELLES_CYCLES, titreClient, type StatutCycle } from '@/domain/entrainement';
import type { CycleClient, ModeLien, ModeleResume, SuiviClient } from '@/domain/entrainement-etat';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { TitreDisplay } from '../coque';
import { Badge, Choix, Modale, Recherche, Saisie } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { Action, Confirmation, Etat, jourCourt, Ligne, ListeChoix, TexteLong, ts } from './commun';

const STATUTS: StatutCycle[] = ['Brouillon', 'Prêt', 'Terminé'];

function PastilleStatut({ statut }: { statut: StatutCycle }) {
  const fond = statut === 'Actif' ? couleurs.rouge : statut === 'Prêt' ? couleurs.rougeClair : statut === 'Terminé' ? couleurs.discret : couleurs.carte;
  const texte = statut === 'Actif' ? '#FFFFFF' : statut === 'Prêt' ? couleurs.rougeTexte : statut === 'Terminé' ? couleurs.texteDoux : couleurs.texte;
  return (
    <View style={{ borderWidth: 1, borderColor: statut === 'Brouillon' ? couleurs.bordure : 'transparent', backgroundColor: fond, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
      <Text style={{ fontFamily: polices.texteGras, fontSize: 12, color: texte }}>{statut}</Text>
    </View>
  );
}

function SuiviForm({ coachId, p, onEnregistre }: { coachId: string; p: SuiviClient; onEnregistre: () => void }) {
  const { width } = useWindowDimensions();
  const [debut, setDebut] = useState(ecrireJour(p.suivi?.debut ?? aujourdhuiParis()));
  const [mois, setMois] = useState(String(p.suivi?.dureeMois ?? 3));
  const [occupe, setOccupe] = useState(false);
  const [etat, setEtat] = useState<{ message?: string; erreur?: string }>({});
  const n = Number(mois);
  const jour = lireJour(debut);
  const ok = Number.isInteger(n) && n >= 1 && n <= 24 && !!jour;
  const enregistrer = async () => {
    setOccupe(true);
    setEtat({});
    try {
      await entrainement.enregistrerSuivi(coachId, { id: p.suivi?.id ?? nouvelId(), clientId: p.clientId, debut: jour!, dureeMois: n });
      setEtat({ message: 'Suivi enregistré' });
      onEnregistre();
    } catch (e) {
      setEtat({ erreur: e instanceof Error ? e.message : 'Échec' });
    } finally {
      setOccupe(false);
    }
  };
  const large = width >= 640;
  return (
    <View style={{ borderRadius: 10, backgroundColor: 'rgba(237,239,242,0.6)', padding: 12, gap: 12, flexDirection: large ? 'row' : 'column', alignItems: large ? 'flex-end' : 'stretch' }}>
      <View style={{ flex: large ? 1 : undefined, gap: 12 }}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <View style={{ flexBasis: 160, flexGrow: 1, minWidth: 0 }}>
            <Saisie libelle="Début du suivi" valeur={debut} placeholder="jj/mm/aaaa" erreur={debut && !jour ? 'Écrivez la date comme 24/10/2026' : undefined} onChange={setDebut} />
          </View>
          <View style={{ flexBasis: 200, flexGrow: 1, gap: 8 }}>
            <Text style={ts.titreChamp}>Durée (mois)</Text>
            <Ligne style={{ gap: 6, flexWrap: 'nowrap' }}>
              {['3', '6'].map((v) => (
                <Action key={v} petit libelle={v} variante={mois === v ? 'plein' : 'contour'} onPress={() => setMois(v)} />
              ))}
              <TextInput
                accessibilityLabel="Autre durée en mois"
                inputMode="numeric"
                value={mois}
                onChangeText={setMois}
                style={{ width: 80, height: 36, borderWidth: 1, borderColor: couleurs.saisie, borderRadius: 9, paddingHorizontal: 10, fontFamily: polices.texte, fontSize: 15, color: couleurs.texte, backgroundColor: couleurs.carte }}
              />
            </Ligne>
            {!(Number.isInteger(n) && n >= 1 && n <= 24) && <Text style={[ts.erreur, { fontSize: 12 }]}>Entier de 1 à 24</Text>}
          </View>
        </View>
        <Text style={ts.texte}>
          Fin calculée : <Text style={{ fontFamily: polices.texteGras }}>{ok ? jourCourt(finSuivi(jour!, n)) : '—'}</Text>
        </Text>
        <Etat {...etat} />
      </View>
      <View style={{ alignSelf: large ? 'flex-end' : 'flex-start' }}>
        <Action libelle={p.suivi ? 'Replanifier' : 'Créer le suivi'} desactive={!ok} chargement={occupe} onPress={enregistrer} />
      </View>
    </View>
  );
}

type ActionCycle = 'up' | 'down' | 'edit' | 'prog' | 'activer' | 'open';

function LigneCycle({ c, i, n, occupe, agir }: { c: CycleClient; i: number; n: number; occupe: boolean; agir: (a: ActionCycle) => void }) {
  const jour = aujourdhuiParis();
  return (
    <View style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 10, backgroundColor: couleurs.carte, padding: 12, gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <View style={[ts.pastilleJour, { width: 28, height: 28, borderRadius: 6 }]}>
          <Text style={ts.pastilleJourTexte}>{i + 1}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Ligne style={{ gap: 6 }}>
            <Text style={[ts.texte, { fontFamily: polices.texteGras }]}>{c.nom}</Text>
            <PastilleStatut statut={c.statut} />
          </Ligne>
          <Text style={ts.doux}>
            {jourCourt(c.debut)} → {jourCourt(c.fin)} · {c.nbResultats} résultat{c.nbResultats > 1 ? 's' : ''}
          </Text>
          <Text numberOfLines={1} style={[ts.doux, { color: couleurs.texte }]}>
            {c.programmeNom ? `${c.programmeNom} · ${c.mode}` : 'Aucun programme lié'}
          </Text>
          <TexteLong texte={c.objectif} style={{ fontSize: 12, color: couleurs.texteDoux }} />
        </View>
        <View>
          <Action petit variante="fantome" icone={ArrowUp} nom={`Monter ${c.nom}`} desactive={i === 0 || occupe} onPress={() => agir('up')} />
          <Action petit variante="fantome" icone={ArrowDown} nom={`Descendre ${c.nom}`} desactive={i === n - 1 || occupe} onPress={() => agir('down')} />
        </View>
      </View>
      <Ligne style={{ gap: 6 }}>
        <Action petit variante="contour" icone={Pencil} libelle="Modifier" onPress={() => agir('edit')} />
        {c.statut !== 'Terminé' && <Action petit variante="contour" icone={Library} libelle="Programme" onPress={() => agir('prog')} />}
        {c.programmeId && <Action petit variante="fantome" icone={ExternalLink} libelle="Éditer" onPress={() => agir('open')} />}
        {c.statut === 'Prêt' && <Action petit icone={Play} libelle="Activer" desactive={!c.programmeId || occupe || !dansDates(c, jour)} onPress={() => agir('activer')} />}
        {c.statut === 'Brouillon' && <Text style={ts.doux}>Passez en « Prêt » pour activer</Text>}
        {c.statut === 'Prêt' && !dansDates(c, jour) && <Text style={ts.doux}>{jour < c.debut ? `À venir · activable le ${jourCourt(c.debut)}` : 'Dates dépassées · replanifiez'}</Text>}
      </Ligne>
    </View>
  );
}

function DialogueCycle({
  coachId,
  suiviId,
  clientId,
  cycle,
  debutParDefaut,
  onFermer,
  onEnregistre,
}: {
  coachId: string;
  suiviId: string;
  clientId: string;
  cycle?: CycleClient;
  debutParDefaut: string;
  onFermer: () => void;
  onEnregistre: () => void;
}) {
  const [f, setF] = useState({
    nom: cycle?.nom ?? '',
    objectif: cycle?.objectif ?? '',
    debut: ecrireJour(cycle?.debut ?? debutParDefaut),
    fin: ecrireJour(cycle?.fin),
    statut: cycle?.statut ?? ('Brouillon' as StatutCycle),
  });
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const debut = lireJour(f.debut);
  const fin = lireJour(f.fin);
  const err = !f.nom.trim()
    ? 'Nom requis'
    : !f.debut.trim() || !f.fin.trim()
      ? 'Dates requises'
      : !debut || !fin
        ? 'Écrivez les dates comme 24/10/2026'
        : fin < debut
          ? 'La fin doit suivre le début'
          : '';
  const actif = cycle?.statut === 'Actif';
  const enregistrer = async () => {
    setOccupe(true);
    setErreur('');
    try {
      await entrainement.enregistrerCycle(coachId, {
        id: cycle?.id ?? nouvelId(),
        suiviId,
        clientId,
        ordre: cycle?.ordre ?? 0,
        nom: f.nom.trim(),
        objectif: f.objectif.trim() || undefined,
        debut: debut!,
        fin: fin!,
        statut: f.statut,
        programmeId: cycle?.programmeId,
        mode: cycle?.mode,
      });
      onEnregistre();
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec');
    } finally {
      setOccupe(false);
    }
  };
  return (
    <Modale
      titre={cycle ? 'Modifier / replanifier le cycle' : 'Nouveau cycle'}
      largeur={512}
      onFermer={() => !occupe && onFermer()}
      pied={
        <Ligne style={{ justifyContent: 'flex-end' }}>
          <Action libelle="Annuler" variante="contour" desactive={occupe} onPress={onFermer} />
          <Action libelle="Enregistrer" desactive={!!err} chargement={occupe} onPress={enregistrer} />
        </Ligne>
      }
    >
      <Saisie libelle="Nom" valeur={f.nom} placeholder="Cycle 1 · Fondations" onChange={(v) => setF({ ...f, nom: v })} />
      <Saisie libelle="Objectif" long valeur={f.objectif} onChange={(v) => setF({ ...f, objectif: v })} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <View style={{ flexBasis: 180, flexGrow: 1, minWidth: 0 }}>
          <Saisie libelle="Début" valeur={f.debut} placeholder="jj/mm/aaaa" onChange={(v) => setF({ ...f, debut: v })} />
        </View>
        <View style={{ flexBasis: 180, flexGrow: 1, minWidth: 0 }}>
          <Saisie libelle="Fin" valeur={f.fin} placeholder="jj/mm/aaaa" onChange={(v) => setF({ ...f, fin: v })} />
        </View>
      </View>
      <View style={{ gap: 8 }}>
        <Text style={ts.titreChamp}>Statut</Text>
        {actif && <Text style={ts.texte}>Actif — pour le clore, choisissez Terminé (les résultats sont conservés).</Text>}
        <Ligne style={{ gap: 8 }}>
          {(actif ? (['Actif', 'Terminé'] as StatutCycle[]) : STATUTS).map((s) => (
            <Action key={s} petit libelle={s} variante={f.statut === s ? 'plein' : 'contour'} onPress={() => setF({ ...f, statut: s })} />
          ))}
        </Ligne>
        {!actif && <Text style={ts.doux}>L’activation se fait avec le bouton « Activer » (un seul cycle actif par profil).</Text>}
      </View>
      {err ? <Text style={[ts.erreur, { fontSize: 12 }]}>{err}</Text> : null}
      {erreur ? (
        <Text accessibilityRole="alert" style={ts.erreur}>
          {erreur}
        </Text>
      ) : null}
    </Modale>
  );
}

function DialogueProgrammeCycle({
  coachId,
  cycle,
  client,
  modeles,
  onFermer,
  onEnregistre,
}: {
  coachId: string;
  cycle: CycleClient;
  client: string;
  modeles: ModeleResume[] | null;
  onFermer: () => void;
  onEnregistre: (message: string) => void;
}) {
  const [cycleModele, setCycleModele] = useState(1);
  const [modeleId, setModeleId] = useState('');
  const [q, setQ] = useState('');
  const [copie, setCopie] = useState(false);
  const [occupe, setOccupe] = useState<'modele' | 'copie' | null>(null);
  const [erreur, setErreur] = useState('');
  const modele = modeles?.find((m) => m.id === modeleId);
  const lier = async (mode: 'modele' | 'copie') => {
    setOccupe(mode);
    setErreur('');
    try {
      const lien: ModeLien = mode === 'copie' ? 'Copie personnalisée' : 'Modèle';
      await lierProgramme(coachId, cycle, modeleId, lien, { client, cycleModele: mode === 'copie' ? cycleModele : 1 });
      onEnregistre(mode === 'copie' ? 'Copie créée et liée au cycle' : 'Modèle lié au cycle');
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec');
    } finally {
      setOccupe(null);
    }
  };
  return (
    <Modale
      titre={`Programme du cycle « ${cycle.nom} »`}
      largeur={512}
      onFermer={() => !occupe && onFermer()}
      pied={
        <Ligne style={{ justifyContent: 'flex-end' }}>
          <Action libelle="Annuler" variante="contour" desactive={!!occupe} onPress={onFermer} />
          {copie ? (
            <Action libelle="Confirmer la copie" chargement={occupe === 'copie'} desactive={!!occupe} onPress={() => lier('copie')} />
          ) : (
            <>
              <Action libelle="Dupliquer pour personnaliser" variante="contour" desactive={!modeleId || !!occupe} onPress={() => setCopie(true)} />
              <Action libelle="Lier tel quel" chargement={occupe === 'modele'} desactive={!modeleId || !!occupe} onPress={() => lier('modele')} />
            </>
          )}
        </Ligne>
      }
    >
      {cycle.programmeNom && (
        <Text style={[ts.texte, { color: couleurs.texteDoux }]}>
          Actuel : {cycle.programmeNom} ({cycle.mode})
        </Text>
      )}
      <Text style={[ts.texte, { fontFamily: polices.texteMoyen }]}>
        {modele ? (
          <>
            Choisi : <Text style={{ color: couleurs.rouge }}>{titreClient(modele.titre)}</Text>
          </>
        ) : (
          'Choisir un modèle…'
        )}
      </Text>
      <View style={{ flexDirection: 'row' }}>
        <Recherche valeur={q} onChange={setQ} libelle="Rechercher un modèle" placeholder="Rechercher un modèle…" />
      </View>
      <ListeChoix
        elements={modeles ? modeles.filter((m) => !m.seanceSeule && correspondRecherche(m.titre, q)) : null}
        cle={(m) => m.id}
        libelle={(m) => titreClient(m.titre)}
        choisi={modeleId}
        onChoisir={(m) => {
          setModeleId(m.id);
          setCopie(false);
        }}
      />
      {copie && (
        <View style={{ gap: 4 }}>
          <Choix libelle="Cycle à appliquer" vide={null} choix={LIBELLES_CYCLES} valeur={LIBELLES_CYCLES[cycleModele - 1]} onChange={(v) => setCycleModele(LIBELLES_CYCLES.indexOf(v ?? '') + 1 || 1)} />
          <Text style={ts.doux}>Pour les modèles Fondamentaux. Chaque copie couvre 5 semaines ; le coach valide le passage au cycle suivant.</Text>
        </View>
      )}
      {copie && modele && (
        <Text style={[ts.texte, { borderWidth: 1, borderColor: 'rgba(194,65,12,0.4)', backgroundColor: couleurs.orangeClair, color: '#7C2D12', borderRadius: 10, padding: 12 }]}>
          Une copie de « {titreClient(modele.titre)} » (programme, séances, lignes) sera créée pour {client}, indépendante du modèle. Vous la réviserez ensuite.
        </Text>
      )}
      {erreur ? (
        <Text accessibilityRole="alert" style={ts.erreur}>
          {erreur}
        </Text>
      ) : null}
    </Modale>
  );
}

function ProfilSuivi({
  coachId,
  p,
  modeles,
  recharger,
  onOuvrir,
}: {
  coachId: string;
  p: SuiviClient;
  modeles: ModeleResume[] | null;
  recharger: () => void;
  onOuvrir: (programmeId: string) => void;
}) {
  const { width } = useWindowDimensions();
  const [dialogue, setDialogue] = useState<{ type: 'cycle'; c?: CycleClient } | { type: 'prog'; c: CycleClient }>();
  const [activer, setActiver] = useState<CycleClient>();
  const [occupe, setOccupe] = useState(false);
  const [etat, setEtat] = useState<{ message?: string; erreur?: string }>({});
  const executer = async (fn: () => Promise<unknown>, ok: string) => {
    setOccupe(true);
    setEtat({});
    try {
      await fn();
      setEtat({ message: ok });
      recharger();
    } catch (e) {
      setEtat({ erreur: e instanceof Error ? e.message : 'Échec' });
    } finally {
      setOccupe(false);
    }
  };
  const actif = p.cycles.find((c) => c.statut === 'Actif');
  const dernier = p.cycles[p.cycles.length - 1];
  return (
    <View style={[ts.carte, { padding: width >= 640 ? 20 : 16, gap: 0, flexBasis: width >= 1024 ? '48%' : '100%', flexGrow: 1, minWidth: 0 }]}>
      <Ligne style={{ marginBottom: 12 }}>
        <Text style={{ fontFamily: polices.titre, fontSize: 22, letterSpacing: 0.8, color: couleurs.texte }}>{p.nom}</Text>
        <Badge libelle="Profil client" />
      </Ligne>
      <SuiviForm coachId={coachId} p={p} onEnregistre={recharger} />
      {p.suivi && (
        <>
          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={ts.titreSection}>Cycles</Text>
            <Action petit variante="contour" icone={Plus} libelle="Cycle" onPress={() => setDialogue({ type: 'cycle' })} />
          </View>
          <View style={{ marginTop: 6 }}>
            <Etat {...etat} />
          </View>
          {p.cycles.length === 0 ? (
            <Text style={[ts.texte, { marginTop: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: couleurs.bordure, borderRadius: 10, padding: 16, textAlign: 'center', color: couleurs.texteDoux }]}>
              Aucun cycle. Le contenu sportif reste à votre main.
            </Text>
          ) : (
            <View style={{ marginTop: 8, gap: 8 }}>
              {p.cycles.map((c, i) => (
                <LigneCycle
                  key={c.id}
                  c={c}
                  i={i}
                  n={p.cycles.length}
                  occupe={occupe}
                  agir={(a) => {
                    if (a === 'up' || a === 'down') executer(() => entrainement.deplacerCycle(c.id, a === 'up' ? -1 : 1), 'Ordre mis à jour');
                    else if (a === 'edit') setDialogue({ type: 'cycle', c });
                    else if (a === 'prog') setDialogue({ type: 'prog', c });
                    else if (a === 'open') onOuvrir(c.programmeId!);
                    else setActiver(c);
                  }}
                />
              ))}
            </View>
          )}
        </>
      )}
      {dialogue?.type === 'cycle' && p.suivi && (
        <DialogueCycle
          coachId={coachId}
          suiviId={p.suivi.id}
          clientId={p.clientId}
          cycle={dialogue.c}
          debutParDefaut={dernier?.fin ? ajouterJours(dernier.fin, 1) : p.suivi.debut}
          onFermer={() => setDialogue(undefined)}
          onEnregistre={() => {
            setEtat({ message: dialogue.c ? 'Cycle replanifié' : 'Cycle créé' });
            recharger();
          }}
        />
      )}
      {dialogue?.type === 'prog' && (
        <DialogueProgrammeCycle
          coachId={coachId}
          cycle={dialogue.c}
          client={p.nom}
          modeles={modeles}
          onFermer={() => setDialogue(undefined)}
          onEnregistre={(m) => {
            setEtat({ message: m });
            recharger();
          }}
        />
      )}
      {activer && (
        <Confirmation
          titre={`Activer « ${activer.nom} » ?`}
          texte={`${actif ? `« ${actif.nom} » passera Terminé. ` : ''}Le client verra ce cycle et son programme. Tous les résultats passés restent rattachés à leur cycle d’origine.`}
          action="Activer"
          onFermer={() => setActiver(undefined)}
          onConfirmer={async () => {
            await entrainement.activerCycle(activer.id);
            setEtat({ message: 'Cycle activé' });
            recharger();
          }}
        />
      )}
    </View>
  );
}

export function CyclesClients({ coachId, onOuvrirProgramme }: { coachId: string; onOuvrirProgramme: (id: string) => void }) {
  const profils = useCharger(() => entrainement.suivis(coachId), `suivis-${coachId}`);
  const modeles = useCharger(() => entrainement.bibliotheque(coachId), `modeles-${coachId}`);
  const recharger = useCallback(() => profils.recharger(), [profils]);
  return (
    <View>
      <TitreDisplay taille={30}>Suivis</TitreDisplay>
      <Text style={[ts.doux, { fontSize: 14, marginTop: 4 }]}>Accompagnements sur plusieurs mois, découpés en cycles. Les cycles sont préparés et activés par le coach.</Text>
      {profils.erreur && (
        <Text accessibilityRole="alert" style={[ts.erreur, { marginTop: 16 }]}>
          Chargement impossible : {profils.erreur}
        </Text>
      )}
      {modeles.erreur && (
        <Text accessibilityRole="alert" style={[ts.erreur, { marginTop: 8 }]}>
          Modèles indisponibles : {modeles.erreur}
        </Text>
      )}
      <View style={{ marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
        {!profils.donnee && !profils.erreur && [0, 1].map((i) => <View key={i} style={{ height: 320, borderRadius: 12, backgroundColor: couleurs.discret, flexBasis: '48%', flexGrow: 1 }} />)}
        {profils.donnee?.length === 0 && <Text style={[ts.doux, { fontSize: 14 }]}>Aucun client actif. Un contact devient client depuis sa fiche.</Text>}
        {profils.donnee?.map((p) => (
          <ProfilSuivi key={p.clientId} coachId={coachId} p={p} modeles={modeles.donnee ?? null} recharger={recharger} onOuvrir={onOuvrirProgramme} />
        ))}
      </View>
    </View>
  );
}
