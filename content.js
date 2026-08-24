(() => {
    'use strict';

    // =========================================================
    // CONFIG
    // =========================================================

    const TMDB_API_KEY = '7e3d8f1622743180fdcd999dd6cbfd7d';
    const TMDB_API_URL = 'https://api.themoviedb.org/3';

    const OMDB_API_KEY = '213270c7';

    const AGREGARR_URL =
        'https://api.agregarr.org/api/ratings?id=';

    const BADGE_ID = 'prime-imdb-rating';
    const NETFLIX_BADGE_ID =
        'streamrate-netflix-rating';

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
        const primeBadge =
            document.getElementById(BADGE_ID);

        const netflixBadge =
            document.getElementById(
                NETFLIX_BADGE_ID
            );

        if (primeBadge) {
            primeBadge.remove();
        }

        if (netflixBadge) {
            netflixBadge.remove();
        }
    }

    // =========================================================
    // PAGE DETECTION
    // =========================================================

    function isPrimeTitlePage() {
        return location.hostname.includes(
            'primevideo.com'
        );
    }

    function isNetflixTitlePage() {
        return location.hostname.includes(
            'netflix.com'
        );
    }

    // =========================================================
    // NORMALIZE TITLE
    // =========================================================

    function normalizeTitle(title) {
        if (!title) {
            return '';
        }

        return title
            .replace(/\s+/g, ' ')
            .replace(/\(.*?\)/g, '')
            .replace(/\b(HD|4K|UHD)\b/gi, '')
            .trim();
    }

    // =========================================================
    // FIND NETFLIX ACTIVE MODAL
    // =========================================================

    // =========================================================
// FIND NETFLIX ACTIVE MODAL
// =========================================================

function getNetflixActiveModal() {
    const selectors = [
        '.previewModal--wrapper',
        '.previewModal--container',
        '[role="dialog"]'
    ];

    const modals = [];

    for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);

        for (const element of elements) {
            if (!element) {
                continue;
            }

            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();

            if (
                style.display === 'none' ||
                style.visibility === 'hidden' ||
                style.opacity === '0' ||
                rect.width <= 0 ||
                rect.height <= 0
            ) {
                continue;
            }

            modals.push(element);
        }
    }

    if (!modals.length) {
        return null;
    }

    // Prefer the largest visible modal
    modals.sort((a, b) => {
        const rectA = a.getBoundingClientRect();
        const rectB = b.getBoundingClientRect();

        return (
            rectB.width * rectB.height -
            rectA.width * rectA.height
        );
    });

    return modals[0];
}

    // =========================================================
    // VALIDATE NETFLIX TITLE
    // =========================================================

    function isValidNetflixTitle(text) {
        if (!text) {
            return false;
        }

        const value = normalizeTitle(text);

        if (
            value.length < 2 ||
            value.length > 120
        ) {
            return false;
        }

        const invalidPatterns = [
            /^play$/i,
            /^episodes?$/i,
            /^more episodes?$/i,
            /^details$/i,
            /^trailer$/i,
            /^season \d+$/i,
            /^\d+ seasons?$/i,
            /^\d+ episodes?$/i,
            /^\d{4}$/i,
            /^u\/a/i,
            /^violence/i,
            /^cast:/i,
            /^genres:/i,
            /^this show is/i,
            /^this movie is/i,
            /^imdb/i,
            /^netflix/i,
            /^\d+\.\d+$/
        ];

        for (const pattern of invalidPatterns) {
            if (pattern.test(value)) {
                return false;
            }
        }

        if (
            /\bSeasons?\b/i.test(value) &&
            value.length < 30
        ) {
            return false;
        }

        return true;
    }

    // =========================================================
    // FIND NETFLIX TITLE
    // =========================================================

    function getNetflixTitle() {
        const modal =
            getNetflixActiveModal();

        if (!modal) {
            return null;
        }

        // -----------------------------------------------------
        // 1. Netflix title logo
        // -----------------------------------------------------

        const logoSelectors = [
            'img.previewModal--player-titleTreatment-logo',
            'img[alt]'
        ];

        for (const selector of logoSelectors) {
            const elements =
                modal.querySelectorAll(selector);

            for (const element of elements) {
                const alt =
                    element.getAttribute('alt');

                if (
                    alt &&
                    alt.trim() &&
                    alt.toLowerCase() !== 'logo' &&
                    isValidNetflixTitle(alt)
                ) {
                    return normalizeTitle(alt);
                }
            }
        }

        // -----------------------------------------------------
        // 2. Explicit title elements
        // -----------------------------------------------------

        const titleSelectors = [
            '[data-uia="previewModal-title"]',
            '[data-uia="modal-title"]',
            '[data-uia="title"]',
            '.previewModal--boxart-title',
            '.previewModal--player-titleTreatment',
            '.title-card-title',
            'h1'
        ];

        for (const selector of titleSelectors) {
            const element =
                modal.querySelector(selector);

            if (!element) {
                continue;
            }

            const text =
                element.textContent?.trim();

            if (
                text &&
                isValidNetflixTitle(text)
            ) {
                return normalizeTitle(text);
            }
        }

        // -----------------------------------------------------
        // 3. Search likely short text elements
        // -----------------------------------------------------

        const candidates =
            modal.querySelectorAll(
                'h1, h2, h3, span, div'
            );

        for (const element of candidates) {
            // Avoid containers with lots of child content
            if (element.children.length > 3) {
                continue;
            }

            const text =
                element.textContent?.trim();

            if (
                !isValidNetflixTitle(text)
            ) {
                continue;
            }

            // Don't use text that contains metadata
            if (
                /\bPlay\b/i.test(text) ||
                /\bCast:/i.test(text) ||
                /\bGenres:/i.test(text) ||
                /\bIMDb\b/i.test(text) ||
                /\bEpisodes\b/i.test(text)
            ) {
                continue;
            }

            const rect =
                element.getBoundingClientRect();

            if (
                rect.width > 40 &&
                rect.height > 10
            ) {
                return normalizeTitle(text);
            }
        }

        return null;
    }

    // =========================================================
    // PRIME TITLE
    // =========================================================

    function getPrimeTitle() {
        const h1 =
            document.querySelector('h1');

        if (!h1) {
            return null;
        }

        const title =
            h1.textContent?.trim();

        if (!title) {
            return null;
        }

        return normalizeTitle(title);
    }

    // =========================================================
    // DETERMINE NETFLIX TYPE
    // =========================================================

    // =========================================================
