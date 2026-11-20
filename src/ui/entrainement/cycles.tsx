// Suivis.tsx, CycleDialog.tsx et CycleProgrammeDialog.tsx d'origine (C13, C14) : un suivi de plusieurs mois par
// client, découpé en cycles préparés puis activés par le coach. Un seul cycle actif ; activer termine le précédent.
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ExternalLink, Library, Pencil, Play, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';

import { ecouterCrm } from '@/data/crm';
import { attribuerAuClient, entrainement, lierProgramme } from '@/data/entrainement';
import { ecrireJour, lireJour } from '@/domain/crm';
import { ajouterJours, aujourdhuiParis, correspondRecherche, dansDates, LIBELLES_CYCLES, titreClient, type StatutCycle } from '@/domain/entrainement';
import type { CycleClient, ModeLien, ModeleResume, SuiviClient } from '@/domain/entrainement-etat';
import { FILTRES_SUIVIS, listeSuivis, TRIS_SUIVIS, type FiltreSuivis, type TriSuivis } from '@/domain/liste-suivis';
import { nouvelId } from '@/lib/identifiant';
import { useCharger, useRechargerSur } from '@/lib/useCharger';

import { Selecteur, TitreDisplay } from '../coque';
import { Puce, Puces } from '../composants';
import { Choix, Modale, Recherche, Saisie } from '../crm/dossier';
import { couleurs, polices } from '../theme';
import { Action, Confirmation, Etat, jourCourt, Ligne, ListeChoix, TexteLong, ts, PhotoProgramme } from './commun';

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

/**
 * Le mot « suivi » ne parle pas : le coach ajoute un programme, le suivi (conteneur des cycles) se crée tout seul.
 * « Retirer ses programmes » efface les cycles prévus ; les séances déjà faites restent dans l'historique.
 */
function SuiviForm({ coachId, p, modeles, onEnregistre }: { coachId: string; p: SuiviClient; modeles: ModeleResume[] | null; onEnregistre: () => void }) {
  const [ajout, setAjout] = useState(false);
  const [retirer, setRetirer] = useState(false);
  const [etat, setEtat] = useState<{ message?: string; erreur?: string }>({});
  const vide = !p.suivi || p.cycles.length === 0;
  return (
    <View style={{ borderRadius: 10, backgroundColor: 'rgba(237,239,242,0.6)', padding: 12, gap: 10 }}>
      <Text style={[ts.texte, { fontFamily: polices.texteGras }]}>
        {vide ? 'Aucun programme pour l’instant' : `Programmes depuis le ${jourCourt(p.suivi!.debut)}`}
      </Text>
      {vide && <Text style={ts.doux}>Choisis un programme de ta bibliothèque : {p.nom} le voit tout de suite dans son appli.</Text>}
      <Etat {...etat} />
      <Ligne>
        <Action libelle="Ajouter un programme" icone={Plus} onPress={() => setAjout(true)} />
        {!vide && <Action petit variante="contour" libelle="Retirer ses programmes" onPress={() => setRetirer(true)} />}
      </Ligne>
      {ajout && (
        <DialogueAjoutProgramme
          coachId={coachId}
          p={p}
          modeles={modeles}
          onFermer={() => setAjout(false)}
          onEnregistre={(m) => {
            setEtat({ message: m });
            onEnregistre();
          }}
        />
      )}
      {retirer && (
        <Confirmation
          titre={`Retirer les programmes de ${p.nom} ?`}
          texte={`Ses ${p.cycles.length} cycle${p.cycles.length > 1 ? 's' : ''} et leurs séances prévues seront retirés. Ses séances déjà faites restent dans son historique, et ${p.nom} reste dans tes clients actifs.`}
          action="Retirer"
          danger
          onConfirmer={async () => {
            await entrainement.arreterSuivi(p.clientId);
            setEtat({ message: 'Programmes retirés' });
            onEnregistre();
          }}
          onFermer={() => setRetirer(false)}
        />
      )}
    </View>
  );
}

