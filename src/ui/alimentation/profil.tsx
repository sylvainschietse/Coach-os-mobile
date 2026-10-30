import { useState } from 'react';
import { View } from 'react-native';

import { depot } from '@/data';
import { alimentation } from '@/data/alimentation';
import { calculerBesoins, NIVEAUX_ACTIVITE, OBJECTIFS, REGIMES } from '@/domain/alimentation';
import { jourLocal } from '@/domain/crm';
import { formaterDate, lireDate } from '@/domain/programmes';
import { formaterNombre, lireNombre } from '@/domain/suivi';
import type { NiveauActivite, ObjectifNutrition, ProfilNutrition, Regime, Sexe } from '@/domain/types';
import { useCharger } from '@/lib/useCharger';

import { Bouton, Carte, Chargement, ChampTexte, Erreur, Puce, Puces, SousTitre, Texte } from '../composants';
import { couleurs, espace } from '../theme';
import { libelleRegime } from './commun';

/** Profil et dernière pesée du client, pour calculer ses besoins. */
export async function chargerProfil(clientId: string) {
  const [profil, mesures] = await Promise.all([alimentation.profil(clientId), depot.mensurations(clientId)]);
  const pesee = mesures.find((m) => m.poidsKg !== undefined);
  return { profil, dernierPoids: pesee?.poidsKg, dateDernierPoids: pesee?.date };
}

export function Besoins({ profil, dernierPoids }: { profil: ProfilNutrition | null; dernierPoids?: number }) {
  const r = calculerBesoins(profil, jourLocal(new Date()), dernierPoids);
  if (!r.besoins) {
    return <Texte doux style={{ fontSize: 14 }}>Pour calculer les besoins, il manque : {r.manque.join(', ')}.</Texte>;
  }
  const b = r.besoins;
  return (
    <View style={{ gap: espace(2) }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espace(4) }}>
        {(
          [
            ['Calories', b.kcal, 'kcal'],
            ['Protéines', b.proteines, 'g'],
            ['Glucides', b.glucides, 'g'],
            ['Lipides', b.lipides, 'g'],
            ['Eau', b.eauL, 'L'],
          ] as const
        ).map(([libelle, valeur, unite]) => (
          <View key={libelle} style={{ minWidth: 80, gap: espace(0.5) }}>
            <Texte doux style={{ fontSize: 12 }}>{libelle}</Texte>
            <Texte style={{ fontSize: 20, fontWeight: '600' }}>
              {formaterNombre(valeur)} <Texte doux style={{ fontSize: 14 }}>{unite}</Texte>
            </Texte>
          </View>
        ))}
      </View>
      <Texte doux style={{ fontSize: 13 }}>
        Métabolisme de base {formaterNombre(b.metabolisme)} kcal, dépense estimée {formaterNombre(b.depense)} kcal par jour (formule de
        Mifflin-St Jeor, poids {formaterNombre(b.poidsKg)} kg). C’est un point de départ : ton coach l’ajuste selon tes résultats.
      </Texte>
    </View>
  );
}

/** Le profil nutrition : rempli par le client (ou par le coach), il donne les besoins calculés. */
export function ProfilNutritionCarte({ clientId, onEnregistre }: { clientId: string; onEnregistre?: () => void }) {
  const { donnee, erreur, recharger } = useCharger(() => chargerProfil(clientId), `profil-${clientId}`);
  if (erreur) return <Erreur message={erreur} onReessayer={recharger} />;
  if (!donnee) return <Chargement />;
  return (
    <FormulaireProfil
      key={donnee.profil?.majLe ?? 'nouveau'}
      clientId={clientId}
      profil={donnee.profil}
      dernierPoids={donnee.dernierPoids}
      dateDernierPoids={donnee.dateDernierPoids}
      onEnregistre={() => (recharger(), onEnregistre?.())}
    />
  );
}

