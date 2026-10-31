# ARCHITECTURE — intégration Xtream Codes

> **Statut : IMPLÉMENTÉ (prototype)** — client + diagnostic + coffre chiffré +
> catalogue basique, testé localement contre un mock (`tools/mock_xtream.py`,
> 6 scénarios). Il reste à valider sur votre vraie télévision avec vos
> accès réels (checklist README §5b). Aucun identifiant n'est stocké en
> clair, aucun n'est envoyé nulle part hormis **votre** serveur.

---

## 1. Rappel des contraintes (toutes vérifiées ou documentées)

| Contrainte | Détail | Conséquence |
|---|---|---|
| **CORS** | Les panneaux Xtream n'envoient généralement **pas** d'en-tête `Access-Control-Allow-Origin` : le navigateur **bloque** la lecture de `player_api.php` depuis une page GitHub Pages (origine `https://…github.io`) | Diagnostic : l'étape 4 distingue CORS vs injoignable vs proxy (voir §3bis) ; le `<video>` MP4, lui, **n'a pas besoin de CORS** — la lecture directe reste testable |
| **HTTPS** | Beaucoup de panneaux Xtream sont en **HTTP pur** ; une page HTTPS qui appelle du HTTP = **mixed content → bloqué** par le navigateur | Étape 2 du diagnostic le détecte avant tout appel réseau et propose les options ; le relais, s'il existe, doit lui-même être en HTTPS |
| **Codecs** | Liens Xtream fréquents : `.mkv` (Matroska), HEVC/H.265 4K, AC-3/E-AC-3, parfois AV1. Le `<video>` HTML5 **ne lit pas le conteneur MKV** ; AV1 sans décodage matériel = slideshow | Le rapport « Formats & codecs » enregistre chaque essai (réussi ou non) : c'est la mesure réelle de ce que VOTRE fournisseur sert et que la TV accepte. MKV → échec code 4 affiché tel quel |
| **HLS/DASH** | Certains flux sont `.m3u8` (live TV) : le prototype sait déjà natif + `hls.js` + bascule automatique | Réutilisation directe de `player.js` ; le HLS exige CORS sur le serveur (XHR) — signalé à l'écran |
| **DRM** | Certains contenus sont protégés (Widevine/PlayReady) : nécessitent EME + clés fournies par le panneau | Sans clés du prestataire → impossible (et hors volonté) |
| **Vie privée** | Interdiction explicite : aucun proxy public, aucun service tiers inconnu, aucun identifiant publié | §4 : uniquement **votre propre** relais, ou connexion directe si le CORS le permet |

---

## 2. Modules implémentés

```
js/secure.js     coffre VSecure — PBKDF2-SHA-256 (150k) → AES-GCM 256,
                 chiffré dans localStorage, phrase secrète jamais stockée,
                 refus si WebCrypto absent, session en mémoire seule
js/xtream.js     VXtream — parseServerUrl, apiUrl/mediaUrl (extra params
                 séparés : category_id/vod_id/series_id), timedFetch 8 s,
                 apiCall (kind: ok|http|net|timeout|mixed|json), mediaProbe
                 (1 octet no-cors annulé), inventory, diagnose (6 étapes),
                 vodInfo/seriesInfo, buildSource, rapport formats (40 max,
                 sans identifiants)
js/xtream-ui.js  VXtreamUI — formulaire + coffre, diagnostic pas-à-pas,
                 catalogue vod/series/live (paginé 50), détail → ▶ Lire /
                 🔍 probe média, tableau rapport + capacités navigateur
```

Flux de lecture : catalogue → `get_vod_info` (conteneur réel) →
`buildSource()` → `VApp.loadSource()` → `VPlayer` (MP4 direct ou HLS natif/
hls.js) → événements renvoyés au rapport formats (« metadata OK »,
« ÉCHEC », « ÉCHEC APRÈS METADATA », blocage persistant).

---

## 3. Comment contourner le CORS **sans proxy public**

Ordre de préférence (appliqué par le diagnostic) :

### Option 1 — Connexion directe (si le panneau l'autorise)
Certaines configurations envoient `Access-Control-Allow-Origin: *`. Testé en
étape 4 (`mode: 'cors'` + lecture JSON). → Si OK : **aucun relais, aucun
tiers, credentials uniquement entre la TV et votre prestataire.** C'est
l'idéal, et l'inventaire/catalogue fonctionnent alors pleinement.

### Option 1bis — API bloquée mais vidéo lisible
Un `<video>` en MP4 **n'exige pas de CORS** : même si l'étape 4 échoue, un
film peut se lire en direct (prouvé en test : API en blocage CORS + MP4 en
lecture). La limite : pas d'inventaire ni de HLS (XHR). À utiliser si votre
fournisseur bloque l'API mais ouvre les fichiers.

