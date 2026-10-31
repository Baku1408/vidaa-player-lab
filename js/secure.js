/* VIDAA Player Lab — coffre-fort de session pour les identifiants Xtream
 * ═══════════════════════════════════════════════════════════════════════
 * Principes (non négociables) :
 *  - Les identifiants ne sont JAMAIS écrits dans le dépôt Git, le code, les
 *    journaux, ni une URL de page.
 *  - Seul lieu de stockage : le localStorage de CETTE télévision, CHIFFRÉ
 *    AES-GCM 256 (clé dérivée PBKDF2-SHA-256, 150 000 itérations, sel aléatoire).
 *  - La phrase secrète n'est jamais stockée : elle reste en mémoire le temps
 *    de la session (après rechargement → nouvelle saisie).
 *  - Aucun réseau : ce module n'envoie RIEN nulle part.
 *  - Si WebCrypto est indisponible (contexte non sécurisé / vieux navigateur),
 *    on REFUSE de stocker (mémoire seule) plutôt que de stocker en clair.
 * ═══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LS_KEY = 'xtream_vault_v1';
  var ITER = 150000;
  var mem = null;          // { b: baseUrl, u: username, p: password } — mémoire uniquement

  function L(level, msg) { window.VLog.log(level, 'vault', msg); }

  function subtle() {
    try { return (window.crypto && window.crypto.subtle) ? window.crypto.subtle : null; }
    catch (e) { return null; }
  }

  function available() { return subtle() !== null; }

  function toB64(buf) {
    var bytes = new Uint8Array(buf), s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    try { return btoa(s); } catch (e) { return null; }
  }
  function fromB64(str) {
    var s = atob(str), bytes = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
    return bytes.buffer;
  }

  function deriveKey(passphrase, salt) {
    var enc = new TextEncoder();
    return subtle().importKey('raw', enc.encode(String(passphrase)), 'PBKDF2', false, ['deriveKey'])
      .then(function (baseKey) {
        return subtle().deriveKey(
          { name: 'PBKDF2', salt: salt, iterations: ITER, hash: 'SHA-256' },
          baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      });
  }

  /** Chiffre et persiste les identifiants. Refuse si pas de WebCrypto. */
  function save(cfg, passphrase) {
    if (!available()) {
      return Promise.reject(new Error('WebCrypto indisponible : stockage chiffré impossible, rien n\'a été enregistré.'));
    }
    if (!cfg || !cfg.b || !cfg.u || !cfg.p) return Promise.reject(new Error('Serveur, utilisateur et mot de passe requis.'));
    if (!passphrase || String(passphrase).length < 6) return Promise.reject(new Error('Phrase secrète : 6 caractères minimum.'));
    var salt = window.crypto.getRandomValues(new Uint8Array(16));
    var iv = window.crypto.getRandomValues(new Uint8Array(12));
    var enc = new TextEncoder();
    var payload = enc.encode(JSON.stringify({ b: cfg.b, u: cfg.u, p: cfg.p }));
    return deriveKey(passphrase, salt).then(function (key) {
      return subtle().encrypt({ name: 'AES-GCM', iv: iv }, key, payload);
    }).then(function (ct) {
      var blob = { v: 1, alg: 'AES-GCM/PBKDF2-SHA256/' + ITER, salt: toB64(salt.buffer), iv: toB64(iv.buffer), ct: toB64(ct) };
      localStorage.setItem(LS_KEY, JSON.stringify(blob));
      mem = { b: cfg.b, u: cfg.u, p: cfg.p };
      L('success', 'Identifiants chiffrés et mémorisés sur cette TV (' + blob.alg + '). La phrase secrète n\'est pas conservée.');
      return true;
    });
  }

  /** Déchiffre le coffre et garde les identifiants en mémoire. */
  function unlock(passphrase) {
    if (!available()) return Promise.reject(new Error('WebCrypto indisponible.'));
    var blob = null;
    try { blob = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) {}
    if (!blob) return Promise.reject(new Error('Aucun coffre enregistré sur cette TV.'));
    var salt, iv, ct;
    try { salt = fromB64(blob.salt); iv = fromB64(blob.iv); ct = fromB64(blob.ct); }
    catch (e) { return Promise.reject(new Error('Coffre illisible.')); }
    return deriveKey(passphrase, salt).then(function (key) {
      return subtle().decrypt({ name: 'AES-GCM', iv: new Uint8Array(iv) }, key, ct);
    }).then(function (pt) {
      var obj = JSON.parse(new TextDecoder().decode(pt));
      mem = { b: obj.b, u: obj.u, p: obj.p };
      L('success', 'Coffre déverrouillé pour cette session (mémoire uniquement).');
      return mem;
    }).catch(function () {
      // On conserve une éventuelle session déjà valide : un essai raté ne
      // doit pas déverrouiller ce qui fonctionnait.
      L('warn', 'Phrase secrète incorrecte ou coffre corrompu (session en cours inchangée).');
      return Promise.reject(new Error('Phrase secrète incorrecte (ou coffre corrompu).'));
    });
  }

  /** Identifiants en mémoire, ou null. Ne jamais journaliser la valeur. */
  function get() { return mem; }
  function locked() { return mem === null; }
  function exists() {
    try { return localStorage.getItem(LS_KEY) !== null; } catch (e) { return false; }
  }
  function forget() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    mem = null;
    L('info', 'Coffre supprimé de cette TV (identifiants oubliés).');
  }

  window.VSecure = {
    available: available,
    save: save,
    unlock: unlock,
    get: get,
    locked: locked,
    exists: exists,
    forget: forget
  };
})();