// DETERMINE NETFLIX TYPE
// =========================================================

function getNetflixType(modal) {
    if (!modal) {
        return 'movie';
    }

    const text = (modal.textContent || '')
        .replace(/\s+/g, ' ')
        .trim();

    // -----------------------------------------------------
    // STRONG SERIES INDICATORS
    // -----------------------------------------------------

    if (/\b\d+\s+Seasons?\b/i.test(text)) {
        return 'series';
    }

    if (/\bSeason\s+\d+\b/i.test(text)) {
        return 'series';
    }

    if (/\b\d+\s+Episodes?\b/i.test(text)) {
        return 'series';
    }

    if (/\bEpisodes?\b/i.test(text)) {
        return 'series';
    }

    // -----------------------------------------------------
    // Look specifically for Netflix metadata elements
    // -----------------------------------------------------

    const metadataElements = modal.querySelectorAll(
        '[data-uia], .previewModal--metadata, .previewModal--info, span, div'
    );

    for (const element of metadataElements) {
        const elementText = (element.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();

        if (/^\d+\s+Seasons?$/i.test(elementText)) {
            return 'series';
        }

        if (/^Season\s+\d+$/i.test(elementText)) {
            return 'series';
        }

        if (/^\d+\s+Episodes?$/i.test(elementText)) {
            return 'series';
        }
    }

    // -----------------------------------------------------
    // MOVIE DURATION INDICATORS
    // Examples:
    // 1h 42m
    // 2h
    // -----------------------------------------------------

    if (/\b\d+\s*h\s*\d+\s*m\b/i.test(text)) {
        return 'movie';
    }

    if (/\b\d+\s*h\b/i.test(text)) {
        return 'movie';
    }

    // -----------------------------------------------------
    // Default
    // -----------------------------------------------------

    return 'movie';
}

    // =========================================================
    // DETECT TITLE
    // =========================================================

    // =========================================================
// DETECT TITLE
// =========================================================

async function detectTitle() {
    let title = null;
    let type = 'movie';

    // -----------------------------------------------------
    // NETFLIX
    // -----------------------------------------------------

    if (isNetflixTitlePage()) {
        const modal = getNetflixActiveModal();

        if (!modal) {
            return;
        }

        title = getNetflixTitle();
        type = getNetflixType(modal);
    }

    // -----------------------------------------------------
    // PRIME VIDEO
    // -----------------------------------------------------

    else if (isPrimeTitlePage()) {
        title = getPrimeTitle();
        type = 'series';
    }

    if (!title) {
        return;
    }

    title = normalizeTitle(title);

    if (!title) {
        return;
    }

    const key = `${title.toLowerCase()}|${type}`;

    // -----------------------------------------------------
    // IMPORTANT:
    // If the same title was initially detected as movie,
    // but Netflix later reveals it is a series, allow update.
    // -----------------------------------------------------

    if (key === currentKey) {
        return;
    }

    // Detect same title but changed type
    const previousTitle = currentKey
        ? currentKey.split('|')[0]
        : null;

    const currentTitle = title.toLowerCase();

    if (
        previousTitle === currentTitle &&
        currentKey &&
        currentKey.endsWith('|movie') &&
        type === 'series'
    ) {
        log(
            '🔄 Netflix type corrected: movie → series'
        );

        currentKey = null;

        // Remove possibly incorrect rating
        removeRating();
    }

    currentKey = key;

    requestId++;

    const thisRequest = requestId;

    log(
        'New StreamRate title:',
        {
            title,
            type
        }
    );

    // -----------------------------------------------------
    // CACHE
    // -----------------------------------------------------

    if (ratingCache.has(key)) {
        const cached = ratingCache.get(key);

        if (cached) {
            log(
                '📦 Using cached IMDb rating:',
                cached
            );

            showRating(
                cached,
                thisRequest
            );

            return;
        }
    }

    // -----------------------------------------------------
    // OMDb
    // -----------------------------------------------------

    const rating = await fetchOMDbRating(
        title,
        type,
        thisRequest
    );

    if (thisRequest !== requestId) {
        return;
    }

    if (!rating) {
        log(
            '❌ No IMDb rating found for:',
            title
        );

        return;
    }

    // Cache using detected title + type
    ratingCache.set(
        key,
        rating
    );

    showRating(
        rating,
        thisRequest
    );
}

    // =========================================================
    // OMDb MAIN FLOW
    // =========================================================

    async function fetchOMDbRating(
        title,
        type,
        thisRequest
    ) {
        log(
            '🔎 OMDb:',
            title
        );

        // -----------------------------------------------------
        // First attempt
        // -----------------------------------------------------

        let result =
            await queryOMDb(
                title,
                type,
                thisRequest
            );

        if (
            thisRequest !== requestId
        ) {
            return null;
        }

        // OMDb found and produced rating
        if (
            result.found &&
            result.rating
        ) {
            return result.rating;
        }

        // OMDb found but no rating
        // Do NOT go to TMDB.
        if (result.found) {
            return null;
        }

        // -----------------------------------------------------
        // Try alternate OMDb type
        // -----------------------------------------------------

        const alternateType =
            type === 'movie'
                ? 'series'
                : 'movie';

        result =
            await queryOMDb(
                title,
                alternateType,
                thisRequest
            );

        if (
            thisRequest !== requestId
        ) {
            return null;
        }

        // OMDb found and produced rating
        if (
            result.found &&
            result.rating
        ) {
            return result.rating;
        }

        // OMDb found but no rating
        if (result.found) {
            return null;
        }

        // =====================================================
        // OMDb NOT FOUND
        // → TMDB
        // =====================================================

        const tmdbRating =
            await fetchTMDBRating(
                title,
                type,
                thisRequest
            );

        if (
            thisRequest !== requestId
        ) {
            return null;
        }

        if (tmdbRating) {
            return tmdbRating;
        }

        return null;
    }

    // =========================================================
    // OMDb REQUEST
    //
    // Returns:
    // {
    //     found: boolean,
    //     rating: string | null
    // }
    // =========================================================

    async function queryOMDb(
        title,
        type,
        thisRequest
    ) {
        try {
            const url =
                'https://www.omdbapi.com/' +
                '?apikey=' +
                encodeURIComponent(
                    OMDB_API_KEY
                ) +
                '&t=' +
                encodeURIComponent(title) +
                '&type=' +
                encodeURIComponent(type);

            const response =
                await fetch(url);

            if (
                thisRequest !== requestId
            ) {
                return {
                    found: false,
                    rating: null
                };
            }

            if (!response.ok) {
                log(
                    '❌ OMDb HTTP error:',
                    response.status
                );

                return {
                    found: false,
                    rating: null
                };
            }

            const data =
                await response.json();

            if (
                !data ||
                data.Response !== 'True'
            ) {
                log(
                    '❌ OMDb not found:',
                    title,
                    '-',
                    type
                );

                return {
                    found: false,
                    rating: null
                };
            }

            // =================================================
            // OMDb FOUND
            // =================================================

            log(
                '✅ OMDb match:',
                data.Title,
                data.Year,
                data.imdbID
            );

            // -------------------------------------------------
            // OMDb has IMDb rating
            // -------------------------------------------------

            const imdbRating =
                data.imdbRating;

            if (
                imdbRating &&
                imdbRating !== 'N/A'
            ) {
                const rating =
                    Number(imdbRating);

                if (
                    Number.isFinite(rating)
                ) {
                    const formatted =
                        rating.toFixed(1);

                    log(
                        '⭐ IMDb:',
                        formatted
                    );

                    return {
                        found: true,
                        rating: formatted
                    };
                }
            }

            // -------------------------------------------------
            // OMDb found but NO IMDb rating
            // → Agregarr using OMDb IMDb ID
            // -------------------------------------------------

            if (data.imdbID) {
                log(
                    '🔄 OMDb found but no rating — trying Agregarr:',
                    data.imdbID
                );

                const agregarrRating =
                    await fetchAgregarrRating(
                        data.imdbID,
                        thisRequest
                    );

                if (
                    thisRequest !== requestId
                ) {
                    return {
                        found: true,
                        rating: null
                    };
                }

                if (agregarrRating) {
                    log(
                        '⭐ Agregarr rating via OMDb:',
                        agregarrRating
                    );

                    return {
                        found: true,
                        rating: agregarrRating
                    };
                }
            }

            // OMDb definitely found the title,
            // but neither OMDb nor Agregarr gave a rating.
            return {
                found: true,
                rating: null
            };

        } catch (error) {
            if (
                thisRequest !== requestId
            ) {
                return {
                    found: false,
                    rating: null
                };
            }

            console.error(
                '❌ OMDb error:',
                error
            );

            return {
                found: false,
                rating: null
            };
        }
    }

    // =========================================================
    // TMDB FALLBACK
    //
    // ONLY CALLED WHEN OMDb DID NOT FIND THE TITLE
    // =========================================================

    async function fetchTMDBRating(
        title,
        type,
        thisRequest
    ) {
        log(
            '🔄 OMDb not found — trying TMDB:',
            title
        );

        try {
            // -------------------------------------------------
            // Choose first TMDB endpoint
            // -------------------------------------------------

            let endpoint =
                type === 'series'
                    ? '/search/tv'
                    : '/search/movie';

            let actualType =
                type === 'series'
                    ? 'tv'
                    : 'movie';

            let result =
                await searchTMDB(
                    title,
                    endpoint,
                    thisRequest
                );

            if (
                thisRequest !== requestId
            ) {
                return null;
            }

            // -------------------------------------------------
            // Try alternate type if needed
            // -------------------------------------------------

            if (!result) {
                log(
                    '❌ TMDB not found as:',
                    type,
                    '— trying alternate type'
                );

                endpoint =
                    type === 'series'
                        ? '/search/movie'
                        : '/search/tv';

                actualType =
                    type === 'series'
                        ? 'movie'
                        : 'tv';

                result =
                    await searchTMDB(
                        title,
                        endpoint,
                        thisRequest
                    );
            }

            if (
                thisRequest !== requestId
            ) {
                return null;
            }

            if (!result) {
                log(
                    '❌ TMDB completely failed:',
                    title
                );

                return null;
            }

            const tmdbId =
                result.id;

            log(
                '✅ TMDB match:',
                result.title ||
                result.name,
                'TMDB ID:',
                tmdbId
            );

            // -------------------------------------------------
            // Get TMDB external IDs
            // -------------------------------------------------

            const externalUrl =
                TMDB_API_URL +
                '/' +
                actualType +
                '/' +
                tmdbId +
                '/external_ids?api_key=' +
                encodeURIComponent(
                    TMDB_API_KEY
                );

            const externalResponse =
                await fetch(
                    externalUrl
                );

            if (
                thisRequest !== requestId
            ) {
                return null;
            }

            if (!externalResponse.ok) {
                log(
                    '❌ TMDB external IDs HTTP error:',
                    externalResponse.status
                );

                return null;
            }

            const externalData =
                await externalResponse.json();

            const imdbId =
                externalData?.imdb_id;

            if (!imdbId) {
                log(
                    '❌ TMDB found title but no IMDb ID:',
                    title
                );

                return null;
            }

            log(
                '🎯 TMDB IMDb ID:',
                imdbId
            );

            // -------------------------------------------------
            // TMDB → IMDb ID → Agregarr
            // -------------------------------------------------

            const agregarrRating =
                await fetchAgregarrRating(
                    imdbId,
                    thisRequest
                );

            if (
                thisRequest !== requestId
            ) {
                return null;
            }

            if (agregarrRating) {
                log(
                    '⭐ Agregarr rating via TMDB:',
                    agregarrRating
                );

                return agregarrRating;
            }

            return null;

        } catch (error) {
            if (
                thisRequest !== requestId
            ) {
                return null;
            }

            console.error(
                '❌ TMDB fallback error:',
                error
            );

            return null;
        }
    }

    // =========================================================
    // TMDB SEARCH
    // =========================================================

    async function searchTMDB(
        title,
        endpoint,
        thisRequest
    ) {
        try {
            const url =
                TMDB_API_URL +
                endpoint +
                '?api_key=' +
                encodeURIComponent(
                    TMDB_API_KEY
                ) +
                '&query=' +
                encodeURIComponent(title);

            const response =
                await fetch(url);

            if (
                thisRequest !== requestId
            ) {
                return null;
            }

            if (!response.ok) {
                log(
                    '❌ TMDB HTTP error:',
                    response.status
                );

                return null;
            }

            const data =
                await response.json();

            if (
                !data ||
                !Array.isArray(data.results) ||
                !data.results.length
            ) {
                return null;
            }

            return data.results[0];

        } catch (error) {
            if (
                thisRequest === requestId
            ) {
                console.error(
                    '❌ TMDB search error:',
                    error
                );
            }

            return null;
        }
    }

    // =========================================================
    // AGREGARR
    // =========================================================

    async function fetchAgregarrRating(
        imdbId,
        thisRequest
    ) {
        try {
            log(
                '🔎 Agregarr:',
                imdbId
            );

            const response =
                await fetch(
                    AGREGARR_URL +
                    encodeURIComponent(imdbId)
                );

            if (
                thisRequest !== requestId
            ) {
                return null;
            }

            if (!response.ok) {
                log(
                    '❌ Agregarr HTTP error:',
                    response.status
                );

                return null;
            }

            const data =
                await response.json();

            // -------------------------------------------------
            // Array response
            // -------------------------------------------------

            if (Array.isArray(data)) {
                for (const item of data) {
                    if (
                        item &&
                        item.rating !== undefined &&
                        item.rating !== null
                    ) {
                        const rating =
                            Number(item.rating);

                        if (
                            Number.isFinite(rating)
                        ) {
                            return rating.toFixed(1);
                        }
                    }
                }
            }

            // -------------------------------------------------
            // { rating: ... }
            // -------------------------------------------------

            if (
                data &&
                data.rating !== undefined &&
                data.rating !== null
            ) {
                const rating =
                    Number(data.rating);

                if (
                    Number.isFinite(rating)
                ) {
                    return rating.toFixed(1);
                }
            }

            // -------------------------------------------------
            // { imdb: { rating: ... } }
            // -------------------------------------------------

            if (
                data &&
                data.imdb &&
                data.imdb.rating !== undefined &&
                data.imdb.rating !== null
            ) {
                const rating =
                    Number(data.imdb.rating);

                if (
                    Number.isFinite(rating)
                ) {
                    return rating.toFixed(1);
                }
            }

            log(
                '❌ No usable Agregarr rating:',
                imdbId
            );

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
        // Never show stale result
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

            badge.id =
                NETFLIX_BADGE_ID;

            badge.innerHTML = `
                <span class="streamrate-star">★</span>
                <span>IMDb</span>
                <strong>${rating}/10</strong>
            `;

            const controls =
                document.querySelector(
                    '.buttonControls--container[data-uia="mini-modal-controls"]'
                ) ||
                document.querySelector(
                    '.buttonControls--container'
                );

            if (!controls) {
                log(
                    '⚠️ Netflix controls not found yet'
                );

                return;
            }

            badge.style.display =
                'inline-flex';

            badge.style.alignItems =
                'center';

            badge.style.gap =
                '7px';

            badge.style.marginLeft =
                '10px';

            badge.style.padding =
                '8px 12px';

            badge.style.border =
                '1px solid rgba(255,255,255,.35)';

            badge.style.borderRadius =
                '4px';

            badge.style.background =
                'rgba(20,20,20,.9)';

            badge.style.color =
                '#fff';

            badge.style.fontSize =
                '14px';

            badge.style.lineHeight =
                '1';

            badge.style.whiteSpace =
                'nowrap';

            badge.style.fontFamily =
                'Arial, sans-serif';

            badge.style.cursor =
                'default';

            const star =
                badge.querySelector(
                    '.streamrate-star'
                );

            if (star) {
                star.style.color =
                    '#f5c518';

                star.style.fontSize =
                    '16px';
            }

            const lastChild =
                controls.lastElementChild;

            if (lastChild) {
                controls.insertBefore(
                    badge,
                    lastChild
                );
            } else {
                controls.appendChild(
                    badge
                );
            }

            log(
                '✅ Netflix IMDb rating displayed:',
                rating
            );

            return;
        }

        // =====================================================
        // PRIME VIDEO
        // =====================================================

        if (isPrimeTitlePage()) {
            const badge =
                document.createElement('div');

            badge.id =
                BADGE_ID;

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

        if (
            url === lastURL
        ) {
            return false;
        }

        lastURL = url;

        log(
            '🔄 Navigation detected'
        );

        currentKey = null;
        requestId++;

        removeRating();

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
            checkURLChange();

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

    detectTitle();

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