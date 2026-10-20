# Coach OS · application mobile (prototype)

Application iPhone / Android de Coach OS, avec l'espace coach utilisable aussi dans un navigateur.
Construite avec [Expo](https://expo.dev) (React Native, TypeScript) et [Supabase](https://supabase.com) pour la base.

Ce prototype couvre deux parcours de bout en bout.

**Accueil des clients (CRM)**, qui remplace Tally → Make → Airtable :

1. le coach crée un contact avec un simple numéro de téléphone (doublons détectés à la saisie, numéro normalisé) ;
2. le prospect remplit le bilan « Forme & objectifs » (repris du Tally de Sylvain, page par page) par un lien, sans compte : ses réponses arrivent sur la bonne fiche (rapprochement par téléphone puis e-mail, jamais par le nom ; les différences sont signalées, pas écrasées) ;
3. le coach planifie la séance Booster, puis saisit tests, observations et 3 priorités ;
4. les relances du jour (questionnaire, proposition de Booster, rappel la veille, suivi après Booster) s'affichent sur l'accueil du coach, avec le message déjà écrit qui s'ouvre dans SMS, WhatsApp ou e-mail ;
5. « Passer en client » ouvre l'espace client ; les contacts peuvent être archivés puis réactivés, sans rien effacer.

**Séance du client** :

1. un client se connecte et ouvre sa séance du jour ;
2. il la réalise : charges suggérées grisées, qu'il valide ou corrige série par série, minuteur de récupération qui sonne même téléphone verrouillé ;
3. il laisse un commentaire de fin de séance ;
4. le coach retrouve la séance, série par série, avec le commentaire.

Il contient aussi le minuteur d'intervalles (Tabata, circuit). Le coach peut en régler un sous un exercice ou sous un circuit de la séance : la cliente le lance d'un appui, déjà configuré. Pas encore de création de programmes par le coach, de compte rendu PDF automatique, de paiements, de suivi des mensurations ni de nutrition.

## Essayer sur ton téléphone (gratuit, sans compte Apple ni Google)

Il faut un ordinateur avec [Node.js](https://nodejs.org) (version 20 ou plus) et l'app **Expo Go** sur le téléphone (App Store ou Google Play).

```bash
git clone https://github.com/sylvainschietse/coach-os-mobile.git
cd coach-os-mobile
npm install
npx expo start
```

Scanne le QR code affiché : avec l'appareil photo sur iPhone, depuis Expo Go sur Android. Le téléphone et l'ordinateur doivent être sur le même Wi-Fi (sinon `npx expo start --tunnel`).

Pour l'espace coach sur ordinateur : appuie sur `w` dans le terminal, l'app s'ouvre dans le navigateur. En largeur ordinateur, la liste des clients est à gauche et le suivi à droite.

### Mode démo

Le fichier `.env` branche l'app sur la base Supabase « Coach OS » (connexion par e-mail et mot de passe). Pour l'essayer sans compte, lance `EXPO_NO_DOTENV=1 npx expo start` : l'app démarre alors en **mode démo** : données fictives (Sylvain coach, Léa et Thomas clients), tout reste sur l'appareil. Sur l'écran d'accueil, choisis « Je suis Léa », fais la séance, déconnecte-toi, puis choisis « Je suis Sylvain » pour voir le résultat. Léa a déjà une séance la semaine précédente (4 × 12 à 45 kg au développé couché) : l'app lui suggère donc 47,5 kg.

## Brancher une vraie base Supabase (offre gratuite)

C'est déjà fait pour le projet « Coach OS » (région Europe, offre gratuite). Les étapes ci-dessous servent pour un nouveau projet.

1. Créer un projet sur [supabase.com](https://supabase.com), région Europe.
2. Dans *SQL Editor*, coller tout le fichier `supabase/installation.sql` (toutes les migrations, dans l'ordre) puis *Run*. Pour des données d'essai, exécuter ensuite `supabase/seed.sql` après avoir créé ses comptes.
3. Dans *Authentication > Users*, créer le compte du coach (*Add user*, cocher *Auto Confirm User*).
4. Dans *SQL Editor* : `select public.creer_coach('e-mail du coach', 'Prénom', 'lien-du-questionnaire');`
5. Renseigner l'URL du projet et la clé publique (*Project Settings > API Keys*, clé « publishable ») dans `.env` (ou `.env.local` pour un essai local). Ces deux valeurs sont publiques ; ne jamais y mettre la clé secrète.
6. Relancer `npx expo start`. L'écran d'accueil demande alors e-mail et mot de passe, et le coach voit sur son ordinateur ce que le client fait sur son téléphone.

### Rédaction du compte rendu par l'IA (Claude)

La clé Claude ne va jamais dans l'appli : elle reste dans les secrets Supabase, lue par la fonction `supabase/functions/rediger-compte-rendu`.

1. Créer un compte sur [console.anthropic.com](https://console.anthropic.com), ajouter un moyen de paiement et créer une clé API.
2. Avec l'outil Supabase en ligne de commande : `npx supabase login`, `npx supabase link --project-ref <ref du projet>`, puis `npx supabase secrets set ANTHROPIC_API_KEY=<la clé>` et `npx supabase functions deploy rediger-compte-rendu`.
3. Dans l'appli, l'écran du compte rendu affiche alors « Rédiger avec l'IA ». Sans ça (et en démo), les textes viennent d'un modèle sans IA, modifiables à la main.

L'offre gratuite se met en pause après une semaine sans activité et ne fait pas de sauvegarde : n'y mettre que des données de test.

## Ce qui est déjà en place pour la suite

- **Plusieurs coachs** : chaque donnée est rattachée à un coach ; un coach ne voit jamais les clients d'un autre, un client ne voit que ses propres données. Ces règles sont dans la base elle-même et testées (`tests/acces.test.ts`).
- **Pas de doublon** : l'identifiant d'une séance réalisée est créé sur le téléphone ; un double appui ou un renvoi après coupure réseau ne crée rien de plus.
- **Hors connexion** : une séance terminée est d'abord gardée sur le téléphone, puis envoyée dès que le réseau revient.
- **Modèle / prescription / réalisation** séparés : une suggestion de charge n'est jamais enregistrée comme performance sans validation du client.
- **Migration** : `src/domain/cycles.ts` décode déjà les marqueurs `[COACHOS_CYCLES:…]` et `[COACHOS_BLOCS:…]` de l'app Zite.

La règle de suggestion de charge (`src/domain/suggestions.ts`) est provisoire : même charge, ou + 2,5 kg quand toutes les séries ont atteint le haut de la fourchette. À remplacer par la règle de Sylvain.

## Pour les développeurs

```bash
npm test           # règles métier + règles d'accès de la base (Postgres en mémoire)
npm run typecheck
npm run lint
```

| Dossier | Contenu |
| --- | --- |
| `src/app/` | Écrans (Expo Router) : `client/`, `coach/` |
| `src/domain/` | Logique métier pure, testée : CRM et relances, questionnaire, suggestions, minuteur, file d'envoi, décodage Zite |
| `src/data/` | Accès aux données : mode démo local ou Supabase |
| `src/ui/` | Thème Coach OS et composants |
| `supabase/` | Schéma, règles d'accès et données de démonstration |
| `tests/` | Tests automatiques |
