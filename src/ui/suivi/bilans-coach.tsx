// WeeklyCoach.tsx d'origine (C16) : file des bilans hebdomadaires des clients, à vérifier d'abord, et retour du coach
// publié dans l'espace client. Le brouillon de retour reste sur l'appareil et retient la version des réponses lues.
import { MessageCircle, RefreshCw } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { suiviHebdo } from '@/data/suivi-hebdo';
import { formaterDate } from '@/domain/programmes';
import { aVerifier, type BilanHebdo } from '@/domain/suivi-hebdo';
import { brouillonsOuverts, demanderSortie, ecrireBrouillon, lireBrouillon } from '@/lib/brouillon';
import { useCharger } from '@/lib/useCharger';

import { BoutonContour, TitreDisplay } from '../coque';
import { Recherche, Saisie } from '../crm/dossier';
import { Action, Etat, Ligne, ts } from '../entrainement/commun';
import { couleurs, polices } from '../theme';

const SCORES = [
  ['energie', 'Énergie'],
  ['sommeil', 'Sommeil'],
  ['stress', 'Stress'],
  ['motivation', 'Motivation'],
] as const;
const TEXTES = [
  ['difficultes', 'Difficultés'],
  ['douleurs', 'Douleurs ou gênes'],
  ['victoire', 'Réussite de la semaine'],
] as const;
const fmt = (d: string) => formaterDate(d.slice(0, 10));

function CarteBilan({ b, onEnregistre }: { b: BilanHebdo; onEnregistre: () => void }) {
  const cle = `coachos-retour-hebdo:${b.id}`;
  const [message, setMessage] = useState(b.retourCoach);
  const [priorite, setPriorite] = useState(b.priorite);
  const [version, setVersion] = useState(b.envoyeLe);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [publie, setPublie] = useState(false);
  const verrou = useRef(false);

  // Bilan modifié ou retour publié : on repart du bilan, puis du brouillon s'il existe.
  const signature = `${b.envoyeLe}|${b.reponduLe}`;
  const [vu, setVu] = useState(signature);
  if (vu !== signature) {
    setVu(signature);
    setMessage(b.retourCoach);
    setPriorite(b.priorite);
    setVersion(b.envoyeLe);
  }
  const envoyeLe = b.envoyeLe;
  useEffect(() => {
    let annule = false;
    lireBrouillon<{ message: string; priorite: string; version: string }>(cle).then((d) => {
      if (!d || annule) return;
      setMessage(d.message);
      setPriorite(d.priorite);
      setVersion(d.version || envoyeLe);
      ecrireBrouillon(cle, d);
    });
    return () => {
      annule = true;
      brouillonsOuverts.delete(cle);
    };
  }, [cle, signature, envoyeLe]);

  const brouillon = (m: string, p: string) => {
    setMessage(m);
    setPriorite(p);
    setPublie(false);
    ecrireBrouillon(cle, { message: m, priorite: p, version });
  };

  const publier = async () => {
    if (verrou.current) return;
    verrou.current = true;
    setOccupe(true);
    setErreur('');
    setPublie(false);
    try {
      await suiviHebdo.repondreBilan(b.id, message, priorite, version);
      ecrireBrouillon(cle, null);
      onEnregistre();
      setPublie(true);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Publication impossible');
    } finally {
      setOccupe(false);
      verrou.current = false;
    }
  };

  const traite = !b.aRevoir && !!b.reponduLe;
  const pastille = b.aRevoir ? 'À vérifier' : b.sourceRetour === 'Automatique' ? 'Automatique' : b.reponduLe ? 'Répondu' : 'À répondre';
  const s = b.reponses.seances > 1 ? 's' : '';

  return (
    <View style={[ts.carte, { borderRadius: 16 }]}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text style={ts.titre}>{b.nom}</Text>
          <Text style={[ts.doux, { marginTop: 4 }]}>
            Semaine du {fmt(b.semaine)} · {b.reponses.seances} séance{s}
          </Text>
        </View>
        <View style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: traite ? couleurs.discret : 'rgba(195,24,30,0.1)' }}>
          <Text style={[ts.doux, { color: traite ? couleurs.texteDoux : couleurs.rouge }]}>{pastille}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {SCORES.map(([k, l]) => (
          <View key={k} style={{ flexGrow: 1, flexBasis: 120, borderRadius: 12, backgroundColor: couleurs.discret, padding: 12 }}>
            <Text style={ts.doux}>{l}</Text>
            <Text style={[ts.texte, { fontSize: 18, fontFamily: polices.texteGras, marginTop: 4 }]}>
              {b.reponses[k]}
              <Text style={{ fontSize: 12, fontFamily: polices.texte }}>/10</Text>
            </Text>
          </View>
        ))}
      </View>
      <Text style={ts.doux}>Énergie, sommeil et motivation : 10 = élevé / bon. Stress : 10 = très élevé.</Text>
      {TEXTES.map(([k, l]) => (
        <View key={k} style={{ gap: 4 }}>
          <Text style={ts.titreSection}>{l}</Text>
          <Text selectable style={ts.texte}>
            {b.reponses[k] || 'Non renseigné'}
          </Text>
        </View>
      ))}
      {b.sourceRetour === 'Automatique' && (
        <View style={{ borderRadius: 8, backgroundColor: 'rgba(195,24,30,0.05)', padding: 12 }}>
          <Text style={[ts.texte, { fontSize: 12 }]}>
            Synthèse et priorité générées automatiquement, déjà visibles par le client. Vous pouvez les compléter ou les remplacer.
          </Text>
        </View>
      )}
      <View style={{ borderTopWidth: 1, borderTopColor: couleurs.bordure, paddingTop: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <MessageCircle size={16} color={couleurs.rouge} />
          <Text style={[ts.titreChamp, { fontFamily: polices.texteGras }]}>Votre retour au client</Text>
        </View>
        {version !== b.envoyeLe && (
          <View style={{ borderRadius: 8, borderWidth: 1, borderColor: couleurs.bordure, padding: 12, gap: 8 }}>
            <Text style={ts.texte}>Le client a modifié ses réponses depuis la préparation de votre retour. Relisez-les avant de publier.</Text>
            <View style={{ alignSelf: 'flex-start' }}>
              <Action
                petit
                variante="contour"
                libelle="J’ai relu les nouvelles réponses"
                onPress={() => {
                  setVersion(b.envoyeLe);
                  ecrireBrouillon(cle, { message, priorite, version: b.envoyeLe });
                }}
              />
            </View>
          </View>
        )}
        <Saisie
          long
          libelle="Message"
          max={4000}
          placeholder="Votre retour sur sa semaine et ce que vous souhaitez lui transmettre…"
          valeur={message}
          desactive={occupe}
          onChange={(m) => brouillon(m, priorite)}
        />
        <Saisie
          long
          libelle="Priorité pour la semaine suivante"
          max={1000}
          placeholder="Une priorité concrète pour la semaine suivante…"
          valeur={priorite}
          desactive={occupe}
          onChange={(p) => brouillon(message, p)}
        />
        <Text style={ts.doux}>Vos modifications restent en brouillon sur cet appareil. Elles seront visibles par le client après publication.</Text>
        <Etat erreur={erreur || undefined} message={publie ? 'Retour publié dans l’espace du client.' : undefined} />
        <View style={{ alignSelf: 'flex-start' }}>
          <Action
            libelle={
              occupe
                ? 'Publication…'
                : b.sourceRetour === 'Automatique'
                  ? 'Publier mon retour de coach'
                  : b.reponduLe
                    ? 'Mettre à jour le retour publié'
                    : 'Publier le retour pour le client'
            }
            chargement={occupe}
            desactive={version !== b.envoyeLe || !message.trim() || !priorite.trim()}
            onPress={publier}
          />
        </View>
        {!!b.reponduLe && <Text style={ts.doux}>Dernière publication : {fmt(b.reponduLe)}</Text>}
      </View>
    </View>
  );
}

