// MyWeekly.tsx d'origine (U07) : bilan de la semaine du client, synthèse automatique, priorité de la semaine suivante,
// brouillon gardé sur l'appareil par semaine, et bilans précédents.
import { CheckCircle2, MessageCircle, RefreshCw } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { suiviHebdo } from '@/data/suivi-hebdo';
import { formaterDate } from '@/domain/programmes';
import { erreurReponses, finSemaine, lundiCourant, SCORES, semainesProposees, TEXTES, type BilanHebdo, type ReponsesBilan } from '@/domain/suivi-hebdo';
import { brouillonsOuverts, demanderSortie, ecrireBrouillon, lireBrouillon } from '@/lib/brouillon';
import { nouvelId } from '@/lib/identifiant';
import { useCharger } from '@/lib/useCharger';

import { BoutonContour, Selecteur, TitreDisplay } from '../coque';
import { Cellule, Grille, Repliable, Saisie } from '../crm/dossier';
import { Action, Etat, ts } from '../entrainement/commun';
import { couleurs, polices } from '../theme';

type Formulaire = Record<keyof ReponsesBilan, string>;
const vide = (): Formulaire => ({ energie: '', sommeil: '', stress: '', motivation: '', seances: '', difficultes: '', douleurs: '', victoire: '' });
const depuis = (b?: BilanHebdo): Formulaire =>
  b ? (Object.fromEntries(Object.entries(b.reponses).map(([k, v]) => [k, String(v)])) as Formulaire) : vide();
const fmt = (d: string) => formaterDate(d.slice(0, 10));
const pluriel = (n: number) => (n > 1 ? 's' : '');
const OPTIONS_SCORE = [{ cle: '', libelle: 'Choisir un score' }, ...Array.from({ length: 10 }, (_, i) => ({ cle: String(i + 1), libelle: `${i + 1}/10` }))];
const LIBELLES_TEXTES = [
  ['difficultes', 'Difficultés'],
  ['douleurs', 'Douleurs ou gênes'],
  ['victoire', 'Réussite'],
] as const;

