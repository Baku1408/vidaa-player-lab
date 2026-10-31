# ARCHITECTURE — intégration Xtream Codes (ÉTAPE ULTÉRIEURE)

> **Statut : NON IMPLÉMENTÉ.** Cet document décrit l'architecture prévue pour
> récupérer plus tard vos films, séries et liens de lecture Xtream — **après**
> validation de la lecture sur votre vraie télévision (Priorité 1–3 terminées).
> Aucun identifiant n'est stocké aujourd'hui, aucun n'est envoyé nulle part.

---

## 1. Rappel des contraintes (toutes vérifiées ou documentées)

| Contrainte | Détail | Conséquence |
|---|---|---|
| **CORS** | Les panneaux Xtream n'envoient généralement **pas** d'en-tête `Access-Control-Allow-Origin` : le navigateur **bloque** la lecture de `player_api.php` depuis une page GitHub Pages (origine `https://…github.io`) | Un simple `fetch()` échouera presque toujours côté navigateur — voir §3 |
| **HTTPS** | Beaucoup de panneaux Xtream sont en **HTTP pur** ; une page HTTPS qui appelle du HTTP = **mixed content → bloqué** par le navigateur (le badge `HTTP ✗` / verdict du prototype existant sert déjà à ce diagnostic) | Le relais, s'il existe, doit lui-même être en HTTPS |
| **Codecs** | Liens Xtream fréquents : `.mkv` (Matroska), HEVC/H.265 4K, AC-3/E-AC-3, parfois AV1. Le `<video>` HTML5 **ne lit pas le conteneur MKV** ; AV1 sans décodage matériel = slideshow | Stratégie : MP4/H.264 → lecteur web · MKV/HEVC → tenter le handoff natif (à **mesurer** sur VIDAA 9, non garanti) · sinon transcodage côté serveur (hors périmètre actuel) |
| **HLS/DASH** | Certains flux sont `.m3u8` (live TV) : le prototype sait déjà natif + `hls.js` + bascule automatique | Réutilisation directe de `sources.js` / `player.js` |
| **DRM** | Certains contenus sont protégés (Widevine/PlayReady) : nécessitent EME + clés fournies par le panneau | Le diagnostic affiche déjà si EME est déclaré ; sans clés du prestataire → impossible (et hors volonté) |
| **Vie privée** | Interdiction explicite : aucun proxy public, aucun service tiers inconnu, aucun identifiant publié | §3 : uniquement du **votre propre** relais, ou connexion directe si le CORS le permet |

---

## 2. Modèle de données (normalisation)

Ne jamais coupler l'interface au format brut Xtream. Couche d'adaptation :

```
player_api.php?username=…&password=…&action=…
        │
        ▼
  ┌─ connector/xtream.js ─────────────────────────────┐
  │  get_vod_streams / get_vod_info / get_series_info │
  │  get_live_streams / get_live_categories …         │
  └───────────────────────┬───────────────────────────┘
                          ▼
        Objets normalisés (indépendants du prestataire)
        { id, kind:'movie'|'series'|'live', title, year,
          poster, synopsis, seasons?, streams[] }
        { streamId, label:'1080p · HEVC · MKV', url, container,
          codecVideo, codecAudio, bitrate, ext }
                          │
                          ▼
        sources.js (déjà existant) → VPlayer.load()
        → lecture HTML5/HLS OU handoff natif (choix assumé,
          affiché, avec échec honnête si refus)
```

Point d'entrée prévu côté prototype : `VSources.list()` acceptera une liste de
sources injectée ; l'écran « Catalogue » (Phase 3) appellera simplement
`VPlayer.load({label, type, url})` — **aucune modification du moteur de
lecture nécessaire**.

---

## 3. Comment contourner le CORS **sans proxy public**

Ordre de préférence (à valider par mesures dans l'ordre) :

### Option 1 — Connexion directe (si le panneau l'autorise)
Certaines configurations envoient `Access-Control-Allow-Origin: *` (ou
renvoient des JSON « simples » accessibles). **Test mesurable** (à intégrer au
diagnostic Phase 1) :

```js
fetch(panelUrl + '/player_api.php?username=U&password=P&action=get_vod_streams',
      { method: 'GET', mode: 'cors' })
  .then(r => r.json())
  .catch(e => 'CORS bloqué : ' + e.message);
```

→ Si OK : **aucun relais, aucun tiers, credentials uniquement entre la TV et
votre prestataire.** C'est l'idéal.

### Option 2 — VOTRE propre relais (aucun tiers, aucun collecteur)
Si bloqué : déployer **par vous, sur VOTRE compte**, un micro-relais qui ne
fait que :
- accepter `POST {base, username, password, action}` depuis VOTRE domaine,
- appeler VOTRE panneau Xtream côté serveur,
- renvoyer le JSON **sans journaliser identifiants ni requêtes**.

Implémentations acceptables (toutes sous **votre** contrôle) :
- **Cloudflare Worker gratuit** déployé depuis **votre** compte (code lisible
  ci-dessous, déployé par vous — ce n'est PAS un service tiers) ;
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

## 4. Protection des identifiants

1. **Jamais** dans l'URL de la page, les logs, les `localStorage` en clair, ni
   le dépôt Git.
2. Chiffrement local : `PBKDF2(passphrase) → AES-GCM` (WebCrypto, déjà
   présent en HTTPS) ; stockage du chiffré seulement, la passphrase n'est
   jamais stockée (saisie au lancement, mode « session seulement » possible).
3. Le journal du prototype (🔴/🟢) **rodera** les `password=`, `username=`,
   tokens — règle appliquée à tout nouveau code.
4. Aucune télémétrie, aucun CDN tiers, `hls.js` reste **embarqué**.

---

## 5. Interface (UNIQUEMENT après validation lecture Priorité 3)

1. ~~Prototype vidéo~~ ✅ fait
2. Validation sur TV ✅/⏳ (checklist du README)
3. **Écran Réglages → Source Xtream** (base URL, identifiants, test de
   connexion avec affichage du diagnostic CORS/HTTPS réel)
4. **Catalogue** : catégories → fiches → liste des sources → lecture via le
   moteur existant
5. Progression/suite d'épisode (le test « reprise » du prototype fournit déjà
   la mécanique `localStorage`)
6. Optionnel : transcodage ou handoff MKV **si** les mesures TV le confirment

Aucune fonctionnalité Netflix-tiers n'est construite avant l'étape 2.