/** Un programme de la bibliothèque, copié au nom du client dans un nouveau cycle, visible tout de suite. */
function DialogueAjoutProgramme({
  coachId,
  p,
  modeles,
  onFermer,
  onEnregistre,
}: {
  coachId: string;
  p: SuiviClient;
  modeles: ModeleResume[] | null;
  onFermer: () => void;
  onEnregistre: (message: string) => void;
}) {
  const [q, setQ] = useState('');
  const [modeleId, setModeleId] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const ajouter = async () => {
    setOccupe(true);
    setErreur('');
    try {
      const r = await attribuerAuClient(coachId, { programmeId: modeleId }, p, { nouveau: true, activer: true }, p.suivi ? undefined : { debut: aujourdhuiParis() });
      onEnregistre(r.active ? `Programme ajouté dans « ${r.cycle} », visible dans son appli.` : `Programme ajouté dans « ${r.cycle} » ; il démarrera après le cycle en cours.`);
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Ajout impossible');
    } finally {
      setOccupe(false);
    }
  };
  return (
    <Modale
      titre={`Ajouter un programme · ${p.nom}`}
      largeur={560}
      onFermer={() => !occupe && onFermer()}
      pied={
        <Ligne style={{ justifyContent: 'flex-end' }}>
          <Action libelle="Annuler" variante="contour" desactive={occupe} onPress={onFermer} />
          <Action libelle="Ajouter" chargement={occupe} desactive={!modeleId} onPress={ajouter} />
        </Ligne>
      }
    >
      <Text style={ts.doux}>{p.nom} reçoit une copie à son nom : tu peux l’adapter sans toucher au modèle.</Text>
      <View style={{ flexDirection: 'row' }}>
        <Recherche valeur={q} onChange={setQ} libelle="Rechercher un programme" placeholder="Rechercher un programme…" />
      </View>
      <ListeChoix
        elements={modeles ? modeles.filter((m) => !m.seanceSeule && correspondRecherche(m.titre, q)) : null}
        cle={(m) => m.id}
        libelle={(m) => titreClient(m.titre)}
        detail={(m) => [m.niveau, m.objectif].filter(Boolean).join(' · ') || undefined}
        choisi={modeleId}
        onChoisir={(m) => setModeleId(m.id)}
        vide="Aucun programme ne correspond."
      />
      {erreur ? <Text style={ts.erreur}>{erreur}</Text> : null}
    </Modale>
  );
}

type ActionCycle = 'up' | 'down' | 'edit' | 'prog' | 'activer' | 'open' | 'suivi';

