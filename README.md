# VIDAA Player Lab — prototype de lecteur pour Hisense VIDAA 9

Prototype web **sans PC ni téléphone allumé**, sans achat, sans modifier le
firmware. Il joue vos films/séries **Xtream Codes** (abonnement IPTV personnel)
avec un lecteur HTML5, après un **diagnostic d'accès en 6 étapes** qui
identifie la cause unique d'un blocage (HTTPS, CORS, authentification…).

Deux lecteurs à comparer sur votre télévision :

1. **Lecteur HTML5** (MP4 direct + HLS via natif ou `hls.js`)
2. **Lecteur natif Hisense** (« handoff » via `omi_platform.sendPlatformMessage`)
   — affiche **honnêtement l'échec** si la TV refuse ou ignore la commande

> ⚠️ **Limite connue et assumée** : d'après l'étude du projet
> [stremio-vidaa-tv](https://github.com/NoobyGains/stremio-vidaa-tv) (GPLv2),
> le pont `omi_platform.sendPlatformMessage` n'a **qu'une fonction confirmée**
> sur les firmwares VIDAA testés (rafraîchissement du launcher). Les messages
> `launchNativePlayer` / `openMediaPlayer` / `playVideo` sont envoyés **sans
> accusé de réception** et de nombreux firmwares les **ignorent**. Notre
> prototype ne déclare donc un succès **que si la page passe réellement en
> arrière-plan** en moins de 2 secondes — sinon il affiche l'échec. Voir
> `NOTICE` pour l'attribution de licence.

---

## 1. Contenu du dossier

```
vidaa-player/
├── index.html          # l'application
├── style.css           # thème TV (gros contrastes, focus jaune)
├── .nojekyll           # force GitHub Pages à servir les fichiers bruts
├── NOTICE              # attribution de licence (obligatoire à la redistribution)
├── README.md           # ce guide
├── ARCHITECTURE.md     # contrats internes (dont CORS/relais personnel)
├── js/
│   ├── log.js          # journal horodaté + erreurs globales + redaction
│   ├── sources.js      # sources HTTPS publiques vérifiées
│   ├── native-handoff.js  # handoff lecteur natif (honnête, vérifié)
│   ├── player.js       # lecteur MP4/HLS, détection de blocages, reprise
│   ├── keys.js         # télécommande (codes + navigation focus)
│   ├── diagnostics.js  # diagnostic codec/CORS/pont/verdict
│   ├── tests.js        # suite de tests (pause, avance, reprise…)
│   ├── secure.js       # coffre chiffré AES-GCM 256 (identifiants Xtream)
│   ├── xtream.js       # client Xtream Codes + diagnostic d'accès 6 étapes
│   ├── xtream-ui.js    # panneau Xtream (formulaire, catalogue, rapport)
│   └── app.js          # assemblage
└── vendor/hls.min.js   # hls.js v1.5.18 embarqué (aucun CDN requis)
```

Aucune dépendance réseau externe au fonctionnement (hors vidéos de démo et
votre serveur Xtream) : l'application fonctionne si votre PC et votre
téléphone sont éteints, tant que la TV a Internet.

---

## 2. Vos identifiants Xtream — règles appliquées

**Vos identifiants ne quittent jamais votre télévision** :

- Chiffrés localement (AES-GCM 256, clé dérivée de votre phrase secrète via
  PBKDF2-SHA-256, 150 000 itérations) dans le stockage local de la TV —
  la phrase secrète **n'est jamais stockée** : elle est à retaper à chaque
  rechargement.
- **Jamais** écrits dans le code, les journaux (chaque ligne passe par une
  redaction qui masque `password=`/`username=` et les chemins
  `/movie|series|live/user/pass/`), ni dans les rapports de lecture.
- **Jamais** publiés sur GitHub : le coffre et le rapport formats vivent
  uniquement dans le localStorage de la TV.
- **Aucun proxy tiers** : la TV parle directement à **votre** serveur. Seul
  remède CORS documenté : **votre propre relais personnel** (implémenté dans
  `../vidaa-relay/`, déployé sur VOTRE compte Cloudflare) — jamais un service
  tiers qui verrait vos identifiants.
- Si le navigateur TV n'offre pas WebCrypto (page non sécurisée), le coffre
  est **refusé** : les identifiants ne sont alors valables que pour la
  session en cours, en mémoire.

---

## 3. Hébergement GRATUIT (5 minutes)

### Option A — GitHub Pages (recommandé)

1. Ouvrez `https://github.com` → **New repository**
   → nom : `vidaa-player-lab` → **Public** → *Create repository*.
2. Dans le dépôt : **Add file → Upload files** → glissez **tout le contenu**
   du dossier `vidaa-player/` (les fichiers, pas le dossier lui-même si le
   dépôt est vide) → **Commit changes**.
3. **Settings → Pages** → *Source* : **Deploy from a branch**
   → branche : `main`, dossier : `/ (root)` → **Save**.
4. Attendez 1–2 min. Votre app est sur :
   `https://VOTRE-PSEUDO.github.io/vidaa-player-lab/`

*(Optionnel : installer Git pour faire le dépôt en ligne de commande —
actuellement non installé sur ce PC.)*

### Option B — Cloudflare Pages

1. `https://dash.cloudflare.com` → **Workers & Pages → Create → Pages**
   → **Upload assets** → nom du projet → déposez le dossier `vidaa-player`.
2. URL fournie : `https://<projet>.pages.dev`.

Les deux offres sont **HTTPS** (indispensable) et gratuites.

> ⚠️ **Point d'attention HTTPS ↔ Xtream HTTP** : GitHub Pages sert l'app en
> HTTPS. Si **votre serveur Xtream est en HTTP**, le navigateur bloquera
> l'accès (« contenu mixte ») — c'est précisément ce que l'étape 2 du
> diagnostic détecte et explique. **Solution la plus simple : le relais
> personnel** fourni dans `../vidaa-relay/` (Cloudflare Worker gratuit,
> 5 min de déploiement, aucun outil local) : il donne à la TV une origine
> HTTPS qui parle à votre panel HTTP, avec vos identifiants en secrets
> Cloudflare et un code d'accès personnel. Autres options : serveur Xtream
> déjà en HTTPS, reverse-proxy HTTPS personnel. Le diagnostic vous dira
> lequel s'applique.

---

## 4. Ouvrir sur la TV Hisense VIDAA 9

### Méthode 1 — Navigateur Internet de la TV (30 s)

1. TV : *Accueil → Apps → Browser* (Internet Browser).
2. Saisissez votre URL GitHub Pages, **marquez-la en favori**.
3. Testez (checklist §5).

### Méthode 2 — Tuile permanente avec Sidee (déjà installé chez vous)

1. Sur le PC (allumé, même Wi-Fi) : lancez Sidee
   ([Empi9245/Sidee](https://github.com/Empi9245/Sidee)).
2. **Find TV → Request code** → saisissez le PIN affiché par la TV.
3. Pointez l'URL `https://VOTRE-PSEUDO.github.io/vidaa-player-lab/` comme
   application (preset configurable dans `core/presets.py` de Sidee).
4. Une tuile apparaît sur l'écran d'accueil → l'app s'ouvre **sans PC**.

> **Différence navigateur ↔ application (à vérifier sur VOTRE TV) :**
> Selon le projet de référence, le navigateur Internet VIDAA utilise une
> navigation **souris/curseur**, alors qu'une tuile lancée depuis l'accueil
> tourne dans le **WebView applicatif VIDAA avec navigation D-pad pure** — et
> c'est typiquement **ce contexte applicatif qui injecte `omi_platform`**.
> C'est pourquoi l'application affiche en permanence le badge `omi_platform` :
> **testez la même URL dans les deux contextes et comparez le badge + le
> journal.** Aucune garantie n'est affirmée : seule votre mesure compte.

---

## 5. Checklist de test sur la télévision

### 5a. Lecteur & télécommande

À faire dans l'ordre, **puis envoyez-moi le journal** (panneau 🟢 →
« Tout sélectionner ») :

| # | Action | Résultat attendu |
|---|--------|------------------|
| 1 | Ouvrir l'URL, regarder les badges en haut | `HTTPS ✓` (sinon = mauvaise URL) |
| 2 | Source « MP4 · Sintel » puis ▶ | image + son, HUD affiche `lecture` |
| 3 | OK sur la vidéo, flèches ◀ ▶ | -10 s / +10 s |
| 4 | Bouton « Lancer les tests » | liste PASS/FAIL détaillée |
| 5 | Après le test « reprise », recharger la page | ligne *finalisation* PASS |
| 6 | Source « HLS · Mux test » | lecture (mode natif ou hls.js, visible au journal) |
| 7 | Touche 🟡 jaune (ou bouton natif) | **succès vérifié** ou **échec explicite** |
| 8 | Touche 🔴 rouge → « Tester l'accès réseau » | verdict CORS/HTTPS |
| 9 | Touche 🟢 vert | journal complet à copier |
| 10 | Ouvrir la même URL **depuis la tuile Sidee** | comparer badge `omi_platform` + retest 🟡 |

> **Sintel MP4** : sur votre TV, cette source a échoué (contrairement aux
> autres démos). Si le même échec se reproduit, utilisez la source
> « MP4 · Big Buck Bunny (test-videos) » qui sert un fichier H.264/AAC
> classique vérifié — si elle passe, le souci est propre au fichier Sintel,
> pas au lecteur.

### 5b. Connexion Xtream (vos films)

| # | Action | Résultat attendu |
|---|--------|------------------|
| 11 | Panneau **Xtream** : saisir serveur + utilisateur + mot de passe | champs acceptés (clavier TV : les flèches ne bougent plus le focus dans un champ) |
| 12 | « 🔬 Tester la connexion (6 étapes) » | voir ci-dessous selon le verdict |
| 13 | « 🔐 Enregistrer chiffré » + phrase secrète | coffre verrouillé ; à la rechargement : « Déverrouiller » avec la phrase |
| 14 | 🎬 Films → catégorie → film → **▶ Lire** | lecture ; ligne « metadata OK » dans le rapport Formats |
| 15 | Un film **.mkv** (si votre fournisseur en a) | échec **affiché tel quel** (code 4) dans le rapport — c'est normal en HTML5 |
| 16 | ⚙ Rapport Formats & codecs → « Effacer » puis renvoyer le tableau | preuve des conteneurs/codecs que VOTRE fournisseur sert réellement |

**Verdicts du diagnostic (6 étapes, une cause identifiée à la fois)** :

| Verdict | Signification |
|---------|---------------|
| « TOUT EST BON » | API lisible, identifiants valides — passez au catalogue |
| « BLOCAGE HTTPS (mixed content) » | page HTTPS + serveur HTTP → options expliquées à l'écran |
| « Serveur injoignable ou trop lent » | URL/port/serveur : vérifiez avec `curl` depuis le PC |
| « BLOCAGE CORS sur l'API » | l'API est joignable mais illisible sans en-tête CORS — **la lecture MP4 directe reste testable** ; remède : votre relais personnel uniquement |
| « Réseau INTERCEPTÉ (proxy) » | un proxy/VPN répond à votre place → refaites le test directement sur la TV |
| « Identifiants refusés » | réseau et CORS bons → erreur de saisie ou abonnement expiré |
| « Réponse illisible (non-JSON) » | l'URL pointe vers un panel/admin, pas la racine du panel client |

**Signes d'erreur à relever** : code `MEDIA_ERR_NETWORK (3)` = CORS/HTTPS/serveur,
`MEDIA_ERR_SRC_NOT_SUPPORTED (4)` = codec/format (ex. conteneur MKV), message
« BLOCAGE DÉTECTÉ » = le flux ne progresse plus (réseau lent ou débordement
du décodeur).

---

## 6. Touches télécommande

| Touche | Effet |
|--------|-------|
| Flèches | Déplacer le focus (dans la vidéo : ◀ ▶ = ±10 s) |
| OK / 13 | Valider · lecture/pause si la vidéo a le focus |
| 🔴 Rouge (403) | Panneau Diagnostic |
| 🟢 Vert (404) | Panneau Journal |
| 🟡 Jaune (405) | **Handoff lecteur natif** |
| 🔵 Bleu (406) | Lancer la suite de tests |
| Info (457) | Afficher/masquer le HUD |
| Ch+ / Ch− (427/428) | ±60 s |
| Retour (8/461/10009) | Fermer un panneau (ne quitte jamais la page) |
| Play/Pause/REW/FF (415/19/412/413) | Pris en charge **si** la TV les envoie |

> Les codes couleurs/Info/Ch sont **documentés** sur VIDAA (projet de
> référence). Les codes média (415/19/412/413) sont **standards mais non
> confirmés sur votre firmware** : le panneau 🔴 → « Voir les dernières
> touches » affiche le **code brut réellement reçu** — envoyez-le-moi et
> j'ajusterai la table.
>
> Dans les champs de saisie (identifiants Xtream), les flèches/OK/espace
> servent au clavier écran TV et **ne déplacent jamais le focus** ; la touche
> Retour quitte d'abord le champ.

---

## 7. Test local sur PC (avant publication)

```powershell
cd C:\Users\vdali\Documents\Projet-IPTV\vidaa-player
python -m http.server 8090
# puis : http://127.0.0.1:8090  dans un navigateur
```

Pour tester la connexion Xtream **sans toucher à vos vrais accès**, un mock
local (utilisateur/mot de passe fictifs) est fourni :

```powershell
cd C:\Users\vdali\Documents\Projet-IPTV
python tools\mock_xtream.py
# serveur fictif sur http://127.0.0.1:8091 — scénarios :
#   http://127.0.0.1:8091/__scenario?set=ok|nocors|auth|html|timeout|nomedia
```

Rappels : en HTTP, l'application affichera `HTTP ✗` et un avertissement —
c'est voulu (la TV a besoin de HTTPS). La lecture des vidéos de démonstration
fonctionne, le pont `omi_platform` est absent hors TV (affiché, pas masqué).

---

## 8. Dépannage

| Symptôme | Cause probable / action |
|----------|--------------------------|
| Page blanche | Onglet console (F12 sur PC) → erreur JS ; vérifiez que tous les fichiers `js/` sont bien uploadés |
| `HTTP ✗` rouge | L'URL n'est pas HTTPS → utilisez l'URL GitHub Pages/Pages complète |
| « omi_platform ✗ » | Contexte sans pont → tester depuis la tuile Sidee (§4) |
| Test reprise FAIL « timeout:playing » | Le navigateur a bloqué l'autoplay → appuyez d'abord sur ▶ manuellement puis relancez les tests |
| HLS ne démarre pas | Journal 🟢 : cherchez `hls.js erreur` (réseau/CORS) ou `bascule` (natif défaillant) |
| Rien ne répond à la télécommande | 🔴 → « Voir les dernières touches » : si le journal est vide, le navigateur n'émet pas `keydown` — signalez-le |
| Xtream : « BLOCAGE CORS » | Le serveur n'autorise pas cette origine → MP4 direct testable quand même ; pour l'inventaire/HLS : **votre** relais personnel (`../vidaa-relay/`), pas un service tiers |
| Xtream : catalogue vide après verdict bon | Recliquez 🎬 Films / 📺 Séries (le diagnostic ne charge pas le catalogue automatiquement) |
| Coffre « INDISPONIBLE » | WebCrypto absent (page non sécurisée ?) → l'app refuse de stocker les identifiants ; usage session uniquement |
| Mot de passe oublié | « Oublier les identifiants » efface le coffre ; ressaisir les accès depuis votre panneau fournisseur |

---

## 9. Ce que cette version NE fait PAS (volontairement)

- Pas d'interface type Netflix / catalogue rich-media / favoris (à faire
  **après** validation de la lecture de vos vrais films sur la télévision).
- Pas de proxy ou service tiers : aucun code n'envoie vos identifiants
  ailleurs que vers votre serveur.
- Aucune promesse de succès du lecteur natif : l'échec est un résultat
  normal et affiché comme tel.
- Pas de stockage en clair : si le coffre chiffré est indisponible,
  l'application préfère ne rien retenir.
