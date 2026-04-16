/**
 * sw.js — Service Worker WorldTV Pro
 * Gère le cache offline et les fonctionnalités PWA pour l'application IPTV
 */

const VERSION_CACHE = 'worldtv-v2.0';

// Fichiers à mettre en cache pour le mode hors ligne
const FICHIERS_CACHE = [
    '/iptv/index.php',
    '/iptv/api.php',
    '/iptv/config.php',
    '/iptv/manifest.json',
    '/iptv/icons/icon-192.png',
    '/iptv/icons/icon-512.png',
];

// ── Installation : mise en cache des fichiers essentiels ──
self.addEventListener('install', event => {
    console.log('[SW] Installation WorldTV Pro v2.0');
    event.waitUntil(
        caches.open(VERSION_CACHE).then(cache => {
            console.log('[SW] Mise en cache des fichiers essentiels');
            return cache.addAll(FICHIERS_CACHE).catch(err => {
                console.warn('[SW] Certains fichiers non cachés:', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// ── Activation : supprimer les anciens caches ──
self.addEventListener('activate', event => {
    console.log('[SW] Activation');
    event.waitUntil(
        caches.keys().then(cles => {
            return Promise.all(
                cles.filter(cle => cle !== VERSION_CACHE)
                    .map(cle => {
                        console.log('[SW] Suppression ancien cache:', cle);
                        return caches.delete(cle);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// ── Fetch : stratégie Cache puis Réseau ──
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Ne pas cacher les requêtes API, images dynamiques et POST
    if (
        event.request.method === 'POST' ||
        url.pathname.includes('api.php') ||
        url.search.includes('action=') ||
        event.request.url.includes('.m3u8') ||
        event.request.url.includes('live-stream')
    ) {
        // Réseau uniquement pour les requêtes dynamiques
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response(
                    JSON.stringify({ error: 'Pas de connexion internet. Vérifiez votre réseau.' }),
                    { headers: { 'Content-Type': 'application/json' } }
                );
            })
        );
        return;
    }

    // Stratégie : Cache d'abord, puis réseau (pour les pages)
    event.respondWith(
        caches.match(event.request).then(reponseCache => {
            if (reponseCache) {
                // Mettre à jour en arrière-plan
                fetch(event.request).then(reponseReseau => {
                    if (reponseReseau && reponseReseau.status === 200) {
                        caches.open(VERSION_CACHE).then(cache => {
                            cache.put(event.request, reponseReseau.clone());
                        });
                    }
                }).catch(() => {});
                return reponseCache;
            }

            // Pas en cache → réseau
            return fetch(event.request).then(reponseReseau => {
                if (!reponseReseau || reponseReseau.status !== 200) return reponseReseau;
                const cloneReponse = reponseReseau.clone();
                caches.open(VERSION_CACHE).then(cache => {
                    cache.put(event.request, cloneReponse);
                });
                return reponseReseau;
            }).catch(() => {
                // Page hors ligne
                return caches.match('/iptv/index.php').then(page => {
                    return page || new Response(
                        `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width">
                        <title>WorldTV Pro — Hors ligne</title>
                        <style>
                            body{font-family:'DM Sans', sans-serif;background:#08080f;color:white;
                            display:flex;flex-direction:column;align-items:center;
                            justify-content:center;height:100vh;gap:16px;padding:24px;text-align:center;}
                            h1{font-size:28px;color:#e50914;} p{opacity:.8;line-height:1.6;}
                            button{background:#e50914;border:none;color:white;padding:14px 28px;
                            border-radius:8px;font-size:16px;font-weight:600;cursor:pointer;margin-top:8px;}
                        </style></head>
                        <body>
                            <div style="font-size:64px">📺</div>
                            <h1>WorldTV Pro</h1>
                            <p>Vous êtes hors ligne.<br>Vérifiez votre connexion internet<br>pour utiliser l'application.</p>
                            <button onclick="window.location.reload()">🔄 Réessayer</button>
                        </body></html>`,
                        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                    );
                });
            });
        })
    );
});

// ── Message du client (mise à jour manuelle) ──
self.addEventListener('message', event => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    if (event.data === 'CLEAR_CACHE') {
        caches.delete(VERSION_CACHE).then(() => {
            event.ports[0].postMessage('Cache supprimé');
        });
    }
});