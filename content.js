(() => {
    'use strict';

    // =========================================================
    // CONFIG
    // =========================================================

    const OMDB_API_KEY = '213270c7';
    const AGREGARR_URL = 'https://api.agregarr.org/api/ratings?id=';
    const BADGE_ID = 'prime-imdb-rating';
    const NETFLIX_BADGE_ID = 'streamrate-netflix-rating';

    let currentKey = null;
    let requestId = 0;
    let detectionTimer = null;
    let lastURL = location.href;

    const ratingCache = new Map();

    // =========================================================
    // LOG
    // =========================================================

    function log(...args) {
        console.log('🎬 StreamRate:', ...args);
    }

    // =========================================================
    // REMOVE RATING
    // =========================================================

    function removeRating() {
        const primeBadge = document.getElementById(BADGE_ID);
        const netflixBadge = document.getElementById(NETFLIX_BADGE_ID);

        if (primeBadge) {
            primeBadge.remove();
        }

        if (netflixBadge) {
            netflixBadge.remove();
        }
    }

    // =========================================================
    // PRIME TITLE PAGE
    // =========================================================

    function isPrimeTitlePage() {
        return window.location.pathname.includes('/detail/');
    }

    // =========================================================
    // NETFLIX TITLE PAGE / MODAL
    // =========================================================

    function isNetflixTitlePage() {
        return (
            location.hostname.includes('netflix.com') &&
            location.pathname === '/browse' &&
            new URLSearchParams(location.search).has('jbv')
        );
    }

    function cleanNetflixTitle(text) {
        if (!text) {
            return null;
        }

        let title = text.trim();

        // Netflix usually exposes the current modal title
        // through the browser document title.
        title = title.replace(/\s*[-–—]\s*Netflix\s*$/i, '');

        // Defensive cleanup for occasional title variants.
        title = title.replace(/^Netflix\s*:\s*/i, '');

        return title.trim();
    }

    function findNetflixTitle() {
        // 1. Best source: browser tab title.
        const documentTitle = document.title?.trim();

        if (documentTitle) {
            const title = cleanNetflixTitle(documentTitle);

            if (isValidTitle(title)) {
                return title;
            }
        }

        // 2. Open Netflix modal title-treatment image.
        // The title is often rendered inside the image itself,
        // so we only use accessible text/attributes when Netflix
        // provides them. We do NOT attempt OCR.
        const logo = document.querySelector(
            'img.previewModal--player-titleTreatment-logo[alt]'
        );

        if (logo) {
            const alt = logo.alt?.trim();

            if (alt) {
                const title = cleanNetflixTitle(alt);

                if (isValidTitle(title)) {
                    return title;
                }
            }
        }

        // 3. Generic title-treatment elements.
        const selectors = [
            '[data-uia*="title"]',
            '[aria-label*="title" i]'
        ];

        for (const selector of selectors) {
            const elements = document.querySelectorAll(selector);

            for (const element of elements) {
                const text =
                    element.getAttribute('aria-label') ||
                    element.textContent?.trim();

                const title = cleanNetflixTitle(text);

                if (isValidTitle(title)) {
                    return title;
                }
            }
        }

        return null;
    }

    function getNetflixModal() {
        return (
            document.querySelector('.previewModal--wrapper') ||
            document.querySelector('[class*="previewModal--wrapper"]') ||
            document.querySelector('[class*="previewModal"]')
        );
    }

    // =========================================================
    // FIND PRIME TITLE
    // =========================================================

    function findPrimeTitle() {

        // =========================================================
        // CLEAN PRIME TITLE
        // =========================================================

        function cleanPrimeTitle(text) {
            if (!text) {
                return null;
            }

            let title = text.trim();

            // Remove "Prime Video:" prefix
            title = title.replace(
                /^Prime Video\s*:\s*/i,
                ''
            );

            // Remove season/episode suffixes:
            //
            // Taxi Driver - Season 1
            // Taxi Driver - Season 2
            // Sterling Point - S1
            // Sterling Point - S1 - E1
            // Some Show S1
            // Some Show - S01
            //
            title = title.replace(
                /\s*[-–—]?\s*S(?:eason)?\s*\d+(?:\s*[-–—]?\s*E(?:pisode)?\s*\d+)?\s*$/i,
                ''
            );

            // Also handle "Season 1" without S
            title = title.replace(
                /\s*[-–—]\s*Season\s+\d+(?:\s*[-–—]\s*Episode\s+\d+)?\s*$/i,
                ''
            );

            // Handle "- Episode 1" if it appears alone
            title = title.replace(
                /\s*[-–—]\s*Episode\s+\d+\s*$/i,
                ''
            );

            return title.trim();
        }

        // =========================================================
        // 1. DOCUMENT TITLE
        // =========================================================

        const documentTitle = document.title?.trim();

        if (documentTitle) {

            const title = cleanPrimeTitle(documentTitle);

            if (isValidTitle(title)) {
                return title;
            }
        }

        // =========================================================
        // 2. OG / META TITLE
        // =========================================================

        const metaSelectors = [
            'meta[property="og:title"]',
            'meta[name="twitter:title"]'
        ];

        for (const selector of metaSelectors) {

            const meta = document.querySelector(selector);
            const content = meta?.content?.trim();

            if (!content) {
                continue;
            }

            const title = cleanPrimeTitle(content);

            if (isValidTitle(title)) {
                return title;
            }
        }

        // =========================================================
        // 3. PRIME TITLE ELEMENTS
        // =========================================================

        const selectors = [
            '[data-testid*="title"]',
            '[data-automation-id*="title"]'
        ];

        for (const selector of selectors) {

            const elements =
                document.querySelectorAll(selector);

            for (const element of elements) {

                const text = element.innerText?.trim();

                if (!text) {
                    continue;
                }

                const title = cleanPrimeTitle(text);

                if (isValidTitle(title)) {
                    return title;
                }
            }
        }

        // =========================================================
        // 4. H1 FALLBACK
        // =========================================================

        const h1s = document.querySelectorAll('h1');

        for (const h1 of h1s) {

            const text = h1.innerText?.trim();

            if (!text) {
                continue;
            }

            const title = cleanPrimeTitle(text);

            if (isValidTitle(title)) {
                return title;
            }
        }

        // =========================================================
        // 5. IMAGE ALT FALLBACK
        // =========================================================

        const images =
            document.querySelectorAll('img[alt]');

        for (const image of images) {

            const alt = image.alt?.trim();

            if (!alt || alt.length > 120) {
                continue;
            }

            const title = cleanPrimeTitle(alt);

            if (isValidTitle(title)) {
                return title;
            }
        }

        return null;
    }

    // =========================================================
    // VALID TITLE
    // =========================================================

    function isValidTitle(text) {

        if (!text) {
            return false;
        }

        text = text.trim();

        if (text.length < 2 || text.length > 120) {
            return false;
        }

        const lower = text.toLowerCase();

        // =========================================================
        // NEVER ACCEPT PRIME UI LABELS AS MOVIE/SERIES TITLES
        // =========================================================

        const blockedExact = [

            'prime video',

            'watch with a prime membership',

            'watch now',

            'subscribe',

            'sign in',

            'home',

            'movies',

            'tv shows',

            'episodes',

            'related',

            'details',

            'explore',

            'rent',

            'buy now',

            'cast',

            'cast:',

            'season',

            'season 1',
            'season 2',
            'season 3',
            'season 4',
            'season 5',

            'trailer',
            'trailers',

            'more like this',

            'customer reviews',

            'watch movies, tv shows, sports, and live tv',

            'watch movies, tv shows, sports, and live tv.',

            'prime video'
        ];

        if (blockedExact.includes(lower)) {
            return false;
        }

        // =========================================================
        // REJECT UI LABELS ENDING WITH :
        // =========================================================

        const blockedPrefixes = [

            'cast:',
            'details:',
            'genre:',
            'genres:',
            'language:',
            'languages:',
            'audio:',
            'subtitles:',
            'director:',
            'directors:',
            'stars:',
            'starring:',
            'creators:',
            'creator:'
        ];

        for (const prefix of blockedPrefixes) {

            if (lower.startsWith(prefix)) {
                return false;
            }
        }

        // =========================================================
        // REJECT PURE SEASON / EPISODE LABELS
        // =========================================================

        if (/^season\s+\d+$/i.test(text)) {
            return false;
        }

        if (/^episode\s+\d+$/i.test(text)) {
            return false;
        }

        if (/^\d+\s+seasons?$/i.test(text)) {
            return false;
        }

        if (/^\d+\s+episodes?$/i.test(text)) {
            return false;
        }

        // =========================================================
        // REJECT OBVIOUS NAVIGATION TEXT
        // =========================================================

        const blockedWords = [
            'watch now',
            'watch with',
            'sign in',
            'buy now',
            'rent now',
            'subscribe now'
        ];

        for (const word of blockedWords) {

            if (lower.includes(word)) {
                return false;
            }
        }

        return true;
    }

    // =========================================================
    // DETECT MOVIE / SERIES
    // =========================================================

    function detectType() {

        /*
         * Look for season information.
         */

        const text =
            document.body.innerText || '';

        if (
            /\bSeason\s+\d+\b/i.test(text) ||
            /\b\d+\s+seasons?\b/i.test(text)
        ) {
            return 'series';
        }

        /*
         * Episodes are a secondary signal.
         */

        if (
            /\b\d+\s+episodes?\b/i.test(text)
        ) {
            return 'series';
        }

        return 'movie';
    }

    // =========================================================
    // FIND YEAR
    // =========================================================

    function findYear() {

        const text =
            document.body.innerText || '';

        const matches =
            text.match(/\b(?:19|20)\d{2}\b/g);

        if (!matches) {
            return null;
        }

        const currentYear =
            new Date().getFullYear();

        for (const year of matches) {

            const number = Number(year);

            if (
                number >= 1900 &&
                number <= currentYear + 2
            ) {
                return year;
            }
        }

        return null;
    }

    // =========================================================
    // NETFLIX TYPE / YEAR
    // =========================================================

    function detectNetflixType() {

        const modal = getNetflixModal();

        if (!modal) {
            return null;
        }

        const text = modal.innerText || '';

        if (
            /\b\d+\s+seasons?\b/i.test(text) ||
            /\bseason\s+\d+\b/i.test(text)
        ) {
            return 'series';
        }

        return 'movie';
    }

    function findNetflixYear() {

        const modal = getNetflixModal();

        if (!modal) {
            return null;
        }

        const text = modal.innerText || '';

        const matches =
            text.match(/\b(?:19|20)\d{2}\b/g);

        if (!matches) {
            return null;
        }

        const currentYear = new Date().getFullYear();

        for (const year of matches) {

            const number = Number(year);

            if (
                number >= 1900 &&
                number <= currentYear + 2
            ) {
                return year;
            }
        }

        return null;
    }

    // =========================================================
    // EXTRACT NETFLIX METADATA
    // =========================================================

    function extractNetflixMetadata() {

        if (!isNetflixTitlePage()) {
            return null;
        }

        const title = findNetflixTitle();

        if (!title) {
            return null;
        }

        const type = detectNetflixType();

        if (!type) {
            return null;
        }

        return {
            title,
            type,
            year:
                type === 'movie'
                    ? findNetflixYear()
                    : null
        };
    }

    // =========================================================
    // EXTRACT METADATA
    // =========================================================

    function extractMetadata() {

        if (isPrimeTitlePage()) {
            return extractPrimeMetadata();
        }

        if (isNetflixTitlePage()) {
            return extractNetflixMetadata();
        }

        return null;
    }

    function extractPrimeMetadata() {

        if (!isPrimeTitlePage()) {
            return null;
        }

        const title = findPrimeTitle();

        if (!title) {
            return null;
        }

        const type = detectType();

        /*
         * IMPORTANT:
         *
         * Movie:
         *   title + year
         *
         * Series:
         *   title only
         */

        const year =
            type === 'movie'
                ? findYear()
                : null;

        return {
            title,
            type,
            year
        };
    }

    // =========================================================
    // UNIQUE KEY
    // =========================================================

    function getKey(metadata) {

        return [
            metadata.title.toLowerCase(),
            metadata.type,
            metadata.year || ''
        ].join('|');
    }

    // =========================================================
    // MAIN DETECTION
    // =========================================================

    function detectTitle() {

        /*
         * If Prime is not on a detail page,
         * remove everything.
         */

        if (
            !isPrimeTitlePage() &&
            !isNetflixTitlePage()
        ) {

            if (currentKey !== null) {

                currentKey = null;
                requestId++;

                removeRating();
            }

            return;
        }

        const metadata =
            extractMetadata();

        /*
         * Prime hasn't finished rendering yet.
         *
         * IMPORTANT:
         * Do NOT set currentKey here.
         *
         * This allows the next mutation/retry to try again.
         */

        if (!metadata) {
            return;
        }

        const key = getKey(metadata);

        /*
         * Same title.
         */

        if (key === currentKey) {
            return;
        }

        /*
         * NEW TITLE
         */

        currentKey = key;

        /*
         * Kill any previous request.
         */

        requestId++;

        const thisRequest = requestId;

        /*
         * Immediately remove old rating.
         */

        removeRating();

        log(
            '🎬 New StreamRate title:',
            metadata
        );

        getIMDbRating(
            metadata,
            thisRequest
        );
    }

    // =========================================================
    // OMDb
    // =========================================================

    async function getIMDbRating(
        metadata,
        thisRequest
    ) {

        const cacheKey =
            getKey(metadata);

        /*
         * CACHE
         */

        if (ratingCache.has(cacheKey)) {

            const cached =
                ratingCache.get(cacheKey);

            if (
                thisRequest !== requestId
            ) {
                return;
            }

            if (cached.rating) {

                showRating(
                    cached.rating,
                    thisRequest
                );
            }

            return;
        }

        log(
            '🔎 OMDb:',
            metadata.title
        );

        const params =
            new URLSearchParams();

        params.set(
            'apikey',
            OMDB_API_KEY
        );

        params.set(
            't',
            metadata.title
        );

        params.set(
            'type',
            metadata.type
        );

        /*
         * ONLY MOVIES GET YEAR.
         */

        if (
            metadata.type === 'movie' &&
            metadata.year
        ) {

            params.set(
                'y',
                metadata.year
            );
        }

        const url =
            `https://www.omdbapi.com/?${params.toString()}`;

        try {

            const response =
                await fetch(url);

            const movie =
                await response.json();

            /*
             * Old request?
             */

            if (
                thisRequest !== requestId
            ) {
                return;
            }

            if (
                !movie ||
                movie.Response !== 'True'
            ) {

                log(
                    '❌ OMDb not found:',
                    metadata.title
                );

                ratingCache.set(
                    cacheKey,
                    {
                        rating: null
                    }
                );

                return;
            }

            log(
                '✅ OMDb match:',
                movie.Title,
                movie.Year,
                movie.imdbID
            );

            const imdbId =
                movie.imdbID;

            /*
             * =================================================
             * OMDb IMDb rating
             * =================================================
             */

            const imdbRating =
                movie.imdbRating &&
                movie.imdbRating !== 'N/A'
                    ? movie.imdbRating
                    : null;

            if (imdbRating) {

                log(
                    '⭐ IMDb:',
                    imdbRating
                );

                ratingCache.set(
                    cacheKey,
                    {
                        rating: imdbRating,
                        imdbId
                    }
                );

                showRating(
                    imdbRating,
                    thisRequest
                );

                return;
            }

            /*
             * =================================================
             * AGREGARR FALLBACK
             * =================================================
             */

            if (!imdbId) {

                ratingCache.set(
                    cacheKey,
                    {
                        rating: null
                    }
                );

                return;
            }

            log(
                '⚠️ OMDb IMDb rating N/A',
            );

            log(
                '🔄 Trying Agregarr:',
                imdbId
            );

            const agregarrRating =
                await getAgregarrRating(
                    imdbId,
                    thisRequest
                );

            if (
                thisRequest !== requestId
            ) {
                return;
            }

            if (agregarrRating) {

                log(
                    '⭐ Agregarr IMDb:',
                    agregarrRating
                );

                ratingCache.set(
                    cacheKey,
                    {
                        rating: agregarrRating,
                        imdbId
                    }
                );

                showRating(
                    agregarrRating,
                    thisRequest
                );

                return;
            }

            ratingCache.set(
                cacheKey,
                {
                    rating: null,
                    imdbId
                }
            );

        } catch (error) {

            if (
                thisRequest !== requestId
            ) {
                return;
            }

            console.error(
                '❌ OMDb error:',
                error
            );
        }
    }

    // =========================================================
    // AGREGARR
    // =========================================================

    async function getAgregarrRating(
        imdbId,
        thisRequest
    ) {

        try {

            const response =
                await fetch(
                    AGREGARR_URL +
                    encodeURIComponent(imdbId)
                );

            const data =
                await response.json();

            if (
                thisRequest !== requestId
            ) {
                return null;
            }

            /*
             * Handle common Agregarr response shapes.
             */

            if (Array.isArray(data)) {

                for (const item of data) {

                    if (
                        item &&
                        item.rating !== undefined &&
                        item.rating !== null
                    ) {

                        return Number(
                            item.rating
                        ).toFixed(1);
                    }
                }
            }

            if (
                data &&
                data.rating !== undefined &&
                data.rating !== null
            ) {

                return Number(
                    data.rating
                ).toFixed(1);
            }

            /*
             * Some responses can contain an IMDb object.
             */

            if (
                data &&
                data.imdb &&
                data.imdb.rating !== undefined
            ) {

                return Number(
                    data.imdb.rating
                ).toFixed(1);
            }

            return null;

        } catch (error) {

            if (
                thisRequest !== requestId
            ) {
                return null;
            }

            console.error(
                '❌ Agregarr error:',
                error
            );

            return null;
        }
    }

    // =========================================================
    // SHOW RATING
    // =========================================================

    function showRating(
        rating,
        thisRequest
    ) {

        /*
         * Never show a result belonging to
         * an older page.
         */

        if (
            thisRequest !== requestId
        ) {
            return;
        }

        if (
            !rating ||
            rating === 'N/A'
        ) {
            return;
        }

        removeRating();

        // =====================================================
        // NETFLIX
        // =====================================================

        if (isNetflixTitlePage()) {

            const badge =
                document.createElement('div');

            badge.id = NETFLIX_BADGE_ID;

            badge.innerHTML = `
                <span class="streamrate-star">★</span>
                <span>IMDb</span>
                <strong>${rating}/10</strong>
            `;

            /*
             * Netflix's title-treatment area contains the
             * Play / Add / Like controls. Put the rating
             * directly in that row, before the final dropdown
             * control when one exists.
             */

            const controls =
                document.querySelector(
                    '.buttonControls--container[data-uia="mini-modal-controls"]'
                ) ||
                document.querySelector(
                    '.buttonControls--container'
                );

            if (controls) {

                badge.style.display = 'inline-flex';
                badge.style.alignItems = 'center';
                badge.style.gap = '7px';
                badge.style.marginLeft = '10px';
                badge.style.padding = '8px 12px';
                badge.style.border =
                    '1px solid rgba(255,255,255,.35)';
                badge.style.borderRadius = '4px';
                badge.style.background =
                    'rgba(20,20,20,.9)';
                badge.style.color = '#fff';
                badge.style.fontSize = '14px';
                badge.style.lineHeight = '1';
                badge.style.whiteSpace = 'nowrap';
                badge.style.fontFamily =
                    'Arial, sans-serif';

                const star =
                    badge.querySelector(
                        '.streamrate-star'
                    );

                if (star) {

                    star.style.color = '#f5c518';
                    star.style.fontSize = '16px';
                }

                const lastChild =
                    controls.lastElementChild;

                if (lastChild) {

                    controls.insertBefore(
                        badge,
                        lastChild
                    );

                } else {

                    controls.appendChild(badge);
                }

                log(
                    '✅ Netflix IMDb rating displayed:',
                    rating
                );

                return;
            }

            return;
        }

        // =====================================================
        // PRIME VIDEO
        // =====================================================

        const badge =
            document.createElement('div');

        badge.id = BADGE_ID;

        badge.innerHTML = `
            <span class="prime-imdb-star">★</span>
            <span>IMDb</span>
            <strong>${rating}/10</strong>
        `;

        const h1 =
            document.querySelector('h1');

        if (
            h1 &&
            h1.parentElement
        ) {

            h1.parentElement.appendChild(
                badge
            );

            log(
                '✅ Prime IMDb rating displayed:',
                rating
            );
        }
    }

    // =========================================================
    // DEBOUNCE
    // =========================================================

    function scheduleDetection(
        delay = 200
    ) {

        clearTimeout(
            detectionTimer
        );

        detectionTimer =
            setTimeout(() => {
                detectTitle();
            }, delay);
    }

    // =========================================================
    // URL CHANGE
    // =========================================================

    function checkURLChange() {

        const url =
            location.href;

        if (url === lastURL) {
            return false;
        }

        lastURL = url;

        log(
            '🔄 Navigation detected'
        );

        /*
         * New page.
         */

        currentKey = null;

        requestId++;

        removeRating();

        /*
         * Try immediately, then observer/retries
         * will catch the real title.
         */

        scheduleDetection(50);

        return true;
    }

    // =========================================================
    // HISTORY API
    // =========================================================

    const originalPushState =
        history.pushState;

    history.pushState =
        function (...args) {

            const result =
                originalPushState.apply(
                    this,
                    args
                );

            checkURLChange();

            return result;
        };

    const originalReplaceState =
        history.replaceState;

    history.replaceState =
        function (...args) {

            const result =
                originalReplaceState.apply(
                    this,
                    args
                );

            checkURLChange();

            return result;
        };

    window.addEventListener(
        'popstate',
        () => {

            checkURLChange();

            scheduleDetection(50);
        }
    );

    // =========================================================
    // MUTATION OBSERVER
    // =========================================================

    const observer =
        new MutationObserver(() => {

            /*
             * First check navigation.
             */

            checkURLChange();

            /*
             * Always allow detection while the title
             * is still being rendered.
             */

            if (
                isPrimeTitlePage() ||
                isNetflixTitlePage()
            ) {

                scheduleDetection(150);
            }
        });

    observer.observe(
        document.documentElement,
        {
            childList: true,
            subtree: true
        }
    );

    // =========================================================
    // STARTUP
    // =========================================================

    log(
        '🚀 StreamRate loaded — Prime Video + Netflix'
    );

    /*
     * Immediate attempt.
     */

    detectTitle();

    /*
     * Prime and Netflix can render title/modal
     * content AFTER content.js has started.
     *
     * These retries are ONLY startup retries.
     * They don't cause repeated API calls because
     * currentKey + cache prevent that.
     */

    setTimeout(() => {
        detectTitle();
    }, 300);

    setTimeout(() => {
        detectTitle();
    }, 800);

    setTimeout(() => {
        detectTitle();
    }, 1500);

    setTimeout(() => {
        detectTitle();
    }, 2500);

})();