function FormulaireProfil({
  clientId,
  profil,
  dernierPoids,
  dateDernierPoids,
  onEnregistre,
}: {
  clientId: string;
  profil: ProfilNutrition | null;
  dernierPoids?: number;
  dateDernierPoids?: string;
  onEnregistre: () => void;
}) {
  const [sexe, setSexe] = useState<Sexe | undefined>(profil?.sexe);
  const [naissance, setNaissance] = useState(profil?.naissance ? formaterDate(profil.naissance) : '');
  const [taille, setTaille] = useState(profil?.tailleCm ? String(profil.tailleCm) : '');
  const [poids, setPoids] = useState(profil?.poidsKg ? String(profil.poidsKg).replace('.', ',') : '');
  const [activite, setActivite] = useState<NiveauActivite | undefined>(profil?.activite);
  const [objectif, setObjectif] = useState<ObjectifNutrition | undefined>(profil?.objectif);
  const [regimes, setRegimes] = useState<Regime[]>(profil?.regimes ?? []);
  const [exclusions, setExclusions] = useState(profil?.exclusions ?? '');
  const [erreurs, setErreurs] = useState<string[]>([]);
  const [enCours, setEnCours] = useState(false);
  const [ok, setOk] = useState(false);

  const aujourdhui = jourLocal(new Date());
  const lireNaissance = () => (/\d{4}$/.test(naissance.trim()) || /^\d{4}-/.test(naissance.trim()) ? lireDate(naissance) : undefined);
  const brouillon = (): ProfilNutrition => ({
    clientId,
    sexe,
    naissance: lireNaissance(),
    tailleCm: lireNombre(taille),
    poidsKg: lireNombre(poids),
    activite,
    objectif,
    regimes,
    exclusions: exclusions.trim() || undefined,
  });

  async function enregistrer() {
    const p = brouillon();
    const liste: string[] = [];
    if (naissance.trim() && (!p.naissance || p.naissance > aujourdhui || p.naissance < '1920-01-01')) liste.push('Date de naissance : écris-la comme 14/03/1994.');
    if (p.tailleCm !== undefined && !(p.tailleCm >= 100 && p.tailleCm <= 250)) liste.push('Taille en centimètres, entre 100 et 250.');
    if (p.poidsKg !== undefined && !(p.poidsKg >= 25 && p.poidsKg <= 350)) liste.push('Poids en kilos, entre 25 et 350.');
    if (regimes.includes('vegan') && regimes.includes('pescetarien')) liste.push('Végan et pescétarien ne vont pas ensemble.');
    setErreurs(liste);
    if (liste.length) return;
    setEnCours(true);
    try {
      await alimentation.enregistrerProfil(p);
      setOk(true);
      onEnregistre();
    } catch (e) {
      setErreurs([e instanceof Error ? e.message : 'Enregistrement impossible']);
    } finally {
      setEnCours(false);
    }
  }

  const change = <T,>(f: (v: T) => void) => (v: T) => (f(v), setOk(false));
  const basculer = (r: Regime) => change(setRegimes)(regimes.includes(r) ? regimes.filter((x) => x !== r) : [...regimes, r]);

  return (
    <View style={{ gap: espace(4) }}>
      <Carte>
        <SousTitre>Besoins du jour</SousTitre>
        <Besoins profil={brouillon()} dernierPoids={dernierPoids} />
      </Carte>
      <Carte>
        <SousTitre>Profil</SousTitre>
        <Puces>
          <Puce libelle="Femme" actif={sexe === 'femme'} onPress={() => change(setSexe)('femme')} />
          <Puce libelle="Homme" actif={sexe === 'homme'} onPress={() => change(setSexe)('homme')} />
        </Puces>
        <ChampTexte libelle="Date de naissance" valeur={naissance} onChange={change(setNaissance)} placeholder="14/03/1994" />
        <View style={{ flexDirection: 'row', gap: espace(3) }}>
          <View style={{ flex: 1 }}>
            <ChampTexte libelle="Taille (cm)" type="nombre" valeur={taille} onChange={change(setTaille)} />
          </View>
          <View style={{ flex: 1 }}>
            <ChampTexte
              libelle="Poids (kg)"
              type="nombre"
              valeur={poids}
              onChange={change(setPoids)}
              placeholder={dernierPoids ? formaterNombre(dernierPoids) : undefined}
            />
          </View>
        </View>
        {dernierPoids !== undefined && !poids && (
          <Texte doux style={{ fontSize: 13 }}>
            Sans poids saisi ici, on prend ta dernière pesée : {formaterNombre(dernierPoids)} kg le {formaterDate(dateDernierPoids)}.
          </Texte>
        )}
        <Texte doux style={{ fontSize: 14 }}>Activité</Texte>
        <View style={{ gap: espace(2) }}>
          {NIVEAUX_ACTIVITE.map((n) => (
            <Puce key={n.cle} libelle={`${n.libelle} · ${n.detail}`} actif={activite === n.cle} onPress={() => change(setActivite)(n.cle)} />
          ))}
        </View>
        <Texte doux style={{ fontSize: 14 }}>Objectif</Texte>
        <Puces>
          {OBJECTIFS.map((o) => (
            <Puce key={o.cle} libelle={o.libelle} actif={objectif === o.cle} onPress={() => change(setObjectif)(o.cle)} />
          ))}
        </Puces>
      </Carte>
      <Carte>
        <SousTitre>Régime et allergies</SousTitre>
        <Puces>
          {REGIMES.map((r) => (
            <Puce key={r.cle} libelle={r.libelle} actif={regimes.includes(r.cle)} onPress={() => basculer(r.cle)} />
          ))}
        </Puces>
        {regimes.length > 0 && (
          <Texte doux style={{ fontSize: 13 }}>Les recettes proposées respecteront : {regimes.map(libelleRegime).join(', ')}.</Texte>
        )}
        <ChampTexte
          libelle="Allergies ou aliments que tu ne manges pas"
          valeur={exclusions}
          onChange={change(setExclusions)}
          placeholder="arachides, champignons…"
          aide="Sépare-les par des virgules. Les recettes qui en contiennent ne te seront pas proposées."
        />
      </Carte>
      {erreurs.length > 0 && <Erreur message={erreurs.join('\n')} />}
      {ok && <Texte style={{ color: couleurs.vert }}>Profil enregistré.</Texte>}
      <Bouton libelle="Enregistrer le profil" onPress={enregistrer} chargement={enCours} />
    </View>
  );
}