### Option 2 — VOTRE propre relais (aucun tiers, aucun collecteur)
Si bloqué : déployer **par vous, sur VOTRE compte**, un micro-relais qui ne
fait que :
- accepter `POST {base, username, password, action}` depuis VOTRE domaine,
- appeler VOTRE panneau Xtream côté serveur,
- renvoyer le JSON **sans journaliser identifiants ni requêtes**.

Implémentations acceptables (toutes sous **votre** contrôle) :
- **Cloudflare Worker gratuit** déployé depuis **votre** compte (code lisible,
  déployé par vous — ce n'est PAS un service tiers) ;
- un petit service sur un **NAS/Box/VPS personnel** toujours allumé (le PC
  doit pouvoir être éteint).

> ⚠️ **Signalé clairement** : ce relais est techniquement un proxy. La
> différence avec un « proxy public » est décisive : le code est **le vôtre**,
> hébergé sur **votre** compte, il ne transite par **aucun service tiers**, et
> il peut être écrit **sans aucun journal**. **Je ne fournirai ni n'utiliserai
> jamais** un proxy déjà opéré par quelqu'un d'autre — c'est précisément là
> que les identifiants sont collectés.

### Option 3 — NON RETENU
- Proxy tiers en ligne (collecte d'identifiants) → **exclu**.
- Désactiver la sécurité du navigateur / certificats auto-signés → **exclu**.

---

## 3bis. Diagnostic d'accès en 6 étapes (sépare les causes)

| Étape | Ce qu'elle prouve | Blocage typique |
|---|---|---|
| 1. URL | Syntaxe, hôte, port, racine du panel | URL vide/malformée |
| 2. Mixed content | Page HTTPS ↔ serveur HTTP | Contenu mixte bloqué (API **et** vidéo) |
| 3. Joignabilité (no-cors) | Le serveur répond réseau | DNS/port/pare-feu/arrêt/trop lent |
| 4. Lecture API (CORS) + probe témoin | En-tête CORS réellement présent | **BLOCAGE CORS** (avec preuve : le probe témoin `127.0.0.1:9/…`, URL morte garantie, échoue = réseau sain) ou **Réseau INTERCEPTÉ** (le témoin répond = un proxy répond à votre place, le diagnostic refuse de conclure) |
| 5. Authentification | `user_info.auth = 1` | Identifiants refusés / compte expiré |
| 6. Inventaire | get_vod/series/live_streams lisibles | Inventaire partiel (CORS par action) |

Le verdict est **unique et honnête** : chaque échec s'arrête à sa cause, et
un échec de lecture MP4 reste possible même avec une API bloquée (§3 1bis).

---

## 4. Protection des identifiants

1. **Jamais** dans l'URL de la page, les logs, les `localStorage` en clair, ni
   le dépôt Git. Chaque ligne du journal passe par `VLog.redact`
   (`password=`/`username=`, chemins `/movie|series|live/U/P/`, `user:pass@`)
   avant stockage **et** avant console.
2. Chiffrement local : `PBKDF2(passphrase) → AES-GCM 256` (WebCrypto) ;
   stockage du chiffré seulement, la passphrase n'est jamais stockée.
   Si WebCrypto est absent, le coffre est **refusé** (session seule).
3. Les URL média Xtream (qui contiennent les identifiants en chemin) ne
   sont **jamais persistées** (`vidaa_lab_last_source` est ignoré pour elles)
   et le rapport formats ne contient que titre/conteneur/résultat.
4. Aucune télémétrie, aucun CDN tiers, `hls.js` reste **embarqué**.
5. Un essai de déverrouillage raté **ne détruit pas** une session déjà valide.

---

## 5. Suite prévue (UNIQUEMENT après validation lecture sur TV)

1. ~~Prototype vidéo~~ ✅ fait
2. Validation sur TV ✅/⏳ (checklist README §5)
3. ~~Écran Xtream (base URL, identifiants, test de connexion)~~ ✅ fait
4. ~~Catalogue basique (catégories → items → lecture)~~ ✅ fait
5. **Interface soignée type Netflix** : posters, recherche, favoris,
   progression/suite d'épisode (la mécanique `localStorage` de reprise
   existe déjà) — **uniquement après** la validation de la lecture réelle
6. Optionnel : transcodage ou handoff MKV **si** les mesures TV le confirment

Aucune fonctionnalité Netflix-tiers n'est construite avant la validation
lecture sur votre télévision.