function LigneCycle({ c, i, n, occupe, agir }: { c: CycleClient; i: number; n: number; occupe: boolean; agir: (a: ActionCycle) => void }) {
  const jour = aujourdhuiParis();
  const suivable = !!c.programmeId && (c.statut === 'Actif' || c.statut === 'Terminé');
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
          {/* Toucher le programme d'un cycle commencé ouvre l'entraînement du client (séances faites, manquées, à venir). */}
          <Pressable
            accessibilityRole={suivable ? 'button' : undefined}
            accessibilityLabel={suivable ? `Voir l’entraînement : ${c.programmeNom}` : undefined}
            disabled={!suivable}
            onPress={() => agir('suivi')}
          >
            <Text numberOfLines={1} style={[ts.doux, { color: suivable ? couleurs.rouge : couleurs.texte }, suivable && { fontFamily: polices.texteMoyen }]}>
              {c.programmeNom ? `${titreClient(c.programmeNom)} · ${c.mode}` : 'Aucun programme lié'}
            </Text>
          </Pressable>
          <TexteLong texte={c.objectif} style={{ fontSize: 12, color: couleurs.texteDoux }} />
        </View>
        {c.programmeNom && (
          <Pressable disabled={!suivable} onPress={() => agir('suivi')} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <PhotoProgramme programme={{ titre: c.programmeNom }} hauteur={56} style={{ width: 76, borderRadius: 8 }} />
          </Pressable>
        )}
        <View>
          <Action petit variante="fantome" icone={ArrowUp} nom={`Monter ${c.nom}`} desactive={i === 0 || occupe} onPress={() => agir('up')} />
          <Action petit variante="fantome" icone={ArrowDown} nom={`Descendre ${c.nom}`} desactive={i === n - 1 || occupe} onPress={() => agir('down')} />
        </View>
      </View>
      <Ligne style={{ gap: 6 }}>
        <Action petit variante="contour" icone={Pencil} libelle="Modifier" onPress={() => agir('edit')} />
        {c.statut !== 'Terminé' && <Action petit variante="contour" icone={Library} libelle={c.programmeId ? 'Changer de programme' : 'Lier un programme'} onPress={() => agir('prog')} />}
        {c.programmeId && <Action petit variante="fantome" icone={ExternalLink} libelle="Éditer le programme" onPress={() => agir('open')} />}
        {c.statut === 'Prêt' && <Action petit icone={Play} libelle="Activer" desactive={!c.programmeId || occupe || !dansDates(c, jour)} onPress={() => agir('activer')} />}
        {c.statut === 'Brouillon' && <Text style={ts.doux}>Passe en « Prêt » pour activer</Text>}
        {c.statut === 'Prêt' && !dansDates(c, jour) && <Text style={ts.doux}>{jour < c.debut ? `À venir · activable le ${jourCourt(c.debut)}` : 'Dates dépassées · replanifie'}</Text>}
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
  creerSuivi,
  client,
  modeles,
  onFermer,
  onEnregistre,
}: {
  coachId: string;
  suiviId: string;
  /** Nom du client, pour nommer la copie du programme choisi. */
  client: string;
  /** Bibliothèque : à la création, le coach choisit directement le programme du cycle. */
  modeles: ModeleResume[] | null;
  /** Sans suivi, le premier cycle enregistré le démarre (à la date d'aujourd'hui). */
  creerSuivi?: () => Promise<void>;
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
  const [modeleId, setModeleId] = useState('');
  const [q, setQ] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const debut = lireJour(f.debut);
  const fin = lireJour(f.fin);
  const err = !f.nom.trim()
    ? 'Nom requis'
    : !f.debut.trim() || !f.fin.trim()
      ? 'Dates requises'
      : !debut || !fin
        ? 'Écris les dates comme 24/10/2026'
        : fin < debut
          ? 'La fin doit suivre le début'
          : '';
  const actif = cycle?.statut === 'Actif';
  const enregistrer = async () => {
    setOccupe(true);
    setErreur('');
    try {
      if (creerSuivi) await creerSuivi();
      const stocke = {
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
      };
      // Programme choisi dans la bibliothèque : le client en reçoit une copie à son nom, liée au cycle.
      if (!cycle && modeleId) await lierProgramme(coachId, stocke, modeleId, 'Copie personnalisée', { client, cycleModele: 1 });
      else await entrainement.enregistrerCycle(coachId, stocke);
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
      titre={cycle ? 'Modifier les dates du programme' : 'Prévoir un programme'}
      largeur={512}
      onFermer={() => !occupe && onFermer()}
      pied={
        <Ligne style={{ justifyContent: 'flex-end' }}>
          <Action libelle="Annuler" variante="contour" desactive={occupe} onPress={onFermer} />
          <Action libelle="Enregistrer" desactive={!!err} chargement={occupe} onPress={enregistrer} />
        </Ligne>
      }
    >
      {!cycle && (
        <View style={{ gap: 8 }}>
          <Text style={ts.titreChamp}>Programme</Text>
          <View style={{ flexDirection: 'row' }}>
            <Recherche valeur={q} onChange={setQ} libelle="Rechercher un programme" placeholder="Rechercher un programme…" />
          </View>
          <ListeChoix
            elements={modeles ? modeles.filter((m) => !m.seanceSeule && correspondRecherche(m.titre, q)) : null}
            cle={(m) => m.id}
            libelle={(m) => titreClient(m.titre)}
            detail={(m) => [m.niveau, m.objectif].filter(Boolean).join(' · ') || undefined}
            choisi={modeleId}
            onChoisir={(m) => {
              setModeleId(m.id);
              if (!f.nom.trim()) setF({ ...f, nom: titreClient(m.titre) });
            }}
            vide="Aucun programme ne correspond."
          />
          <Text style={ts.doux}>Facultatif : tu peux aussi le lier plus tard avec « Lier un programme ».</Text>
        </View>
      )}
      <Saisie libelle="Nom" valeur={f.nom} placeholder="Fondations" onChange={(v) => setF({ ...f, nom: v })} />
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
        {actif && <Text style={ts.texte}>Actif — pour le clore, choisis Terminé (les résultats sont conservés).</Text>}
        <Ligne style={{ gap: 8 }}>
          {(actif ? (['Actif', 'Terminé'] as StatutCycle[]) : STATUTS).map((s) => (
            <Action key={s} petit libelle={s} variante={f.statut === s ? 'plein' : 'contour'} onPress={() => setF({ ...f, statut: s })} />
          ))}
        </Ligne>
        {!actif && <Text style={ts.doux}>L’activation se fait avec le bouton « Activer » (un seul programme en cours à la fois).</Text>}
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
      onEnregistre(mode === 'copie' ? 'Copie créée et liée' : 'Programme lié');
      onFermer();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Échec');
    } finally {
      setOccupe(null);
    }
  };
  return (
    <Modale
      titre={`Programme pour « ${cycle.nom} »`}
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
          Une copie de « {titreClient(modele.titre)} » (programme, séances, lignes) sera créée pour {client}, indépendante du modèle. Tu la réviseras ensuite.
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
  onFiche,
  onEntrainement,
}: {
  coachId: string;
  p: SuiviClient;
  modeles: ModeleResume[] | null;
  recharger: () => void;
  onOuvrir: (programmeId: string) => void;
  onFiche: () => void;
  onEntrainement: () => void;
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
  const [ouvert, setOuvert] = useState(false);
  const [nouveauSuiviId] = useState(nouvelId);
  const actif = p.cycles.find((c) => c.statut === 'Actif');
  const dernier = p.cycles[p.cycles.length - 1];
  const resume = actif ? `${actif.nom} en cours` : p.cycles.length ? 'Aucun cycle en cours' : 'Aucun programme';
  const Chevron = ouvert ? ChevronDown : ChevronRight;
  return (
    <View style={[ts.carte, { padding: 0, gap: 0, minWidth: 0 }]}>
      {/* Une ligne par client (nom + flèche) : la liste reste courte, le détail s'ouvre au toucher. */}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: ouvert }}
        accessibilityLabel={`${p.nom} · ${resume}`}
        onPress={() => setOuvert((o) => !o)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ fontFamily: polices.texteGras, fontSize: 16, color: couleurs.texte }}>
            {p.nom}
          </Text>
          <Text numberOfLines={1} style={ts.doux}>
            {resume}
          </Text>
        </View>
        <Chevron size={20} color={couleurs.texteDoux} />
      </Pressable>
      {ouvert && (
        <View style={{ paddingHorizontal: width >= 640 ? 20 : 16, paddingBottom: width >= 640 ? 20 : 16 }}>
          <Ligne style={{ marginBottom: 12 }}>
            <Action petit variante="contour" icone={ExternalLink} libelle="Voir la fiche" onPress={onFiche} />
          </Ligne>
          <SuiviForm coachId={coachId} p={p} modeles={modeles} onEnregistre={recharger} />
      <>
          <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Text style={ts.titreSection}>Programmes</Text>
            <Action petit variante="contour" icone={Plus} libelle="Prévoir" onPress={() => setDialogue({ type: 'cycle' })} />
          </View>
          <View style={{ marginTop: 6 }}>
            <Etat {...etat} />
          </View>
          {p.cycles.length === 0 ? (
            <Text style={[ts.texte, { marginTop: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: couleurs.bordure, borderRadius: 10, padding: 16, textAlign: 'center', color: couleurs.texteDoux }]}>
              Aucun programme. Attribue-lui un programme depuis la bibliothèque, ou prévois-en un ici.
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
                    else if (a === 'suivi') onEntrainement();
                    else setActiver(c);
                  }}
                />
              ))}
            </View>
          )}
      </>
        </View>
      )}
      {dialogue?.type === 'cycle' && (
        <DialogueCycle
          coachId={coachId}
          suiviId={p.suivi?.id ?? nouveauSuiviId}
          creerSuivi={p.suivi ? undefined : () => entrainement.enregistrerSuivi(coachId, { id: nouveauSuiviId, clientId: p.clientId, debut: aujourdhuiParis() })}
          clientId={p.clientId}
          client={p.nom}
          modeles={modeles}
          cycle={dialogue.c}
          debutParDefaut={dernier?.fin ? ajouterJours(dernier.fin, 1) : (p.suivi?.debut ?? aujourdhuiParis())}
          onFermer={() => setDialogue(undefined)}
          onEnregistre={() => {
            setEtat({ message: dialogue.c ? 'Dates mises à jour' : 'Programme prévu' });
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
          texte={`${actif ? `« ${actif.nom} » passera Terminé. ` : ''}Le client verra ce programme. Ses résultats passés restent rangés avec leur programme d’origine.`}
          action="Activer"
          onFermer={() => setActiver(undefined)}
          onConfirmer={async () => {
            await entrainement.activerCycle(activer.id);
            setEtat({ message: 'Programme activé' });
            recharger();
          }}
        />
      )}
    </View>
  );
}