export function BilansCoach() {
  const { donnee, erreur, recharger } = useCharger(() => suiviHebdo.bilansCoach(), 'bilans-hebdo');
  const [filtre, setFiltre] = useState<'pending' | 'all'>('all');
  const [recherche, setRecherche] = useState('');
  const aTraiter = donnee?.filter(aVerifier).length ?? 0;
  const lignes = (donnee ?? []).filter((b) => (filtre === 'all' || aVerifier(b)) && b.nom.toLowerCase().includes(recherche.toLowerCase()));

  return (
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text style={ts.kicker}>Continuité du coaching</Text>
          <TitreDisplay taille={30} style={{ marginTop: 4 }}>
            Bilans hebdomadaires
          </TitreDisplay>
          <Text style={[ts.texte, { marginTop: 8, color: couleurs.texteDoux }]}>
            Synthèses et priorités générées automatiquement à l’envoi du client. {aTraiter} bilan{aTraiter > 1 ? 's' : ''} à vérifier.
          </Text>
        </View>
        <BoutonContour icone={RefreshCw} nom="Actualiser les bilans hebdomadaires" onPress={() => demanderSortie(recharger)} />
      </View>
      <Ligne>
        {(
          [
            { id: 'pending', libelle: 'À vérifier' },
            { id: 'all', libelle: 'Tous les bilans' },
          ] as const
        ).map((t) => (
          <Action key={t.id} variante={filtre === t.id ? 'plein' : 'contour'} libelle={t.libelle} onPress={() => demanderSortie(() => setFiltre(t.id))} />
        ))}
      </Ligne>
      <View style={{ gap: 8 }}>
        <Text style={ts.doux}>Rechercher un client</Text>
        <Recherche libelle="Rechercher un client" placeholder="" valeur={recherche} onChange={(v) => demanderSortie(() => setRecherche(v))} />
      </View>
      <Etat erreur={erreur || undefined} />
      {!donnee && !erreur ? (
        <Text style={ts.texte}>Chargement des bilans…</Text>
      ) : (
        <View style={{ gap: 20 }}>
          {lignes.map((b) => (
            <CarteBilan key={b.id} b={b} onEnregistre={recharger} />
          ))}
          {!lignes.length && donnee && (
            <View style={{ borderRadius: 16, borderWidth: 1, borderStyle: 'dashed', borderColor: couleurs.bordure, backgroundColor: couleurs.carte, padding: 32, gap: 8 }}>
              <Text style={[ts.titre, { textAlign: 'center' }]}>{filtre === 'pending' ? 'Aucun bilan à vérifier' : 'Aucun bilan trouvé'}</Text>
              <Text style={[ts.texte, { textAlign: 'center', color: couleurs.texteDoux }]}>Les bilans transmis depuis l’espace client apparaissent ici.</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}
