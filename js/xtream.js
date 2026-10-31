/* VIDAA Player Lab — client Xtream Codes + diagnostic d'accès
 * ═══════════════════════════════════════════════════════════════════════
 * API standard :  {base}/player_api.php?username=U&password=P[&action=...]
 * Médias       :  {base}/movie|series|live/U/P/ID[.ext]
 *
 * Principes :
 *  - Aucun proxy tiers : uniquement l'appareil → votre serveur (et le
 *    relais PERSONNEL documenté en dernier recours, jamais un service tiers).
 *  - Identifiants : construits en mémoire, jamais journalisés en clair
 *    (toutes les lignes passent par VLog.redact), jamais persistés hors du
 *    coffre chiffré VSecure.
 *  - Le diagnostic sépare SOIGNEUSEMENT les causes : URL → HTTPS/mixed
 *    content → port joignable → CORS → authentification → inventaire.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  function L(level, msg, data) { window.VLog.log(level, 'xtream', msg, data); }

  var TIMEOUT_MS = 8000;

  /**
   * Protocole de la page — surcharge injectable pour les tests
   * ({ pageProtocol: 'https:' }) : permet de simuler le mixed content en
   * local sans certificat. Sans options → comportement réel du navigateur.
   */
  function pageProto(opts) { return (opts && opts.pageProtocol) || window.location.protocol; }
  function isMixed(cfg, opts) { return pageProto(opts) === 'https:' && cfg.scheme === 'http'; }

  /* ── 1. Analyse de l'URL serveur ─────────────────────────────────── */

  /**
   * normalise l'URL saisie → { ok, base, scheme, host, port, error }.
   * Accepte « exemple.com:8080 », « http://exemple.com », avec ou sans /
   * final. Pas de nom de fichier : on pointe vers la racine du panel.
   */
  function parseServerUrl(input) {
    var s = String(input || '').trim();
    if (!s) return { ok: false, error: 'URL du serveur vide.' };
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'http://' + s;   // défaut HTTP (Xtream typique)
    var u;
    try { u = new URL(s); } catch (e) { return { ok: false, error: 'URL invalide : « ' + s + ' ».' }; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return { ok: false, error: 'Protocole non supporté : ' + u.protocol + ' (attendu http: ou https:).' };
    }
    if (!u.hostname) return { ok: false, error: 'Nom d\'hôte manquant.' };
    var base = u.origin + (u.pathname.replace(/\/+$/, '') || '');
    return {
      ok: true, base: base, scheme: u.protocol.replace(':', ''),
      host: u.hostname, port: u.port || (u.protocol === 'https:' ? '443' : '80'),
      path: u.pathname.replace(/\/+$/, '')
    };
  }

  /** URL de l'API pour une action donnée (les identifiants sont dans la query).
   *  extra = paramètres secondaires ({category_id: 5}) encodés SÉPARÉMENT —
   *  les injecter dans action ferait échouer le parsing serveur (%26). */
  function apiUrl(cfg, action, extra) {
    var base = cfg.base || cfg.b || '';       // tolère les deux noms de champ
    if (!base) throw new Error('URL serveur absente (parse obligatoire avant appel).');
    var url = base + '/player_api.php?username=' + encodeURIComponent(cfg.u) +
      '&password=' + encodeURIComponent(cfg.p);
    if (action) url += '&action=' + encodeURIComponent(action);
    if (extra) {
      for (var k in extra) {
        if (extra.hasOwnProperty(k) && extra[k] !== undefined && extra[k] !== null) {
          url += '&' + k + '=' + encodeURIComponent(extra[k]);
        }
      }
    }
    return url;
  }

  /** URL média Xtream : /movie|series|live/U/P/id[.ext] */
  function mediaUrl(cfg, kind, id, ext) {
    var base = cfg.base || cfg.b || '';
    if (!base) throw new Error('URL serveur absente (parse obligatoire avant appel).');
    var u = base + '/' + kind + '/' + encodeURIComponent(cfg.u) + '/' + encodeURIComponent(cfg.p) +
      '/' + encodeURIComponent(String(id));
    if (ext) u += '.' + String(ext).replace(/^\./, '');
    return u;
  }

  /* ── 2. Requêtes (fetch + timeout, séparation erreur réseau/CORS/HTTP) ── */

  function timedFetch(url, opts, ms) {
    var ctrl = null;
    if (window.AbortController) {
      ctrl = new AbortController();
      opts.signal = ctrl.signal;
      var t = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, ms || TIMEOUT_MS);
      return fetch(url, opts).then(function (r) { clearTimeout(t); return r; },
        function (e) { clearTimeout(t); throw e; });
    }
    // Navigateur très ancien : pas d'abort, on laisse le timeout du navigateur faire.
    return fetch(url, opts);
  }

  /** Appel API JSON. Résout { status, json|error, kind } — kind : ok|http|net|cors|timeout|mixed|json */
  function apiCall(cfg, action, opts, extra) {
    opts = opts || {};
    var url = apiUrl(cfg, action, extra);
    var mixed = isMixed(cfg, opts);
    var started = Date.now();
    return timedFetch(url, {
      method: 'GET',
      mode: 'cors',                    // on veut LIRE la réponse → nécessite ACAO
      credentials: 'omit',
      cache: 'no-store'
    }, TIMEOUT_MS).then(function (res) {
      var ms = Date.now() - started;
      return res.text().then(function (txt) {
        var json = null;
        try { json = JSON.parse(txt); } catch (e) {}
        if (!res.ok) return { kind: 'http', status: res.status, ms: ms, error: 'HTTP ' + res.status };
        if (!json) return { kind: 'json', status: res.status, ms: ms, error: 'Réponse non-JSON (peut-être une page HTML d\'erreur ou un login panel).' };
        return { kind: 'ok', status: res.status, ms: ms, json: json };
      });
    }).catch(function (err) {
      var ms = Date.now() - started;
      if (err && err.name === 'AbortError') return { kind: 'timeout', ms: ms, error: 'Délai dépassé (' + TIMEOUT_MS + ' ms).' };
      if (mixed) return { kind: 'mixed', ms: ms, error: 'Contenu mixte refusé : la page est HTTPS, le serveur est HTTP.' };
      return { kind: 'net', ms: ms, error: 'Échec réseau/CORS (TypeError) : ' + ((err && err.message) || 'détail masqué par le navigateur.') };
    });
  }

  /** Test de portée SANS CORS (mode no-cors) : sert à départager CORS vs injoignable. */
  function reachProbe(cfg, opts) {
    var url = apiUrl(cfg, null);
    if (isMixed(cfg, opts)) {
      return Promise.resolve({ reachable: false, mixed: true });
    }
    return timedFetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' }, TIMEOUT_MS)
      .then(function () { return { reachable: true, mixed: false }; })
      .catch(function () { return { reachable: false, mixed: false }; });
  }

  /**
   * Probe témoin — URL morte garantie (127.0.0.1:9, rien n'écoute jamais dessus).
   *  - elle ÉCHOUE    → réseau sain : les réponses précédentes venaient du vrai
   *                     serveur → un échec de lecture est bien un blocage CORS.
   *  - elle RÉSOUT    → un PROXY/intermédiaire répond à votre place pour tout
   *                     port inaccessible : on ne peut PAS conclure « CORS »,
   *                     on le dit honnêtement.
   * N'exécute qu'en cas d'échec de lecture (chemin de panne uniquement).
   */
  function intermediaryProbe() {
    if (window.location.protocol === 'https:') return Promise.resolve({ answered: false });
    return timedFetch('http://127.0.0.1:9/vidaa-probe-temoin',
      { method: 'GET', mode: 'no-cors', cache: 'no-store' }, 4000)
      .then(function () { return { answered: true }; })
      .catch(function () { return { answered: false }; });
  }

  /**
   * Test de portée du flux média (même hôte ? port différent ?).
   * Requête 1 octet en Range, annulée aussitôt — on ne télécharge jamais le film.
   * Si le navigateur refuse cette requête expérimentale, le test est « ignoré »
   * (le vrai test se fait à la lecture, dans le lecteur).
   */
  function mediaProbe(url, opts) {
    if (pageProto(opts) === 'https:' && /^http:\/\//i.test(url)) {
      return Promise.resolve({ state: 'mixed' });
    }
    var req = { method: 'GET', mode: 'no-cors', cache: 'no-store' };
    try { req.headers = { Range: 'bytes=0-1' }; } catch (e) {}
    return timedFetch(url, req, TIMEOUT_MS).then(function (res) {
      // Immédiatement : on ne lit pas le corps, on l'annule.
      try { if (res && res.body && res.body.cancel) res.body.cancel(); } catch (e) {}
      return { state: 'ok', type: res.type };
    }).catch(function (err) {
      if (err && err.name === 'AbortError') return { state: 'timeout' };
      if (pageProto(opts) === 'https:' && /^http:\/\//i.test(url)) return { state: 'mixed' };
      return { state: 'fail' };
    });
  }

  /* ── 3. Inventaire ───────────────────────────────────────────────── */

  function count(arr) { return Array.isArray(arr) ? arr.length : 0; }

  function inventory(cfg, opts) {
    return Promise.all([
      apiCall(cfg, 'get_vod_streams', opts),
      apiCall(cfg, 'get_series', opts),
      apiCall(cfg, 'get_live_streams', opts)
    ]).then(function (r) {
      var inv = {
        vod: count(r[0].json), series: count(r[1].json), live: count(r[2].json),
        errors: [], partial: false
      };
      ['vod', 'series', 'live'].forEach(function (k, i) {
        if (r[i].kind !== 'ok') { inv.errors.push(k + ': ' + (r[i].error || r[i].kind)); inv.partial = true; }
      });
      return inv;
    });
  }

  /** Formate l'URL d'un film jouable (conteneur inconnu tant qu'info non chargée). */
  function vodUrl(cfg, stream) {
    var ext = stream.container_extension || 'mp4';
    return mediaUrl(cfg, 'movie', stream.stream_id, ext);
  }
  function episodeUrl(cfg, ep) {
    return mediaUrl(cfg, 'series', ep.id, ep.container_extension || 'mp4');
  }

  /* ── 4. Diagnostic pas-à-pas (étape → onStep(stepObj)) ───────────── */

  /**
   * Chaque étape : { id, label, state: 'run'|'ok'|'warn'|'fail', detail }.
   * La fonction résout un rapport complet, sans JAMAIS inclure mot de passe
   * ni URL contenant les identifiants (redaction defensive en fin de parcours).
   */
  function diagnose(cfg, onStep, opts) {
    opts = opts || {};
    // Couture de test : { witnessProbe: fn } remplace le probe témoin
    // (permet de vérifier la branche « réseau intercepté » sans proxy réel).
    var witness = opts.witnessProbe || intermediaryProbe;
    var steps = [];
    function step(id, label, state, detail) {
      var s = { id: id, label: label, state: state, detail: String(detail == null ? '' : detail) };
      steps.push(s);
      var lvl = state === 'fail' ? 'error' : (state === 'warn' ? 'warn' : (state === 'ok' ? 'success' : 'info'));
      L(lvl, 'Diagnostic · ' + label + ' — ' + (state === 'run' ? '…' : state.toUpperCase()) +
        (s.detail ? ' : ' + s.detail : ''));
      if (onStep) { try { onStep(s); } catch (e) {} }
      return s;
    }

    var report = { steps: steps, verdict: '', blockers: [], hints: [], inv: null };

    function finish(verdict, blockers, hints) {
      report.verdict = verdict;
      report.blockers = blockers || [];
      report.hints = hints || [];
      // Nettoyage défensif : aucune trace d'identifiants dans le rapport.
      report.verdict = window.VLog.redact(report.verdict);
      report.blockers = report.blockers.map(window.VLog.redact);
      report.hints = report.hints.map(window.VLog.redact);
      report.steps.forEach(function (s) { s.detail = window.VLog.redact(s.detail); });
      L(report.blockers.length ? 'warn' : 'success', 'Diagnostic terminé : ' + report.verdict);
      return report;
    }

    /* Étape 1 — URL (local, aucun réseau) */
    step('url', '1. Analyse de l\'URL du serveur', 'run', '');
    var p = parseServerUrl(cfg.b);
    if (!p.ok) {
      step('url', '1. Analyse de l\'URL du serveur', 'fail', p.error);
      return Promise.resolve(finish('URL invalide — rien n\'a été testé en réseau.',
        [p.error], ['Exemples valables : http://ma-iptv.ddns.net:8080 ou ma-iptv.ddns.net:8080']));
    }
    var base = p.base;
    // Normalisation : TOUS les appels suivants (apiUrl, mediaUrl…) lisent cfg.base
    cfg = { base: p.base, u: cfg.u, p: cfg.p };
    step('url', '1. Analyse de l\'URL du serveur', 'ok',
      p.scheme.toUpperCase() + ' → ' + p.host + ':' + p.port + (p.path ? p.path : '') +
      ' (API : player_api.php)');

    /* Étape 2 — contenu mixte (page HTTPS + serveur HTTP) */
    step('mixed', '2. Compatibilité HTTPS/mixed content', 'run', '');
    var pageHttps = pageProto(opts) === 'https:';
    if (pageHttps && p.scheme === 'http') {
      step('mixed', '2. Compatibilité HTTPS/mixed content', 'fail',
        'Page HTTPS + serveur HTTP = contenu mixte bloqué : L\'API ET la vidéo seront refusées par le navigateur.');
      return Promise.resolve(finish(
        'BLOCAGE HTTPS (mixed content) : impossible de tester plus loin depuis cette page.',
        ['La page est HTTPS, votre serveur Xtream est HTTP. Le navigateur bloque tout contenu HTTP (appels API comme vidéo).'],
        ['Option A : héberger l\'app en HTTP (un relais personnel HTTPS ou un serveur local). ' +
         'Option B : terminer le HTTPS devant votre serveur Xtream (reverse proxy maison). ' +
         'Aucun proxy tiers n\'est utilisé.']));
    }
    step('mixed', '2. Compatibilité HTTPS/mixed content', 'ok',
      pageHttps ? 'Page HTTPS + serveur HTTPS : cohérent.' : 'Page HTTP + serveur ' + p.scheme.toUpperCase() + ' : pas de blocage mixte.');

    /* Étape 3 — API sans CORS (portée réseau pure) */
    step('reach', '3. Joignabilité du serveur (sans CORS)', 'run', '');
    return reachProbe(cfg, opts).then(function (probe) {
      if (probe.mixed) {
        step('reach', '3. Joignabilité du serveur (sans CORS)', 'fail', 'Contenu mixte bloqué avant même l\'envoi.');
        return finish('BLOCAGE HTTPS (mixed content).', ['Page HTTPS / serveur HTTP'], []);
      }
      if (!probe.reachable) {
        step('reach', '3. Joignabilité du serveur (sans CORS)', 'fail',
          'Le navigateur n\'a pas eu de réponse en 8 s (DNS, port fermé, pare-feu, serveur arrêté, ou serveur trop lent).');
        return finish('Serveur injoignable ou trop lent — vérifiez URL, port, charge du serveur, et qu\'il tourne.',
          ['Aucune réponse réseau de ' + p.host + ':' + p.port + ' en 8 s.'],
          ['Depuis le PC : curl "' + window.VLog.redact(apiUrl({ base: base, u: 'U', p: 'P' }, null)) + '" (avec vos vrais identifiants).']);
      }
      step('reach', '3. Joignabilité du serveur (sans CORS)', 'ok',
        'Le serveur répond (requête non-lisible en no-cors : la portée réseau est prouvée).');

      /* Étape 4 — API lisible (CORS) */
      step('cors', '4. Lecture de l\'API Xtream (CORS)', 'run', '');
      return apiCall(cfg, null, opts).then(function (r) {
        if (r.kind === 'timeout') {
          step('cors', '4. Lecture de l\'API Xtream (CORS)', 'fail', r.error);
          return finish('Délai dépassé côté API.', ['Le serveur accepte la connexion mais ne répond pas en 8 s.'], []);
        }
        if (r.kind === 'net') {
          // Avant d'accuser le CORS, on vérifie qu'aucun intermédiaire réseau
          // ne répond à notre place (cf. intermediaryProbe) : sans cette
          // vérification, un proxy qui 502 partout serait pris pour un
          // serveur vivant → diagnostic « CORS » mensonger.
          return witness().then(function (inter) {
            if (inter.answered) {
              step('cors', '4. Lecture de l\'API Xtream (CORS)', 'fail',
                'La lecture échoue ET un URL morte-test répond aussi → un PROXY/intermédiaire réseau ' +
                'intercepte les requêtes : impossible de conclure sur le CORS depuis ici.');
              return finish(
                'Réseau INTERCEPTÉ (proxy) : le diagnostic ne peut pas trancher CORS vs injoignable.',
                ['Un intermédiaire réseau répond à la place du serveur pour tout port testé ' +
                 '(ici : même une URL morte renvoie une réponse).'],
                ['Désactivez le proxy/VPN de ce poste OU refaites le test directement sur la TV, ' +
                 'qui n\'a pas cet intermédiaire. Si la TV donne un résultat différent, c\'est elle qui fait foi.']);
            }
            step('cors', '4. Lecture de l\'API Xtream (CORS)', 'fail',
              'Portée prouvée à l\'étape 3 (vrai serveur, probe témoin mort = réseau sain) ' +
              'mais la lecture échoue → BLOCAGE CORS (pas de header Access-Control-Allow-Origin).');
            return finish('BLOCAGE CORS sur l\'API — l\'inventaire sera vide, mais un test de lecture direct peut encore marcher.',
              ['Votre serveur Xtream ne renvoie pas « Access-Control-Allow-Origin » pour cette origine (' + window.location.origin + ').'],
              ['Les <video> en MP4 n\'ont PAS besoin de CORS : la lecture directe reste testable. ' +
               'Seuls l\'inventaire (et le HLS, qui passe par XHR) en ont besoin. ' +
               'Remède autorisé UNIQUEMENT : votre propre relais personnel (documenté dans ARCHITECTURE.md), pas un service tiers.']);
          });
        }
        if (r.kind === 'http') {
          step('cors', '4. Lecture de l\'API Xtream (CORS)', 'ok',
            'CORS OK (réponse lisible) mais HTTP ' + r.status + ' — probablement authentification/proxy HTTP.');
          return finish('Serveur joignable et CORS OK, mais HTTP ' + r.status + ' sur player_api.php.',
            ['HTTP ' + r.status + ' : identifiants refusés, ou le chemin de l\'API est différent.'], []);
        }
        if (r.kind === 'json') {
          step('cors', '4. Lecture de l\'API Xtream (CORS)', 'warn', r.error);
          return finish('Réponse illisible (non-JSON) : URL probablement pointée vers un panel/admin plutôt que le panel client.',
            [r.error],
            ['Vérifiez que l\'URL se termine bien à la racine contenant player_api.php.']);
        }

        // Réponse JSON lisible : le CORS EST passé (sinon on n'aurait rien lu).
        step('cors', '4. Lecture de l\'API Xtream (CORS)', 'ok',
          'Réponse JSON lue en ' + r.ms + ' ms — CORS autorisé pour cette origine.');

        /* Étape 5 — authentification */
        step('auth', '5. Authentification (CORS déjà validé !)', 'run', '');
        var ui = r.json && r.json.user_info ? r.json.user_info : null;
        var authed = ui && (String(ui.auth) === '1' || ui.auth === true);
        if (!authed) {
          step('auth', '5. Authentification (CORS déjà validé !)', 'fail',
            'auth=0 : identifiants refusés par le serveur (la requête est arrivée et la réponse lue → CORS bon).');
          return finish('Identifiants refusés (le réseau et le CORS sont bons : c\'est une erreur de saisie ou un abonnement expiré).',
            ['Le serveur a répondu « auth=0 ».'],
            ['Contrôlez utilisateur/mot de passe dans votre panneau fournisseur. Compte expiré = même résultat.']);
        }
        var exp = ui.exp_date ? new Date(Number(ui.exp_date) * 1000).toLocaleDateString('fr-FR') : 'non renseignée';
        step('auth', '5. Authentification (CORS déjà validé !)', 'ok',
          'Compte actif — expiration : ' + exp +
          (ui.status ? ' · statut : ' + ui.status : '') +
          (ui.max_connections ? ' · connexions max : ' + ui.max_connections : ''));

        /* Étape 6 — inventaire */
        step('inv', '6. Inventaire (films / séries / direct)', 'run', '');
        return inventory(cfg, opts).then(function (inv) {
          report.inv = inv;
          if (inv.partial) {
            step('inv', '6. Inventaire (films / séries / direct)', 'warn',
              'Inventaire partiel — ' + inv.vod + ' films, ' + inv.series + ' séries, ' + inv.live +
              ' directs · erreurs : ' + inv.errors.join(' ; '));
            return finish('Accès API OK mais inventaire incomplet.', inv.errors,
              ['Les listes qui échouent subissent probablement un CORS spécifique à leur action.']);
          }
          step('inv', '6. Inventaire (films / séries / direct)', 'ok',
            inv.vod + ' films · ' + inv.series + ' séries · ' + inv.live + ' directs');
          return finish(
            'TOUT EST BON : API accessible, CORS OK, identifiants valides, ' +
            inv.vod + ' films et ' + inv.series + ' séries disponibles.',
            [],
            ['Reste à vérifier : codecs/conteneurs réellement servis (étape « Formats & codecs » pendant la lecture).']);
        });
      });
    });
  }

  /* ── 5. Lecture : conversion d\'un item en source VPlayer ──────────── */

  /** Détaille un film : renseigne le conteneur réellement servi. */
  function vodInfo(cfg, streamId, opts) {
    return apiCall(cfg, 'get_vod_info', opts, { vod_id: streamId }).then(function (r) {
      if (r.kind !== 'ok') throw new Error(r.error || 'get_vod_info illisible (' + r.kind + ')');
      return r.json;
    });
  }
  function seriesInfo(cfg, seriesId, opts) {
    return apiCall(cfg, 'get_series_info', opts, { series_id: seriesId }).then(function (r) {
      if (r.kind !== 'ok') throw new Error(r.error || 'get_series_info illisible (' + r.kind + ')');
      return r.json;
    });
  }

  /**
   * Construit la source de lecture. `kind` : 'movie' | 'episode'.
   * info = réponse get_vod_info/get_series_info → conteneur + extension réels.
   */
  function buildSource(cfg, kind, id, ext, label, info) {
    var url = mediaUrl(cfg, kind === 'episode' ? 'series' : 'movie', id, ext);
    var codec = 'inconnu';
    var container = (ext || '').toLowerCase();
    if (info && info.info && info.info.video) {
      var v = info.info.video;
      codec = [v.codec_name, v.width ? v.width + 'x' + v.height : '', v.bitrate ? Math.round(v.bitrate / 1000) + ' kb/s' : '']
        .filter(Boolean).join(' · ') || codec;
    }
    return {
      id: 'xtream-' + kind + '-' + id,
      label: label,
      type: container === 'mkv' ? 'mkv' : (container === 'm3u8' || container === 'hls' ? 'hls' : 'mp4'),
      url: url,
      note: 'Xtream · conteneur ' + (container || '?') + ' · codec ' + codec
    };
  }

  /**
   * Rapport « formats & codecs » (persisté SANS identifiants).
   * item : { kind, id, ext, label, container, codec, error }.
   */
  var LS_REPORT = 'xtream_format_report_v1';
  function reportAppend(entry) {
    try {
      var arr = JSON.parse(localStorage.getItem(LS_REPORT) || '[]');
      if (!Array.isArray(arr)) arr = [];
      entry.at = new Date().toISOString();
      arr.unshift(entry);
      while (arr.length > 40) arr.pop();
      localStorage.setItem(LS_REPORT, JSON.stringify(arr));   // jamais d'identifiants dans entry
      return arr;
    } catch (e) { return [entry]; }
  }
  function reportRead() {
    try { var a = JSON.parse(localStorage.getItem(LS_REPORT) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function reportClear() { try { localStorage.removeItem(LS_REPORT); } catch (e) {} }

  window.VXtream = {
    parseServerUrl: parseServerUrl,
    apiUrl: apiUrl,
    mediaUrl: mediaUrl,
    apiCall: apiCall,
    mediaProbe: mediaProbe,
    inventory: inventory,
    diagnose: diagnose,
    vodUrl: vodUrl,
    episodeUrl: episodeUrl,
    vodInfo: vodInfo,
    seriesInfo: seriesInfo,
    buildSource: buildSource,
    reportAppend: reportAppend,
    reportRead: reportRead,
    reportClear: reportClear
  };
})();
