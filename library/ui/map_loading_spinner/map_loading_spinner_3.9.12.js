/**
 * @license Mozilla Public License Version 2.0
 * This script has been developed by the "community"
 * There isn't any guarantee that this script will work on another version of Lizmap Web Client.
 */

/**
 * Map loading spinner
 *
 * Displays a spinner in the center of the map while layers are loading
 * (pan, zoom, layer toggled on, filter applied...).
 *
 * How it works:
 *  - map image requests (WMS GetMap, WMTS GetTile, tiles) sent through <img>, fetch
 *    or XMLHttpRequest are counted; the spinner is shown while at least one is pending;
 *  - the OpenLayers `loadend` event (when available) resets the counter, so tiles
 *    cancelled during a pan cannot keep the spinner visible;
 *  - a safety timeout hides the spinner if a request never completes.
 *
 * Console helpers: lizSpinner.show(), lizSpinner.hide(), lizSpinner.status()
 *
 * Tested with Lizmap Web Client 3.6.12.
 */
(function () {
    'use strict';

    const TAG = '[Lizmap Spinner]';

    // ----------------------------------------------------------- Settings
    const SHOW_DELAY = 150;        // ms before showing the spinner (avoids flickering)
    const SAFETY_TIMEOUT = 20000;  // ms, forced hide if a request hangs
    const Z_INDEX = 1040;          // below Bootstrap modals (1050)
    const SPINNER_SIZE = 56;                          // diameter in px
    const SPINNER_THICKNESS = 8;                      // ring width in px
    const SPINNER_COLOR = '#0d3b66';                  // rotating arc
    const SPINNER_TRACK = 'rgba(13, 59, 102, 0.25)';  // background ring

    // Requests considered as "map loading"
    const MAP_REQUEST = /(GetMap|GetTile|GetLegendGraphic|\/tile\/|\.png|\.jpe?g|\.webp)/i;
    const SERVICE_HINT = /(lizmap\/service|SERVICE=W[MF]T?S|wms|wmts|tile)/i;

    let spinner = null;
    let pending = 0;
    let showTimer = null;
    let safetyTimer = null;
    let initialized = false;

    // ----------------------------------------------------------------- UI
    function injectStyles() {
        if (document.getElementById('lizmap-map-spinner-styles')) return;
        const style = document.createElement('style');
        style.id = 'lizmap-map-spinner-styles';
        style.textContent = `
            #map-loading-spinner {
                position: fixed;
                z-index: ${Z_INDEX};
                display: none;
                transform: translate(-50%, -50%);
                pointer-events: none;
            }
            #map-loading-spinner .spinner-icon {
                width: ${SPINNER_SIZE}px;
                height: ${SPINNER_SIZE}px;
                border: ${SPINNER_THICKNESS}px solid ${SPINNER_TRACK};
                border-top-color: ${SPINNER_COLOR};
                border-radius: 50%;
                animation: map-spinner-rotate 0.8s linear infinite;
                filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.9));
            }
            @keyframes map-spinner-rotate { to { transform: rotate(360deg); } }
        `;
        document.head.appendChild(style);
    }

    function ensureSpinner() {
        if (spinner && document.body.contains(spinner)) return spinner;
        spinner = document.getElementById('map-loading-spinner');
        if (!spinner) {
            spinner = document.createElement('div');
            spinner.id = 'map-loading-spinner';
            spinner.innerHTML = '<div class="spinner-icon"></div>';
            document.body.appendChild(spinner);
        }
        return spinner;
    }

    // Biggest visible map container
    function visibleMapRect() {
        const candidates = document.querySelectorAll(
            '#newOlMap, #map, #map-content, .ol-viewport, .olMapViewport'
        );
        let best = null;
        let bestArea = 0;
        candidates.forEach((el) => {
            const r = el.getBoundingClientRect();
            const area = r.width * r.height;
            if (area > bestArea && getComputedStyle(el).visibility !== 'hidden') {
                best = r;
                bestArea = area;
            }
        });
        return best;
    }

    // Center the spinner on the map (or on the window as a fallback)
    function place() {
        const r = visibleMapRect();
        const s = ensureSpinner();
        s.style.left = (r ? r.left + r.width / 2 : window.innerWidth / 2) + 'px';
        s.style.top = (r ? r.top + r.height / 2 : window.innerHeight / 2) + 'px';
    }

    function show() { place(); ensureSpinner().style.display = 'flex'; }
    function hide() { if (spinner) spinner.style.display = 'none'; }

    // ------------------------------------------------------------ Counter
    function update() {
        if (pending > 0) {
            if (!showTimer && (!spinner || spinner.style.display !== 'flex')) {
                showTimer = setTimeout(() => {
                    showTimer = null;
                    if (pending > 0) show();
                }, SHOW_DELAY);
            }
            clearTimeout(safetyTimer);
            safetyTimer = setTimeout(reset, SAFETY_TIMEOUT);
        } else {
            clearTimeout(showTimer);
            clearTimeout(safetyTimer);
            showTimer = null;
            hide();
        }
    }
    function inc() { pending++; update(); }
    function dec() { pending = Math.max(0, pending - 1); update(); }
    function reset() { pending = 0; update(); }

    // ------------------------------------------ 1) Network requests hooks
    function isMapRequest(url) {
        url = String(url || '');
        return SERVICE_HINT.test(url) && MAP_REQUEST.test(url);
    }

    // fetch
    if (window.fetch && !window.fetch.__lizSpinner) {
        const origFetch = window.fetch;
        const wrapped = function (input, init) {
            const url = typeof input === 'string' ? input : (input && input.url);
            const body = init && typeof init.body === 'string' ? init.body : '';
            if (!isMapRequest(url) && !isMapRequest(url + body)) return origFetch.apply(this, arguments);
            inc();
            return origFetch.apply(this, arguments).finally(dec);
        };
        wrapped.__lizSpinner = true;
        window.fetch = wrapped;
    }

    // XMLHttpRequest
    (function () {
        const XHR = window.XMLHttpRequest;
        if (!XHR || XHR.prototype.__lizSpinner) return;
        const open = XHR.prototype.open;
        const send = XHR.prototype.send;
        XHR.prototype.open = function (method, url) {
            this.__lizUrl = url;
            return open.apply(this, arguments);
        };
        XHR.prototype.send = function (body) {
            const full = String(this.__lizUrl) + (typeof body === 'string' ? body : '');
            if (isMapRequest(this.__lizUrl) || isMapRequest(full)) {
                inc();
                this.addEventListener('loadend', dec, { once: true });
            }
            return send.apply(this, arguments);
        };
        XHR.prototype.__lizSpinner = true;
    })();

    // <img>.src (default loading method for OpenLayers WMS images and tiles)
    (function () {
        const desc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        if (!desc || !desc.set || HTMLImageElement.prototype.__lizSpinner) return;
        Object.defineProperty(HTMLImageElement.prototype, 'src', {
            configurable: true,
            enumerable: desc.enumerable,
            get: desc.get,
            set: function (value) {
                if (isMapRequest(value) && !this.__lizCounting) {
                    this.__lizCounting = true;
                    inc();
                    const done = () => {
                        if (!this.__lizCounting) return;
                        this.__lizCounting = false;
                        this.removeEventListener('load', done);
                        this.removeEventListener('error', done);
                        dec();
                    };
                    this.addEventListener('load', done);
                    this.addEventListener('error', done);
                }
                return desc.set.call(this, value);
            },
        });
        HTMLImageElement.prototype.__lizSpinner = true;
    })();

    // ------------------------------------ 2) OpenLayers events (clean end)
    function watchOlMap(olMap) {
        if (!olMap || olMap.__lizSpinner) return;
        olMap.__lizSpinner = true;
        if (typeof olMap.on === 'function') {
            // OpenLayers >= 6.14: `loadend` = every layer is rendered
            try { olMap.on('loadend', reset); } catch (e) { /* older OpenLayers */ }
        } else if (olMap.events && olMap.events.register) {
            // OpenLayers 2
            olMap.events.register('moveend', olMap, () => setTimeout(() => { if (pending === 0) hide(); }, 500));
        }
    }

    // --------------------------------------------------------------- Init
    function init() {
        injectStyles();
        ensureSpinner();
        if (typeof lizMap !== 'undefined') {
            watchOlMap(lizMap.mainLizmap && lizMap.mainLizmap.map);
            watchOlMap(lizMap.map);
        }
        if (!initialized) {
            initialized = true;
            window.addEventListener('resize', () => {
                if (spinner && spinner.style.display === 'flex') place();
            });
            console.log(TAG, 'enabled.');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    if (typeof lizMap !== 'undefined' && lizMap.events) {
        lizMap.events.on({ uicreated: init });
    }

    // Console helpers
    window.lizSpinner = {
        show,
        hide,
        status: () => ({
            pending,
            visible: !!spinner && spinner.style.display === 'flex',
            mapRect: visibleMapRect(),
        }),
    };
})();