export function BilanSemaine({ clientId, apercu }: { clientId: string; apercu?: boolean }) {
  const { donnee: bilans, erreur: erreurChargement, recharger } = useCharger(() => suiviHebdo.bilansClient(clientId), clientId);
  const [semaine, setSemaine] = useState(lundiCourant);
  const [form, setForm] = useState<Formulaire>(vide);
  const [envoi, setEnvoi] = useState(nouvelId);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const verrou = useRef(false);

  const cle = `coachos-weekly:${clientId}:${semaine}`;
  const existant = bilans?.find((b) => b.semaine === semaine);
  const repondu = !!existant?.reponduLe && existant.sourceRetour !== 'Automatique';
  const aRetour = !!existant?.reponduLe;
  const charge = !!bilans;

  // Nouvelle semaine ou bilan rechargé : le formulaire repart des réponses enregistrées, puis du brouillon s'il existe.
  const signature = `${cle}|${charge}|${existant?.envoyeLe ?? ''}|${existant?.reponduLe ?? ''}`;
  const [vu, setVu] = useState('');
  if (vu !== signature) {
    setVu(signature);
    setForm(depuis(existant));
    setEnvoi(nouvelId());
  }
  const envoyeLe = existant?.envoyeLe;
  useEffect(() => {
    if (!charge) return;
    let annule = false;
    if (repondu) ecrireBrouillon(cle, null);
    else
      lireBrouillon<{ form: Formulaire; envoiId: string }>(cle).then((b) => {
        if (!b || annule) return;
        setForm((f) => ({ ...f, ...b.form }));
        setEnvoi(b.envoiId);
        ecrireBrouillon(cle, b);
      });
    return () => {
      annule = true;
      brouillonsOuverts.delete(cle);
    };
  }, [cle, charge, repondu, envoyeLe]);

  const changer = (suite: Formulaire) => {
    setForm(suite);
    setMessage('');
    ecrireBrouillon(cle, { form: suite, envoiId: envoi });
  };

  const enregistrer = async () => {
    if (verrou.current || apercu) return;
    verrou.current = true;
    setOccupe(true);
    setErreur('');
    setMessage('');
    try {
      const n = (k: keyof Formulaire) => Number(form[k].replace(',', '.'));
      const reponses: ReponsesBilan = {
        energie: n('energie'),
        sommeil: n('sommeil'),
        stress: n('stress'),
        motivation: n('motivation'),
        seances: n('seances'),
        difficultes: form.difficultes,
        douleurs: form.douleurs,
        victoire: form.victoire,
      };
      const manque = SCORES.some(([k]) => !form[k]) || !form.seances.trim();
      const probleme = manque ? 'Complétez les quatre scores et le nombre de séances réalisées.' : erreurReponses(reponses);
      if (probleme) throw new Error(probleme);
      await suiviHebdo.enregistrerBilan(clientId, semaine, envoi, reponses);
      ecrireBrouillon(cle, null);
      setEnvoi(nouvelId());
      recharger();
      setMessage('Bilan enregistré. Votre synthèse automatique et votre priorité sont disponibles.');
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Envoi impossible');
    } finally {
      verrou.current = false;
      setOccupe(false);
    }
  };

  const victoire = existant?.reponses.victoire.trim().replace(/\s+/g, ' ') || '';
  const victoireCourte = victoire.length > 75 ? victoire.slice(0, 72).replace(/\s+\S*$/, '') + '…' : victoire;
  const enBref = victoireCourte
    ? `Votre réussite : « ${victoireCourte} »`
    : existant?.reponses.seances
      ? 'Chaque séance compte : continuez à votre rythme.'
      : 'Votre bilan est un premier pas pour préparer la suite.';

  return (
    <View style={{ gap: 20 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <Text style={ts.kicker}>Votre rendez-vous de suivi</Text>
          <TitreDisplay taille={30} style={{ marginTop: 4 }}>
            Mon bilan de la semaine
          </TitreDisplay>
          <Text style={[ts.texte, { marginTop: 8, color: couleurs.texteDoux }]}>
            Deux minutes pour partager votre semaine : votre synthèse et votre priorité sont générées automatiquement.
          </Text>
        </View>
        <BoutonContour icone={RefreshCw} nom="Actualiser les bilans" desactive={occupe} onPress={() => demanderSortie(recharger, [cle])} />
      </View>

      <Etat erreur={erreur || erreurChargement || undefined} message={message} />

      {!bilans && !erreurChargement && <Text style={ts.doux}>Chargement du bilan…</Text>}
      {bilans && (
        <>
          <Selecteur
            libelle="Semaine concernée"
            options={semainesProposees().map((w) => ({ cle: w, libelle: `Du ${fmt(w)} au ${fmt(finSemaine(w))}` }))}
            valeur={semaine}
            onChange={(w) =>
              demanderSortie(() => {
                setSemaine(w);
                setMessage('');
              }, [cle])
            }
          />

          {existant && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CheckCircle2 size={16} color={couleurs.texteDoux} />
              <Text style={[ts.texte, { color: couleurs.texteDoux, flexShrink: 1 }]}>
                {repondu ? 'Votre coach a répondu.' : aRetour ? 'Synthèse automatique disponible.' : 'Bilan transmis · en attente du retour.'}
              </Text>
            </View>
          )}

          {existant && aRetour && (
            <View style={{ borderRadius: 16, borderWidth: 1, borderColor: 'rgba(195,24,30,0.25)', backgroundColor: 'rgba(195,24,30,0.05)', padding: 20, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MessageCircle size={20} color={couleurs.rouge} />
                <Text style={[ts.titre, { flexShrink: 1 }]}>{existant.sourceRetour === 'Automatique' ? 'Votre synthèse automatique' : 'Le retour de votre coach'}</Text>
              </View>
              {existant.sourceRetour === 'Automatique' && (
                <Text style={ts.doux}>Générée à partir de vos réponses et de règles de suivi. Votre coach peut la compléter.</Text>
              )}
              <Text selectable style={ts.texte}>
                {existant.retourCoach}
              </Text>
              <View style={{ borderRadius: 12, backgroundColor: couleurs.carte, padding: 16, gap: 8 }}>
                <Text style={ts.kicker}>Votre priorité pour la semaine suivante</Text>
                <Text selectable style={ts.texte}>
                  {existant.priorite}
                </Text>
              </View>
              <Text style={ts.doux}>Publié le {fmt(existant.reponduLe)}</Text>
            </View>
          )}

          {!repondu && !apercu && (
            <View style={ts.carte}>
              <Grille>
                {SCORES.map(([k, libelle, aide]) => (
                  <Cellule key={k}>
                    <Text style={ts.titreChamp}>{libelle}</Text>
                    <Text style={[ts.doux, { marginTop: 2, marginBottom: 8 }]}>{aide}</Text>
                    <Selecteur libelle={libelle} sansLibelle options={OPTIONS_SCORE} valeur={form[k]} onChange={(v) => changer({ ...form, [k]: v })} />
                  </Cellule>
                ))}
              </Grille>
              <Saisie
                libelle="Séances réalisées cette semaine"
                type="nombre"
                valeur={form.seances}
                desactive={occupe}
                onChange={(v) => changer({ ...form, seances: v })}
              />
              {TEXTES.map(([k, libelle, placeholder, max]) => (
                <Saisie key={k} long libelle={libelle} placeholder={placeholder} max={max} valeur={form[k]} desactive={occupe} onChange={(v) => changer({ ...form, [k]: v })} />
              ))}
              <Action
                libelle={occupe ? 'Envoi…' : existant ? 'Mettre à jour mon bilan' : 'Enregistrer et générer mon bilan'}
                chargement={occupe}
                onPress={enregistrer}
              />
              <Text style={ts.doux}>Modifier vos réponses met à jour la synthèse automatique. Le bilan est conservé après un retour publié par votre coach.</Text>
            </View>
          )}

          {existant && (
            <View
              accessibilityLabel="Votre semaine en bref"
              style={{ borderLeftWidth: 2, borderLeftColor: couleurs.rouge, backgroundColor: 'rgba(195,24,30,0.05)', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, gap: 4 }}
            >
              <Text numberOfLines={1} style={[ts.texte, { fontFamily: polices.texteGras }]}>
                Cette semaine : {existant.reponses.seances} séance{pluriel(existant.reponses.seances)} réalisée{pluriel(existant.reponses.seances)}.
              </Text>
              <Text numberOfLines={1} style={[ts.texte, { color: couleurs.texteDoux }]}>
                {enBref}
              </Text>
            </View>
          )}

          <Repliable
            resume={<Text style={ts.titre}>Mes bilans précédents ({bilans.length})</Text>}
            style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 16, backgroundColor: couleurs.carte, padding: 20 }}
          >
            <View style={{ gap: 16 }}>
              {bilans.map((b) => (
                <View key={b.id} style={{ borderWidth: 1, borderColor: couleurs.bordure, borderRadius: 12, padding: 16, gap: 8 }}>
                  <Text style={[ts.texte, { fontFamily: polices.texteGras }]}>Semaine du {fmt(b.semaine)}</Text>
                  <Text style={ts.doux}>
                    {b.reponduLe ? (b.sourceRetour === 'Automatique' ? 'Synthèse automatique' : 'Retour du coach disponible') : 'En attente du retour'} ·{' '}
                    {b.reponses.seances} séance{pluriel(b.reponses.seances)}
                  </Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
                    {SCORES.map(([k, l]) => (
                      <View key={k} style={{ width: '50%' }}>
                        <Text style={ts.doux}>{l}</Text>
                        <Text style={[ts.texte, { fontSize: 12 }]}>{b.reponses[k]}/10</Text>
                      </View>
                    ))}
                  </View>
                  {LIBELLES_TEXTES.filter(([k]) => b.reponses[k]).map(([k, l]) => (
                    <Text key={k} selectable style={ts.texte}>
                      <Text style={{ fontFamily: polices.texteGras }}>{l} : </Text>
                      {b.reponses[k]}
                    </Text>
                  ))}
                  {!!b.reponduLe && (
                    <View style={{ borderRadius: 8, backgroundColor: 'rgba(195,24,30,0.05)', padding: 12, gap: 12 }}>
                      <Text selectable style={ts.texte}>
                        <Text style={{ fontFamily: polices.texteGras }}>{b.sourceRetour === 'Automatique' ? 'Synthèse automatique : ' : 'Votre coach : '}</Text>
                        {b.retourCoach}
                      </Text>
                      <Text selectable style={ts.texte}>
                        <Text style={{ fontFamily: polices.texteGras }}>Priorité : </Text>
                        {b.priorite}
                      </Text>
                    </View>
                  )}
                </View>
              ))}
              {!bilans.length && <Text style={[ts.texte, { color: couleurs.texteDoux }]}>Votre premier bilan apparaîtra ici après son envoi.</Text>}
            </View>
          </Repliable>
        </>
      )}
    </View>
  );
}
