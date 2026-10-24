// MyGoals.tsx d'origine (U10) : objectifs personnels du client, progression calculée à partir de ses valeurs,
// archivage, et « Mes petites victoires » tirées des réussites racontées dans le bilan de la semaine.
import { RefreshCw, Target, Trophy } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { suiviHebdo } from '@/data/suivi-hebdo';
import { ecrireJour, lireJour } from '@/domain/crm';
import { aujourdhuiParis } from '@/domain/entrainement';
import { lireObjectif, UNITES_OBJECTIF, type UniteObjectif } from '@/domain/suivi-hebdo';
import { brouillonsOuverts, ecrireBrouillon, lireBrouillon } from '@/lib/brouillon';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { BoutonContour, Selecteur } from '../coque';
import { Repliable, Saisie } from '../crm/dossier';
import { Action, Etat, ts } from '../entrainement/commun';
import { couleurs, polices } from '../theme';

type Formulaire = { titre: string; unite: UniteObjectif; depart: string; cible: string; echeance: string; envoiId: string };
type Brouillon = { valeur: string; version: string; envoiId: string };
type Lu = ReturnType<typeof lireObjectif>;

const initial = (): Formulaire => ({ titre: '', unite: 'kg', depart: '', cible: '', echeance: '', envoiId: nouvelId() });
const fmt = (d: string) =>
  new Date(d.includes('T') ? d : `${d}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Paris' });
const num = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const nombre = (t: string) => Number(t.replace(',', '.').trim());

async function charger(clientId: string) {
  const [objectifs, bilans] = await Promise.all([suiviHebdo.objectifs(clientId), suiviHebdo.bilansClient(clientId)]);
  const victoires = bilans.filter((b) => b.reponses.victoire.trim()).map((b) => ({ id: b.id, semaine: b.semaine, texte: b.reponses.victoire.trim() }));
  return { objectifs: objectifs.map(lireObjectif), victoires };
}

export function Objectifs({ clientId, apercu }: { clientId: string; apercu?: boolean }) {
  const cle = `coachos-goals:${clientId}`;
  const { donnee, erreur: erreurChargement, recharger } = useCharger(() => charger(clientId), clientId);
  const [form, setForm] = useState<Formulaire>(initial);
  const [brouillons, setBrouillons] = useState<Record<string, Brouillon>>({});
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const verrou = useRef(false);

  useEffect(() => {
    let annule = false;
    lireBrouillon<{ form: Formulaire; drafts: Record<string, Brouillon> }>(cle).then((b) => {
      if (!b || annule) return;
      setForm(b.form || initial());
      setBrouillons(b.drafts || {});
      ecrireBrouillon(cle, b);
    });
    return () => {
      annule = true;
      brouillonsOuverts.delete(cle);
    };
  }, [cle]);

  /** Garde le formulaire et les valeurs en cours sur l'appareil tant qu'il reste quelque chose de saisi. */
  const garder = (f: Formulaire, d: Record<string, Brouillon>) => {
    const sale = !!f.titre || !!f.depart || !!f.cible || !!f.echeance || Object.keys(d).length > 0;
    ecrireBrouillon(cle, sale ? { form: f, drafts: d } : null);
  };
  const changer = (patch: Partial<Formulaire>) => {
    const suite = { ...form, ...patch };
    setForm(suite);
    setMessage('');
    garder(suite, brouillons);
  };
  const changerValeur = (g: Lu, valeur: string) => {
    const avant = brouillons[g.id];
    const suite = { ...brouillons, [g.id]: { valeur, version: avant?.version || g.modifieLe, envoiId: avant?.envoiId || nouvelId() } };
    setBrouillons(suite);
    setMessage('');
    garder(form, suite);
  };

  const enregistrer = async (action: 'creer' | 'progresser' | 'archiver' | 'restaurer', g?: Lu) => {
    if (verrou.current || apercu) return;
    verrou.current = true;
    setOccupe(true);
    setErreur('');
    setMessage('');
    try {
      if (action === 'creer') {
        if (!form.depart.trim() || !form.cible.trim()) throw new Error('Renseignez le départ et la cible');
        const echeance = form.echeance.trim() ? lireJour(form.echeance) : '';
        if (echeance === undefined) throw new Error('Échéance invalide');
        await suiviHebdo.enregistrerObjectif(clientId, form.envoiId, {
          action,
          objectif: { titre: form.titre, unite: form.unite, depart: nombre(form.depart), cible: nombre(form.cible), echeance },
        });
        const vide = initial();
        setForm(vide);
        garder(vide, brouillons);
      } else if (g) {
        const d = brouillons[g.id];
        if (action === 'progresser') {
          if (!d || !d.valeur.trim()) throw new Error('Renseignez votre valeur actuelle');
          await suiviHebdo.enregistrerObjectif(clientId, d.envoiId, { action, valeur: nombre(d.valeur), version: d.version }, g.id);
        } else await suiviHebdo.enregistrerObjectif(clientId, nouvelId(), { action, version: g.modifieLe }, g.id);
        const suite = { ...brouillons };
        delete suite[g.id];
        setBrouillons(suite);
        garder(form, suite);
      }
      recharger();
      setMessage(
        action === 'creer' ? 'Objectif ajouté.' : action === 'progresser' ? 'Progression enregistrée.' : action === 'archiver' ? 'Objectif archivé.' : 'Objectif réactivé.',
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Enregistrement impossible');
    } finally {
      verrou.current = false;
      setOccupe(false);
    }
  };

  const tous = donnee?.objectifs ?? [];
  const actifs = tous.filter((g) => !g.archive && !g.atteint);
  const atteints = tous.filter((g) => !g.archive && g.atteint);
  const archives = tous.filter((g) => g.archive);
  const carte = (g: Lu) => (
    <CarteObjectif
      key={g.id}
      g={g}
      occupe={occupe}
      apercu={apercu}
      valeur={brouillons[g.id]?.valeur ?? ''}
      onValeur={(v) => changerValeur(g, v)}
      onEnregistrer={() => enregistrer('progresser', g)}
      onArchiver={() => enregistrer(g.archive ? 'restaurer' : 'archiver', g)}
    />
  );

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
            <Target size={20} color={couleurs.rouge} />
            <Text accessibilityRole="header" style={[ts.titre, { fontSize: 18 }]}>
              Mes objectifs
            </Text>
          </View>
          <BoutonContour icone={RefreshCw} nom="Actualiser les objectifs" desactive={occupe} onPress={recharger} />
        </View>
        <Text style={[ts.texte, { color: couleurs.texteDoux }]}>
          Fixez une cible qui vous motive, puis renseignez vos progrès. La barre et le statut « Atteint » se calculent automatiquement à partir de vos valeurs.
        </Text>
      </View>

      <Etat erreur={erreur || erreurChargement || undefined} message={message} />

      {!donnee && !erreurChargement && <Text style={ts.doux}>Chargement…</Text>}
      {donnee && (
        <>
          <View style={{ gap: 16 }}>
            {actifs.length ? (
              actifs.map(carte)
            ) : (
              <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: couleurs.bordure, borderRadius: 12, padding: 20 }}>
                <Text style={[ts.texte, { color: couleurs.texteDoux }]}>Aucun objectif en cours. Ajoutez votre prochaine cible ci-dessous.</Text>
              </View>
            )}
          </View>
          {atteints.length > 0 && (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Trophy size={16} color={couleurs.rouge} />
                <Text style={ts.titre}>
                  {atteints.length} objectif{atteints.length > 1 ? 's' : ''} atteint{atteints.length > 1 ? 's' : ''}
                </Text>
              </View>
              <View style={{ gap: 16 }}>{atteints.map(carte)}</View>
            </View>
          )}
        </>
      )}

      {!apercu && (
        <Repliable
          resume={<Text style={ts.titre}>Ajouter un objectif</Text>}
          style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 16, backgroundColor: couleurs.carte, padding: 16 }}
        >
          <View style={{ gap: 16 }}>
            <Saisie libelle="Mon objectif" max={120} placeholder="Ex. courir 5 km sans pause" valeur={form.titre} desactive={occupe} onChange={(titre) => changer({ titre })} />
            <Selecteur libelle="Unité" options={UNITES_OBJECTIF.map((u) => ({ cle: u, libelle: u }))} valeur={form.unite} onChange={(unite) => changer({ unite })} />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              {(['depart', 'cible'] as const).map((champ) => (
                <View key={champ} style={{ flex: 1, minWidth: 0 }}>
                  <Saisie
                    libelle={`${champ === 'depart' ? 'Point de départ' : 'Cible'} (${form.unite})`}
                    type="nombre"
                    valeur={form[champ]}
                    desactive={occupe}
                    onChange={(v) => changer({ [champ]: v })}
                  />
                </View>
              ))}
            </View>
            <Saisie
              libelle="Échéance (facultatif)"
              placeholder="jj/mm/aaaa"
              aide={`À partir du ${ecrireJour(aujourdhuiParis())}`}
              valeur={form.echeance}
              desactive={occupe}
              onChange={(echeance) => changer({ echeance })}
            />
            <Action libelle={occupe ? 'Enregistrement…' : 'Créer mon objectif'} chargement={occupe} onPress={() => enregistrer('creer')} />
          </View>
        </Repliable>
      )}

      {archives.length > 0 && (
        <Repliable resume={`Objectifs archivés (${archives.length})`}>
          <View style={{ gap: 12 }}>{archives.map(carte)}</View>
        </Repliable>
      )}

      <View style={[ts.carte, { padding: 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Trophy size={20} color={couleurs.rouge} />
          <Text accessibilityRole="header" style={ts.titre}>
            Mes petites victoires
          </Text>
        </View>
        <Text style={ts.doux}>Retrouvez ici les réussites que vous racontez dans « Bilan semaine ».</Text>
        {donnee?.victoires.length ? (
          <View style={{ gap: 16 }}>
            {donnee.victoires.map((v) => (
              <View key={v.id} style={{ borderLeftWidth: 2, borderLeftColor: couleurs.rouge, paddingLeft: 12, gap: 4 }}>
                <Text style={ts.doux}>Semaine du {fmt(v.semaine)}</Text>
                <Text selectable style={ts.texte}>
                  {v.texte}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[ts.texte, { color: couleurs.texteDoux }]}>Votre prochaine victoire mérite sa place ici.</Text>
        )}
      </View>
    </View>
  );
}

function CarteObjectif({
  g,
  occupe,
  apercu,
  valeur,
  onValeur,
  onEnregistrer,
  onArchiver,
}: {
  g: Lu;
  occupe: boolean;
  apercu?: boolean;
  valeur: string;
  onValeur: (v: string) => void;
  onEnregistrer: () => void;
  onArchiver: () => void;
}) {
  const pourcent = Math.round(g.progression);
  return (
    <View style={[ts.carte, { padding: 16, gap: 8, borderRadius: 16 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <Text style={[ts.titre, { flexShrink: 1 }]}>{g.titre}</Text>
        {g.atteint && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Trophy size={16} color={couleurs.rouge} />
            <Text style={[ts.doux, { fontFamily: polices.texteGras, color: couleurs.rouge }]}>Atteint</Text>
          </View>
        )}
      </View>
      <Text style={ts.texte}>
        <Text style={{ fontFamily: polices.texteGras }}>
          {num(g.actuel)} {g.unite}
        </Text>
        <Text style={{ color: couleurs.texteDoux }}>
          {' '}
          / cible {num(g.cible)} {g.unite}
        </Text>
      </Text>
      <Text style={ts.doux}>
        Départ : {num(g.depart)} {g.unite}
        {g.echeance ? ` · Échéance : ${fmt(g.echeance)}` : ''}
      </Text>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`Progression : ${g.titre}`}
        accessibilityValue={{ min: 0, max: 100, now: pourcent }}
        style={{ height: 8, borderRadius: 999, overflow: 'hidden', backgroundColor: 'rgba(195,24,30,0.1)' }}
      >
        <View style={{ height: '100%', width: `${g.progression}%`, borderRadius: 999, backgroundColor: couleurs.rouge }} />
      </View>
      <Text style={[ts.doux, { textAlign: 'right' }]}>{pourcent} %</Text>
      {!!g.atteintLe && <Text style={[ts.doux, { color: couleurs.rouge }]}>Objectif atteint le {fmt(g.atteintLe)}</Text>}
      {!g.atteint && !g.archive && !!g.echeance && g.echeance < aujourdhuiParis() && (
        <Text style={ts.doux}>Échéance passée · vous pouvez continuer à suivre votre progression.</Text>
      )}
      {!g.archive && !apercu && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8, marginTop: 8 }}>
          <View style={{ flex: 1, minWidth: 160 }}>
            <Saisie
              libelle={`${g.atteint ? 'Corriger ou actualiser ma valeur' : 'Ma valeur actuelle'} (${g.unite})`}
              type="nombre"
              placeholder={String(g.actuel)}
              valeur={valeur}
              desactive={occupe}
              onChange={onValeur}
            />
          </View>
          <Action libelle="Enregistrer" desactive={occupe} onPress={onEnregistrer} />
        </View>
      )}
      <Repliable resume={`Historique des valeurs (${g.historique.length})`} style={{ marginTop: 8 }}>
        <View style={{ gap: 8, maxHeight: 192, overflow: 'scroll' as never }}>
          {[...g.historique].reverse().map((h) => (
            <View key={h.envoiId} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderBottomColor: couleurs.bordure, paddingBottom: 8 }}>
              <Text style={[ts.texte, { fontSize: 12 }]}>{fmt(h.date)}</Text>
              <Text style={[ts.texte, { fontSize: 12, fontFamily: polices.texteGras }]}>
                {num(h.valeur)} {g.unite}
              </Text>
            </View>
          ))}
        </View>
      </Repliable>
      {!apercu && (
        <View style={{ alignSelf: 'flex-start' }}>
          <Action petit variante="fantome" libelle={g.archive ? 'Réactiver cet objectif' : 'Archiver cet objectif'} desactive={occupe} onPress={onArchiver} />
        </View>
      )}
    </View>
  );
}