export function CyclesClients({
  coachId,
  onOuvrirProgramme,
  onOuvrirFiche,
  onOuvrirEntrainement,
}: {
  coachId: string;
  onOuvrirProgramme: (id: string) => void;
  onOuvrirFiche: (clientId: string) => void;
  /** Séances faites, manquées et à venir du client, détail et évolutions. */
  onOuvrirEntrainement: (clientId: string) => void;
}) {
  const profils = useCharger(() => entrainement.suivis(coachId), `suivis-${coachId}`);
  // Un client ajouté (Nouveau client, statut « Client actif ») apparaît sans recharger la page.
  useRechargerSur(profils.recharger, ecouterCrm);
  const modeles = useCharger(() => entrainement.bibliotheque(coachId), `modeles-${coachId}`);
  const recharger = useCallback(() => profils.recharger(), [profils]);
  const [recherche, setRecherche] = useState('');
  const [filtre, setFiltre] = useState<FiltreSuivis>('tous');
  const [tri, setTri] = useState<TriSuivis>('nom');
  const visibles = profils.donnee ? listeSuivis(profils.donnee, { recherche, filtre, tri, jour: aujourdhuiParis() }) : undefined;
  return (
    <View>
      <TitreDisplay taille={30}>Programmes des clients</TitreDisplay>
      <Text style={[ts.doux, { fontSize: 14, marginTop: 4 }]}>Les programmes de chaque client, découpés en cycles. Tu prépares et actives les cycles.</Text>
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
      {/* Chercher, filtrer et trier : la liste reste utilisable avec beaucoup de clients. */}
      {!!profils.donnee?.length && (
        <View style={{ marginTop: 16, gap: 10 }}>
          {/* En ligne : la recherche prend la largeur, pas une hauteur de 192 px. */}
          <View style={{ flexDirection: 'row' }}>
            <Recherche valeur={recherche} onChange={setRecherche} libelle="Rechercher un client" placeholder="Rechercher un client…" />
          </View>
          <Puces>
            {FILTRES_SUIVIS.map((f) => (
              <Puce key={f.cle} libelle={f.libelle} actif={filtre === f.cle} onPress={() => setFiltre(f.cle)} />
            ))}
          </Puces>
          <Selecteur libelle="Trier par" options={TRIS_SUIVIS} valeur={tri} onChange={setTri} />
        </View>
      )}
      <View style={{ marginTop: 20, gap: 8 }}>
        {!profils.donnee && !profils.erreur && [0, 1, 2].map((i) => <View key={i} style={{ height: 64, borderRadius: 12, backgroundColor: couleurs.discret }} />)}
        {profils.donnee?.length === 0 && <Text style={[ts.doux, { fontSize: 14 }]}>Aucun client actif. Un contact devient client depuis sa fiche.</Text>}
        {visibles && profils.donnee?.length !== 0 && visibles.length === 0 && <Text style={[ts.doux, { fontSize: 14 }]}>Aucun client pour ces filtres.</Text>}
        {visibles?.map((p) => (
          <ProfilSuivi key={p.clientId} coachId={coachId} p={p} modeles={modeles.donnee ?? null} recharger={recharger} onOuvrir={onOuvrirProgramme} onFiche={() => onOuvrirFiche(p.clientId)}
            onEntrainement={() => onOuvrirEntrainement(p.clientId)}
          />
        ))}
      </View>
    </View>
  );
}
