// ============================================
// UPTOWNIE REPLICA — Interactive Scripts
// ============================================

// Local/LAN dev hits the backend on the same host at :4000; anywhere else
// (Netlify, the live domain) talks to the deployed Render backend.
const API_BASE = (function () {
    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' ||
        /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/.test(host);
    return isLocal ? 'http://' + host + ':4000/api' : 'https://luna-femme.onrender.com/api';
})();

document.addEventListener('DOMContentLoaded', function () {

    /* ---------- Product Catalog ---------- */
    let PRODUCTS = [];
    let loadingCatalog = false;

    const SORT_BY_PRICE = function (a, b) { return parseFloat(a.price) - parseFloat(b.price); };
    const SORT_BY_DATE = function (a, b) {
        const da = a.published ? new Date(a.published).getTime() : 0;
        const db = b.published ? new Date(b.published).getTime() : 0;
        return db - da;
    };

    function fmtPrice(n) {
        return '\u20B9 ' + Number(n || 0).toLocaleString('en-IN');
    }

    function hasTag(product, keyword) {
        const tags = Array.isArray(product.tags) ? product.tags.join(' ') : (product.tags || '');
        return String(tags).toLowerCase().includes(keyword);
    }

    function productCardHTML(product) {
        const compare = product.compareAt
            ? '<span class="original-price"><s>' + fmtPrice(product.compareAt) + '</s></span>'
            : '';
        const soldOut = product.available === false;
        return '<a href="#" class="product-card' + (soldOut ? ' sold-out' : '') + '" data-handle="' + htmlEncode(product.handle) + '">' +
            '<div class="product-img"><img src="' + (product.img || 'images/dress1.svg') + '" alt="' + htmlEncode(product.title) + '" loading="lazy">' +
            (soldOut ? '<div class="sold-out-badge">sold out</div>' : '') +
            '</div>' +
            '<div class="product-name">' + htmlEncode(product.title.toLowerCase()) + '</div>' +
            '<div class="product-price"><span class="sale-price">' + fmtPrice(product.price) + '</span>' + compare + '</div>' +
            '<button type="button" class="add-to-bag"' + (soldOut ? ' disabled' : '') + ' data-handle="' + htmlEncode(product.handle) + '">' +
            (soldOut ? 'sold out' : 'add to bag') + '</button>' +
            '</a>';
    }

    function htmlEncode(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function placeholderFor(product) {
        const t = String((product && product.type) || '').toLowerCase();
        if (t.indexOf('coord') > -1) return 'images/coord1.svg';
        if (t.indexOf('dress') > -1) return 'images/dress1.svg';
        if (t.indexOf('shirt') > -1) return 'images/shirt1.svg';
        if (t.indexOf('skirt') > -1) return 'images/skirt1.svg';
        if (t.indexOf('top') > -1 || t.indexOf('tee') > -1 || t.indexOf('tank') > -1) return 'images/top1.svg';
        return 'images/dress1.svg';
    }

    function initImageFallback() {
        document.addEventListener('error', function (e) {
            const img = e.target;
            if (!img || img.tagName !== 'IMG' || img.getAttribute('data-swap')) return;
            img.setAttribute('data-swap', '1');
            let handle = null;
            const card = img.closest('[data-handle]');
            if (card) {
                handle = card.getAttribute('data-handle');
            } else if (img.getAttribute('id') === 'pdpImg') {
                handle = pdpHandle;
            }
            img.src = placeholderFor(handle ? productByHandle(handle) : null);
        }, true);
    }

    function normalizeCatalog(list) {
        return (list || []).map(function (p) {
            p.tags = Array.isArray(p.tags) ? p.tags.join(',') : String(p.tags || '');
            p.title = String(p.title || '');
            p.type = String(p.type || '');
            p.img = p.img || 'images/dress1.svg';
            return p;
        });
    }

    function fetchAllFromApi() {
        return fetch(API_BASE + '/products?limit=100&page=1')
            .then(function (r) { if (!r.ok) throw new Error('API request failed'); return r.json(); })
            .then(function (data) {
                if (!data.totalPages || data.totalPages <= 1) return data.items;
                const pagePromises = [];
                for (let p = 2; p <= data.totalPages; p++) {
                    pagePromises.push(
                        fetch(API_BASE + '/products?limit=100&page=' + p).then(function (r) { return r.json(); })
                    );
                }
                return Promise.all(pagePromises).then(function (pages) {
                    let all = data.items.slice();
                    pages.forEach(function (pg) { all = all.concat(pg.items); });
                    return all;
                });
            });
    }

    function loadCatalog(next) {
        if (loadingCatalog) return;
        loadingCatalog = true;

        // Preferred: load the live catalog from the backend API
        fetchAllFromApi()
            .then(function (list) {
                PRODUCTS = normalizeCatalog(list);
                loadingCatalog = false;
                renderAll();
                if (next) next();
            })
            .catch(function (err) {
                loadingCatalog = false;
                console.warn('Backend API catalog failed, falling back:', err);

                // Fallback: embedded catalog (works when opened directly via file://, no server needed)
                if (window.__UPT_PRODUCTS && window.__UPT_PRODUCTS.length) {
                    PRODUCTS = normalizeCatalog(window.__UPT_PRODUCTS);
                    renderAll();
                    if (next) next();
                    return;
                }

                // Last resort: fetch the static products.json (requires serving over HTTP)
                loadingCatalog = true;
                fetch('products.json')
                    .then(function (r) { if (!r.ok) throw new Error('failed to load catalog'); return r.json(); })
                    .then(function (data) {
                        PRODUCTS = normalizeCatalog(data);
                        loadingCatalog = false;
                        renderAll();
                        if (next) next();
                    })
                    .catch(function (err2) {
                        loadingCatalog = false;
                        console.warn('Catalog failed to load:', err2);
                        if (next) next(err2);
                    });
            });
    }

    /* ---------- Section Rendering ---------- */
    function renderAll() {
        renderNewThisWeek();
        renderBestsellers();
        renderShopFilter();
        renderShopAll();
    }

    function renderNewThisWeek() {
        const row = document.getElementById('newThisWeekRow');
        if (!row) return;
        const sorted = PRODUCTS.filter(function (p) { return p.available !== false; })
            .sort(SORT_BY_DATE).slice(0, 10);
        row.innerHTML = sorted.map(productCardHTML).join('');
    }

    function renderBestsellers() {
        const grid = document.getElementById('bestsellersGrid');
        if (!grid) return;
        const inStock = PRODUCTS.filter(function (p) { return p.available !== false; });
        let best = inStock.filter(function (p) {
            return hasTag(p, 'bestseller') || hasTag(p, 'mostloved');
        });
        if (best.length < 8) best = inStock.slice();
        best.sort(SORT_BY_DATE);
        grid.innerHTML = best.slice(0, 8).map(productCardHTML).join('');
    }

    /* ---------- Shop All (filter + load more) ---------- */
    let activeFilter = 'all';
    let activeView = 'default'; // 'default' | 'newin' | 'bestseller'
    let activePrice = null;    // price bucket key or null
    let activeTag = null;      // trending-now tag or null
    let shownCount = 12;
    const PAGE = 12;

    const TREND_LABELS = {
        'polka': 'polka',
        'desi': 'desi summer',
        'vacation': 'vacation co-ords',
        'work': 'office siren',
        'peplum': 'peplum',
        'bead': 'hand-beaded'
    };

    const PRICE_BUCKETS = [
        { key: 'u999', label: 'under ₹999', test: function (p) { return parseFloat(p.price) < 999; } },
        { key: '1000-1500', label: '₹1000 – 1500', test: function (p) { return parseFloat(p.price) >= 1000 && parseFloat(p.price) <= 1500; } },
        { key: '1500-2000', label: '₹1500 – 2000', test: function (p) { return parseFloat(p.price) > 1500 && parseFloat(p.price) <= 2000; } },
        { key: '2000+', label: '₹2000+', test: function (p) { return parseFloat(p.price) > 2000; } }
    ];

    function bucketFor(key) {
        for (var i = 0; i < PRICE_BUCKETS.length; i++) {
            if (PRICE_BUCKETS[i].key === key) return PRICE_BUCKETS[i];
        }
        return null;
    }

    function typeMatches(p, key) {
        const t = (p.type || '').toLowerCase();
        const title = p.title.toLowerCase();
        if (key === 'Tees') {
            return t.indexOf('tee') > -1 || t.indexOf('tank') > -1 || title.indexOf('tee') > -1 || title.indexOf('tank') > -1;
        }
        if (key === 'Swim') {
            return ['monokini', 'bikini', 'swim', 'swimwear'].some(function (s) { return t.indexOf(s) > -1; });
        }
        if (key === 'Pants') {
            return t.indexOf('pant') > -1 || t.indexOf('shorts') > -1 || t.indexOf('bottoms') > -1 || t.indexOf('leg') > -1;
        }
        return t.indexOf(key.toLowerCase()) > -1 || hasTag(p, key);
    }

    function sortByDiscount(a, b) {
        const da = parseFloat(a.compareAt) - parseFloat(a.price);
        const db = parseFloat(b.compareAt) - parseFloat(b.price);
        return db - da;
    }

    function getFiltered() {
        let list;
        if (activeView === 'newin') {
            list = PRODUCTS.slice().sort(SORT_BY_DATE);
        } else if (activeView === 'bestseller') {
            list = PRODUCTS.filter(function (p) {
                return hasTag(p, 'bestseller') || hasTag(p, 'mostloved');
            });
            list.sort(SORT_BY_DATE);
        } else {
            list = PRODUCTS.slice();
            if (activeFilter === 'sale') {
                list = list.filter(function (p) {
                    const c = parseFloat(p.compareAt);
                    return c && c > parseFloat(p.price);
                });
                list.sort(sortByDiscount);
            } else if (activeFilter !== 'all') {
                list = list.filter(function (p) { return typeMatches(p, activeFilter); });
            }
        }
        if (activePrice) {
            const bucket = bucketFor(activePrice);
            if (bucket) list = list.filter(bucket.test);
        }
        if (activeTag) {
            list = list.filter(function (p) { return hasTag(p, activeTag); });
        }
        return list;
    }

    const SECTION_TITLES = {
        'all': 'shop all products',
        'newin': 'new in',
        'bestseller': 'bestsellers',
        'sale': 'on sale',
        'Tops': 'tops',
        'Tees': 'tees & tanks',
        'Dresses': 'dresses',
        'Co-ord Sets': 'co-ords',
        'Shirts': 'shirts',
        'Skirts': 'skirts',
        'Coats & Jackets': 'jackets',
        'Jumpsuits': 'jumpsuits',
        'Monokini': 'swim',
        'Pants': 'bottoms'
    };

    function sectionTitleFor(key) {
        return SECTION_TITLES[key] || String(key).toLowerCase();
    }

    const FILTERS = [
        { key: 'all', label: 'all' },
        { key: 'Tops', label: 'tops' },
        { key: 'Dresses', label: 'dresses' },
        { key: 'Co-ord Sets', label: 'co-ords' },
        { key: 'Shirts', label: 'shirts' },
        { key: 'Skirts', label: 'skirts' },
        { key: 'Coats & Jackets', label: 'jackets' },
        { key: 'Jumpsuits', label: 'jumpsuits' },
        { key: 'Monokini', label: 'swim' },
        { key: 'sale', label: 'sale' }
    ];

    function renderShopFilter() {
        const wrap = document.getElementById('shopFilter');
        if (!wrap) return;
        wrap.innerHTML = FILTERS.map(function (f) {
            return '<button class="filter-pill' + (f.key === activeFilter ? ' active' : '') + '" data-filter="' + f.key + '" type="button">' + f.label + '</button>';
        }).join('');
        wrap.querySelectorAll('.filter-pill').forEach(function (pill) {
            pill.addEventListener('click', function () {
                activeFilter = this.getAttribute('data-filter');
                activeView = 'default';
                activePrice = null;
                activeTag = null;
                shownCount = PAGE;
                renderShopFilter();
                renderShopAll();
                syncBudgetPills();
                window.scrollTo({ top: document.getElementById('shopAll').offsetTop - 100, behavior: 'smooth' });
            });
        });
    }

    function renderShopAll() {
        const grid = document.getElementById('shopAllGrid');
        if (!grid) return;
        const list = getFiltered();
        grid.innerHTML = list.slice(0, shownCount).map(productCardHTML).join('');

        const titleEl = document.getElementById('shopAllTitle');
        if (titleEl) {
            let key;
            if (activePrice) {
                const bucket = bucketFor(activePrice);
                key = bucket ? bucket.label : 'shop all products';
            } else if (activeTag) {
                key = TREND_LABELS[activeTag] || activeTag;
            } else {
                key = activeView !== 'default' ? activeView : activeFilter;
                key = sectionTitleFor(key);
            }
            titleEl.textContent = key;
        }

        const btn = document.getElementById('loadMoreBtn');
        const status = document.getElementById('loadMoreStatus');
        if (btn && status) {
            const remaining = list.length - shownCount;
            if (remaining > 0) {
                btn.style.display = 'inline-block';
                status.textContent = '';
            } else {
                btn.style.display = 'none';
                status.textContent = shownCount + ' of ' + list.length + ' products';
            }
        }
    }

    /* ---------- Category navigation (circles + tiles) ---------- */
    function initCategoryLinks() {
        document.querySelectorAll('[data-type]').forEach(function (el) {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                const type = this.getAttribute('data-type');
                setFilter(type);
                document.getElementById('shopAll').scrollIntoView({ behavior: 'smooth' });
            });
        });
    }

    /* ---------- Nav menu (New In, Dresses, Sale, etc.) ---------- */
    function syncBudgetPills() {
        document.querySelectorAll('.budget-pill').forEach(function (pill) {
            pill.classList.toggle('active', pill.getAttribute('data-price') === activePrice);
        });
    }

    function applyTrend(key) {
        activeTag = key;
        activeFilter = 'all';
        activeView = 'default';
        activePrice = null;
        shownCount = PAGE;
        renderShopFilter();
        renderShopAll();
        syncBudgetPills();
    }

    function applyPrice(key) {
        activePrice = key;
        activeTag = null;
        activeView = 'default';
        activeFilter = 'all';
        shownCount = PAGE;
        renderShopFilter();
        renderShopAll();
        syncBudgetPills();
    }

    function applyNav(key) {
        activeTag = null;
        activePrice = null;
        if (activeView !== 'default') activeView = 'default';
        if (key === 'newin') {
            activeView = 'newin';
            activeFilter = 'all';
        } else if (key === 'bestseller') {
            activeView = 'bestseller';
            activeFilter = 'all';
        } else if (key === 'Tees' || key === 'Swim' || key === 'Pants') {
            activeFilter = key;
        } else {
            const known = FILTERS.some(function (f) { return f.key === key; });
            activeFilter = known ? key : 'all';
        }
        shownCount = PAGE;
        renderShopFilter();
        renderShopAll();
    }

    function initNavLinks() {
        document.addEventListener('click', function (e) {
            const trendLink = e.target.closest('[data-trend]');
            if (trendLink) {
                e.preventDefault();
                applyTrend(trendLink.getAttribute('data-trend'));
                document.getElementById('shopAll').scrollIntoView({ behavior: 'smooth' });
                return;
            }
            const priceLink = e.target.closest('[data-price]');
            if (priceLink) {
                e.preventDefault();
                applyPrice(priceLink.getAttribute('data-price'));
                document.getElementById('shopAll').scrollIntoView({ behavior: 'smooth' });
                return;
            }
            const link = e.target.closest('[data-nav]');
            if (!link) return;
            e.preventDefault();
            applyNav(link.getAttribute('data-nav'));
            // close mobile menu if open
            const menu = document.getElementById('mobileMenu');
            const overlay = document.getElementById('mobileOverlay');
            if (menu && overlay) {
                menu.classList.remove('active');
                overlay.classList.remove('active');
                document.body.style.overflow = '';
                var item = link.closest('.accordion-item');
                if (item) item.classList.remove('open');
            }
            document.getElementById('shopAll').scrollIntoView({ behavior: 'smooth' });
        });
    }

    function setFilter(type) {
        const key = FILTERS.some(function (f) { return f.key === type; }) ? type : 'all';
        activeFilter = key;
        activeView = 'default';
        activePrice = null;
        activeTag = null;
        shownCount = PAGE;
        renderShopFilter();
        renderShopAll();
        syncBudgetPills();
    }

    /* ---------- Mobile Menu ---------- */
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const mobileOverlay = document.getElementById('mobileOverlay');
    const closeMenu = document.getElementById('closeMenu');

    if (hamburgerBtn && mobileMenu && mobileOverlay && closeMenu) {
        function openMenu() {
            mobileMenu.classList.add('active');
            mobileOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
        }

        function closeMobileMenu() {
            mobileMenu.classList.remove('active');
            mobileOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }

        hamburgerBtn.addEventListener('click', openMenu);
        closeMenu.addEventListener('click', closeMobileMenu);
        mobileOverlay.addEventListener('click', closeMobileMenu);
    }

    /* ---------- Mobile Accordions ---------- */
    document.querySelectorAll('.accordion-item').forEach(function (item) {
        const btn = item.querySelector('.accordion-btn');
        if (btn) {
            btn.addEventListener('click', function () {
                item.classList.toggle('open');
            });
        }
    });

    /* ---------- Search Overlay ---------- */
    const searchBtn = document.getElementById('searchBtn');
    const searchOverlay = document.getElementById('searchOverlay');
    const searchClose = document.getElementById('searchClose');
    const searchInput = document.getElementById('searchInput');
    const searchResults = document.getElementById('searchResults');

    if (searchBtn && searchOverlay && searchClose) {
        function openSearch() {
            searchOverlay.classList.add('active');
            document.body.style.overflow = 'hidden';
            setTimeout(function () {
                if (searchInput) searchInput.focus();
            }, 100);
        }

        function closeSearch() {
            searchOverlay.classList.remove('active');
            document.body.style.overflow = '';
        }

        searchBtn.addEventListener('click', openSearch);
        searchClose.addEventListener('click', closeSearch);
        searchOverlay.addEventListener('click', function (e) {
            if (e.target === searchOverlay) closeSearch();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeSearch();
        });

        if (searchInput && searchResults) {
            searchInput.addEventListener('input', function () {
                const query = this.value.trim().toLowerCase();

                if (!query) {
                    searchResults.innerHTML = '<p class="search-hint">Type to search for products</p>';
                    return;
                }

                const matches = PRODUCTS.filter(function (p) {
                    const hay = (p.title + ' ' + (p.type || '') + ' ' + (p.tags || '')).toLowerCase();
                    return hay.indexOf(query) > -1;
                }).slice(0, 12);

                if (matches.length === 0) {
                    searchResults.innerHTML = '<p class="search-hint">No results found</p>';
                    return;
                }

                searchResults.innerHTML = '<div class="search-results-list">' +
                    matches.map(function (p) {
                        const url = 'https://uptownie.com/products/' + p.handle;
                        return '<a href="' + url + '" class="search-result-item" target="_blank" rel="noopener">' +
                            '<span class="search-result-thumb"><img src="' + (p.img || 'images/dress1.svg') + '" alt="" loading="lazy"></span>' +
                            '<span class="search-result-name">' + htmlEncode(p.title.toLowerCase()) + '</span>' +
                            '<span class="search-result-price">' + fmtPrice(p.price) + '</span>' +
                            '</a>';
                    }).join('') + '</div>';
            });
        }
    }

    /* ---------- Hero Slider ---------- */
    const sliderContainer = document.querySelector('.hero-slider .swiper-container');

    if (sliderContainer) {
        const slides = sliderContainer.querySelectorAll('.swiper-slide');
        const wrapper = sliderContainer.querySelector('.swiper-wrapper');
        const dotsContainer = sliderContainer.querySelector('.swiper-pagination');

        if (slides.length > 0 && wrapper) {
            let currentSlide = 0;
            let timer;
            const slideCount = slides.length;

            if (dotsContainer) {
                slides.forEach(function (_, i) {
                    const dot = document.createElement('span');
                    dot.classList.add('dot');
                    if (i === 0) dot.classList.add('active');
                    dot.addEventListener('click', function () {
                        goToSlide(i);
                        resetTimer();
                    });
                    dotsContainer.appendChild(dot);
                });
            }

            const dots = dotsContainer ? dotsContainer.querySelectorAll('.dot') : [];

            function goToSlide(index) {
                currentSlide = index;
                wrapper.style.transform = 'translateX(-' + (currentSlide * 100) + '%)';
                dots.forEach(function (dot, i) {
                    dot.classList.toggle('active', i === currentSlide);
                });
            }

            function nextSlide() {
                currentSlide = (currentSlide + 1) % slideCount;
                goToSlide(currentSlide);
            }

            function resetTimer() {
                clearInterval(timer);
                timer = setInterval(nextSlide, 3000);
            }

            resetTimer();

            let startX = 0;
            let isDragging = false;

            sliderContainer.addEventListener('touchstart', function (e) {
                startX = e.touches[0].clientX;
                isDragging = true;
            });

            sliderContainer.addEventListener('touchend', function (e) {
                if (!isDragging) return;
                isDragging = false;
                const endX = e.changedTouches[0].clientX;
                const diff = startX - endX;
                if (diff > 50) { nextSlide(); }
                else if (diff < -50) {
                    currentSlide = (currentSlide - 1 + slideCount) % slideCount;
                    goToSlide(currentSlide);
                }
                resetTimer();
            });

            sliderContainer.addEventListener('mousedown', function (e) {
                startX = e.clientX;
                isDragging = true;
            });

            document.addEventListener('mousemove', function (e) {
                if (isDragging) {
                    const diff = startX - e.clientX;
                    if (Math.abs(diff) > 80) {
                        isDragging = false;
                        if (diff > 0) { nextSlide(); }
                        else {
                            currentSlide = (currentSlide - 1 + slideCount) % slideCount;
                            goToSlide(currentSlide);
                        }
                        resetTimer();
                    }
                }
            });

            document.addEventListener('mouseup', function () {
                isDragging = false;
            });
        }
    }

    /* ---------- Product Scroll Rows (drag to scroll) ---------- */
    document.querySelectorAll('.product-row-scroll').forEach(function (row) {
        let isDown = false;
        let startScrollX, startMouseX;

        row.addEventListener('mousedown', function (e) {
            isDown = true;
            startScrollX = row.scrollLeft;
            startMouseX = e.pageX;
            row.style.cursor = 'grabbing';
            row.style.scrollSnapType = 'none';
        });

        document.addEventListener('mousemove', function (e) {
            if (isDown) {
                row.scrollLeft = startScrollX - (e.pageX - startMouseX);
            }
        });

        document.addEventListener('mouseup', function () {
            if (isDown) {
                isDown = false;
                row.style.cursor = '';
                row.style.scrollSnapType = '';
            }
        });
    });

    /* ---------- Load More ---------- */
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', function () {
            shownCount += PAGE;
            renderShopAll();
        });
    }

    /* ---------- Footer Accordion ---------- */
    const footerAccordionBtn = document.getElementById('footerAccordionBtn');
    const footerAccordionContent = document.getElementById('footerAccordionContent');

    if (footerAccordionBtn && footerAccordionContent) {
        let footerOpen = false;
        footerAccordionBtn.addEventListener('click', function () {
            footerOpen = !footerOpen;
            footerAccordionContent.classList.toggle('active', footerOpen);
            const arrow = footerAccordionBtn.querySelector('.arrow');
            if (arrow) arrow.textContent = footerOpen ? '−' : '+';
        });
    }

    /* ---------- Product detail view ---------- */
    let pdpHandle = null;
    let pdpSize = 'M';
    let pdpQty = 1;
    const SIZES = ['S', 'M', 'L', 'XL'];

    function handleRating(handle) {
        let h = 0;
        if (handle) for (let i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) % 997;
        const avg = 4.1 + (h % 9) / 10;
        const reviews = 40 + (h % 240);
        return avg.toFixed(1) + ' · ' + reviews + ' reviews';
    }

    function renderPdpSizes() {
        const el = document.getElementById('pdpSizes');
        if (!el) return;
        el.innerHTML = SIZES.map(function (s) {
            return '<button type="button" class="pdp-size' + (s === pdpSize ? ' active' : '') + '" data-size="' + s + '">' + s + '</button>';
        }).join('');
    }

    function openPDP(handle) {
        const p = productByHandle(handle);
        if (!p) return;
        const wasAlreadyOpen = !!pdpHandle;
        pdpHandle = handle;
        pdpSize = 'M';
        pdpQty = 1;
        const img = document.getElementById('pdpImg');
        const type = document.getElementById('pdpType');
        const title = document.getElementById('pdpTitle');
        const sale = document.getElementById('pdpSale');
        const before = document.getElementById('pdpBefore');
        const save = document.getElementById('pdpSave');
        const add = document.getElementById('pdpAdd');
        const rating = document.getElementById('pdpRating');
        const wish = document.getElementById('pdpWish');
        const qtyVal = document.getElementById('pdpQtyVal');
        if (img) { img.src = p.img || 'images/dress1.svg'; img.alt = p.title; img.removeAttribute('data-swap'); }
        if (type) type.textContent = (p.type || 'product').toLowerCase();
        if (title) title.textContent = p.title.toLowerCase();
        if (sale) sale.textContent = fmtPrice(p.price);
        if (before) before.innerHTML = p.compareAt ? '<s>' + fmtPrice(p.compareAt) + '</s>' : '';
        if (save) {
            const c = parseFloat(p.compareAt);
            if (c && c > parseFloat(p.price)) {
                save.textContent = 'save ' + Math.round((1 - parseFloat(p.price) / c) * 100) + '%';
            } else {
                save.textContent = '';
            }
        }
        if (add) {
            const soldOut = p.available === false;
            add.textContent = soldOut ? 'sold out' : 'add to bag';
            add.disabled = soldOut;
        }
        if (rating) rating.textContent = handleRating(p.handle);
        if (wish) wish.textContent = WISHLIST.indexOf(p.handle) > -1 ? '♥' : '♡';
        if (qtyVal) qtyVal.textContent = pdpQty;
        renderPdpSizes();
        const overlay = document.getElementById('pdpOverlay');
        if (overlay) { overlay.classList.add('active'); overlay.scrollTop = 0; document.body.style.overflow = 'hidden'; }
        renderRelated(handle);

        // Push a history entry so the phone's/browser's back button closes
        // this view and returns to the shop instead of leaving the site.
        if (wasAlreadyOpen) {
            history.replaceState({ pdp: true }, '', '#product-' + handle);
        } else {
            history.pushState({ pdp: true }, '', '#product-' + handle);
        }
    }

    function renderRelated(handle) {
        const el = document.getElementById('ppRelated');
        if (!el) return;
        const p = productByHandle(handle);
        if (!p) return;
        let related = PRODUCTS.filter(function (x) {
            return x.handle !== handle && (x.type === p.type || hasTag(x, p.type));
        });
        if (related.length < 4) {
            related = PRODUCTS.filter(function (x) { return x.handle !== handle; });
        }
        el.innerHTML = related.slice(0, 8).map(productCardHTML).join('');
    }

    function closePDP(fromPopState) {
        const overlay = document.getElementById('pdpOverlay');
        if (overlay) { overlay.classList.remove('active'); document.body.style.overflow = ''; }
        const wasOpen = !!pdpHandle;
        pdpHandle = null;
        // If the user tapped the X/back link (not the phone's back button),
        // undo the history entry we pushed so state stays in sync.
        if (wasOpen && !fromPopState) history.back();
    }

    function initPDP() {
        const overlay = document.getElementById('pdpOverlay');
        if (!overlay) return;
        const addBtn = document.getElementById('pdpAdd');
        if (addBtn) addBtn.addEventListener('click', function () {
            if (!pdpHandle) return;
            addToBag(pdpHandle, pdpSize, pdpQty, addBtn);
        });
        const wishBtn = document.getElementById('pdpWish');
        if (wishBtn) wishBtn.addEventListener('click', function () {
            if (!pdpHandle) return;
            toggleWish(pdpHandle);
            wishBtn.textContent = WISHLIST.indexOf(pdpHandle) > -1 ? '♥' : '♡';
        });
        document.addEventListener('click', function (e) {
            const sizeBtn = e.target.closest('.pdp-size');
            if (sizeBtn) {
                pdpSize = sizeBtn.getAttribute('data-size');
                renderPdpSizes();
                return;
            }
        });
        const qtyInc = document.getElementById('pdpQtyInc');
        const qtyDec = document.getElementById('pdpQtyDec');
        if (qtyInc) qtyInc.addEventListener('click', function () {
            pdpQty = Math.min(pdpQty + 1, 10);
            const v = document.getElementById('pdpQtyVal');
            if (v) v.textContent = pdpQty;
        });
        if (qtyDec) qtyDec.addEventListener('click', function () {
            pdpQty = Math.max(pdpQty - 1, 1);
            const v = document.getElementById('pdpQtyVal');
            if (v) v.textContent = pdpQty;
        });
        const guide = document.getElementById('pdpSizeGuide');
        const guideOverlay = document.getElementById('sizeGuideOverlay');
        const guideClose = document.getElementById('sizeGuideClose');
        if (guide && guideOverlay) guide.addEventListener('click', function (e) {
            e.preventDefault();
            guideOverlay.classList.add('active');
        });
        if (guideClose && guideOverlay) guideClose.addEventListener('click', function () {
            guideOverlay.classList.remove('active');
        });
        if (guideOverlay) guideOverlay.addEventListener('click', function (e) {
            if (e.target === guideOverlay) guideOverlay.classList.remove('active');
        });
        const closeBtn = document.getElementById('pdpClose');
        if (closeBtn) closeBtn.addEventListener('click', function () { closePDP(); });
        const backBtn = document.getElementById('ppBack');
        if (backBtn) backBtn.addEventListener('click', function () { closePDP(); });

        window.addEventListener('popstate', function () {
            if (pdpHandle) closePDP(true);
        });
        document.addEventListener('click', function (e) {
            if (e.target.closest('.add-to-bag')) return;
            const card = e.target.closest('.product-card[data-handle]');
            if (card) {
                e.preventDefault();
                openPDP(card.getAttribute('data-handle'));
            }
        });
    }

    /* ---------- API helpers ---------- */
    function getToken() {
        try { return localStorage.getItem('avelyn_token'); } catch (e) { return null; }
    }
    function setToken(token) {
        try {
            if (token) localStorage.setItem('avelyn_token', token);
            else localStorage.removeItem('avelyn_token');
        } catch (e) { /* localStorage unavailable, e.g. private mode */ }
    }

    function apiFetch(path, options) {
        options = options || {};
        const headers = Object.assign({}, options.headers);
        const token = getToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;
        return fetch(API_BASE + path, Object.assign({ credentials: 'include' }, options, { headers }))
            .then(function (r) {
                return r.json().catch(function () { return {}; }).then(function (data) {
                    if (!r.ok) throw new Error(data.error || ('API request failed: ' + path));
                    return data;
                });
            });
    }

    /* ---------- Account ---------- */
    let CURRENT_USER = null;

    function loadAccount() {
        if (!getToken()) return;
        apiFetch('/auth/me').then(function (user) {
            CURRENT_USER = user;
        }).catch(function () {
            setToken(null);
            CURRENT_USER = null;
        });
    }

    function showAccountPanel(panel) {
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        const success = document.getElementById('accountSuccess');
        if (loginForm) loginForm.style.display = panel === 'login' ? 'block' : 'none';
        if (signupForm) signupForm.style.display = panel === 'signup' ? 'block' : 'none';
        if (success) success.style.display = panel === 'success' ? 'block' : 'none';
    }

    function openAccount() {
        const overlay = document.getElementById('accountOverlay');
        if (CURRENT_USER) {
            const welcome = document.getElementById('accountWelcome');
            const emailShown = document.getElementById('accountEmailShown');
            if (welcome) welcome.textContent = 'hi, ' + CURRENT_USER.name.split(' ')[0] + '!';
            if (emailShown) emailShown.textContent = CURRENT_USER.email;
            showAccountPanel('success');
        } else {
            showAccountPanel('login');
        }
        if (overlay) overlay.classList.add('active');
    }

    function closeAccount() {
        const overlay = document.getElementById('accountOverlay');
        if (overlay) overlay.classList.remove('active');
    }

    function doLogin() {
        const email = document.getElementById('loginEmail');
        const password = document.getElementById('loginPassword');
        if (!email || !password || !email.value.trim() || !password.value) {
            toast('please enter email and password');
            return;
        }
        apiFetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email.value.trim(), password: password.value })
        }).then(function (data) {
            setToken(data.token);
            CURRENT_USER = data.user;
            email.value = '';
            password.value = '';
            toast('logged in as ' + data.user.name);
            openAccount();
            mergeGuestData();
        }).catch(function () { toast('invalid email or password'); });
    }

    function doSignup() {
        const name = document.getElementById('signupName');
        const email = document.getElementById('signupEmail');
        const password = document.getElementById('signupPassword');
        if (!name || !email || !password || !name.value.trim() || !email.value.trim() || !password.value) {
            toast('please fill all fields');
            return;
        }
        if (password.value.length < 6) {
            toast('password must be at least 6 characters');
            return;
        }
        apiFetch('/auth/signup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.value.trim(), email: email.value.trim(), password: password.value })
        }).then(function (data) {
            setToken(data.token);
            CURRENT_USER = data.user;
            name.value = '';
            email.value = '';
            password.value = '';
            toast('account created, welcome ' + data.user.name);
            openAccount();
            mergeGuestData();
        }).catch(function () { toast('could not create account (email may already be in use)'); });
    }

    function mergeGuestData() {
        Promise.all([
            apiFetch('/cart/merge', { method: 'POST' }),
            apiFetch('/wishlist/merge', { method: 'POST' })
        ]).then(function () {
            loadCart();
            loadWishlist();
        }).catch(function (err) {
            console.warn('Failed to merge guest cart/wishlist:', err);
            loadCart();
            loadWishlist();
        });
    }

    function doLogout() {
        setToken(null);
        CURRENT_USER = null;
        toast('logged out');
        openAccount();
        loadCart();
        loadWishlist();
    }

    function initAccount() {
        const overlay = document.getElementById('accountOverlay');
        if (!overlay) return;
        const accountBtn = document.getElementById('accountBtn');
        if (accountBtn) accountBtn.addEventListener('click', function (e) { e.preventDefault(); openAccount(); });
        const closeBtn = document.getElementById('accountClose');
        if (closeBtn) closeBtn.addEventListener('click', closeAccount);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeAccount(); });

        const showSignup = document.getElementById('showSignup');
        if (showSignup) showSignup.addEventListener('click', function (e) { e.preventDefault(); showAccountPanel('signup'); });
        const showLogin = document.getElementById('showLogin');
        if (showLogin) showLogin.addEventListener('click', function (e) { e.preventDefault(); showAccountPanel('login'); });

        const loginSubmit = document.getElementById('loginSubmit');
        if (loginSubmit) loginSubmit.addEventListener('click', doLogin);
        const signupSubmit = document.getElementById('signupSubmit');
        if (signupSubmit) signupSubmit.addEventListener('click', doSignup);
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.addEventListener('click', doLogout);
        const accountOk = document.getElementById('accountOk');
        if (accountOk) accountOk.addEventListener('click', closeAccount);
    }

    /* ---------- Wishlist ---------- */
    let WISHLIST = []; // array of product objects, hydrated from the API

    function refreshWishBadge() {
        const badge = document.getElementById('wishCount');
        if (badge) badge.textContent = WISHLIST.length;
    }

    function loadWishlist() {
        return apiFetch('/wishlist').then(function (data) {
            WISHLIST = data.items;
            refreshWishBadge();
            if (drawerMode === 'wish') renderWish();
        }).catch(function (err) { console.warn('Failed to load wishlist:', err); });
    }

    function toggleWish(handle) {
        apiFetch('/wishlist/items/' + encodeURIComponent(handle) + '/toggle', { method: 'POST' })
            .then(function (data) {
                WISHLIST = data.items;
                toast(data.inWishlist ? 'added to wishlist' : 'removed from wishlist');
                refreshWishBadge();
                if (drawerMode === 'wish') renderWish();
            })
            .catch(function (err) { console.warn('Failed to update wishlist:', err); });
    }

    function wishRow(p) {
        const soldOut = p.available === false;
        return '<div class="cart-item">' +
            '<img class="cart-item-img" src="' + (p.img || 'images/dress1.svg') + '" alt="' + htmlEncode(p.title) + '" data-handle="' + htmlEncode(p.handle) + '">' +
            '<div class="cart-item-info">' +
            '<div class="cart-item-name">' + htmlEncode(p.title.toLowerCase()) + '</div>' +
            '<div class="cart-item-price">' + fmtPrice(p.price) +
            (p.compareAt ? '<span class="original-price"><s>' + fmtPrice(p.compareAt) + '</s></span>' : '') + '</div>' +
            '<button type="button" class="wish-add-bag"' + (soldOut ? ' disabled' : '') + ' data-wish-add="' + p.handle + '">' +
            (soldOut ? 'sold out' : 'add to bag') + '</button>' +
            '</div>' +
            '<button type="button" class="cart-item-remove" data-wish-remove="' + p.handle + '" aria-label="remove">&times;</button>' +
            '</div>';
    }

    function renderWish() {
        const itemsEl = document.getElementById('cartItems');
        const emptyEl = document.getElementById('cartEmpty');
        if (itemsEl) itemsEl.innerHTML = WISHLIST.map(wishRow).join('');
        if (emptyEl) emptyEl.style.display = WISHLIST.length ? 'none' : 'block';
    }

    /* ---------- Cart ---------- */
    var CART = []; // array of {handle, size, qty, product, lineTotal}, hydrated from the API
    let drawerMode = 'cart';

    function productByHandle(handle) {
        for (let i = 0; i < PRODUCTS.length; i++) {
            if (PRODUCTS[i].handle === handle) return PRODUCTS[i];
        }
        return null;
    }

    function cartKey(handle, size) {
        return handle + '::' + (size || 'M');
    }

    function applyCartData(data) {
        CART = data.items;
        const subEl = document.getElementById('cartSubtotal');
        if (subEl) subEl.textContent = fmtPrice(data.subtotal);
        const badge = document.getElementById('cartCount');
        if (badge) badge.textContent = data.count;
    }

    function loadCart() {
        return apiFetch('/cart').then(function (data) {
            applyCartData(data);
            if (drawerMode === 'cart') renderCart();
        }).catch(function (err) { console.warn('Failed to load cart:', err); });
    }

    function cartItemRow(item) {
        const p = item.product;
        if (!p) return '';
        return '<div class="cart-item">' +
            '<img class="cart-item-img" src="' + (p.img || 'images/dress1.svg') + '" alt="' + htmlEncode(p.title) + '" data-handle="' + htmlEncode(p.handle) + '">' +
            '<div class="cart-item-info">' +
            '<div class="cart-item-name">' + htmlEncode(p.title.toLowerCase()) + '</div>' +
            '<div class="cart-item-size">size ' + htmlEncode(item.size) + '</div>' +
            '<div class="cart-item-price">' + fmtPrice(p.price) +
            (p.compareAt ? '<span class="original-price"><s>' + fmtPrice(p.compareAt) + '</s></span>' : '') + '</div>' +
            '<div class="cart-qty">' +
            '<button type="button" data-cart-dec="' + cartKey(item.handle, item.size) + '" aria-label="decrease">−</button>' +
            '<span>' + item.qty + '</span>' +
            '<button type="button" data-cart-inc="' + cartKey(item.handle, item.size) + '" aria-label="increase">+</button>' +
            '</div>' +
            '</div>' +
            '<button type="button" class="cart-item-remove" data-cart-remove="' + cartKey(item.handle, item.size) + '" aria-label="remove">&times;</button>' +
            '</div>';
    }

    function renderCart() {
        const itemsEl = document.getElementById('cartItems');
        const emptyEl = document.getElementById('cartEmpty');
        const foot = document.getElementById('cartFoot');
        const title = document.getElementById('drawerTitle');
        if (drawerMode === 'wish') {
            if (title) title.textContent = 'wishlist';
            if (foot) foot.style.display = 'none';
            renderWish();
            return;
        }
        if (title) title.textContent = 'your bag';
        if (foot) foot.style.display = 'block';
        if (itemsEl) itemsEl.innerHTML = CART.map(cartItemRow).join('');
        if (emptyEl) emptyEl.style.display = CART.length ? 'none' : 'block';
    }

    function addToBag(handle, size, qty, btn) {
        apiFetch('/cart/items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle: handle, size: size || 'M', qty: qty || 1 })
        }).then(function (data) {
            applyCartData(data);
            if (drawerMode === 'cart') renderCart();
            const p = productByHandle(handle);
            const label = p ? p.title.toLowerCase().split(' ').slice(0, 3).join(' ') : 'item';
            toast(label + '... added to bag');
            if (btn) {
                btn.classList.add('added');
                btn.textContent = 'added ✓';
                setTimeout(function () {
                    btn.classList.remove('added');
                    btn.textContent = 'add to bag';
                }, 1200);
            }
        }).catch(function (err) {
            console.warn('Failed to add to bag:', err);
            toast(err.message === 'Product is out of stock' ? 'sorry, this item is sold out' : 'could not add to bag');
        });
    }

    function changeQty(key, delta) {
        const parts = key.split('::');
        const handle = parts[0];
        const size = parts[1] || 'M';
        const line = CART.filter(function (i) { return i.handle === handle && i.size === size; })[0];
        if (!line) return;
        const newQty = line.qty + delta;
        apiFetch('/cart/items/' + encodeURIComponent(handle) + '/' + encodeURIComponent(size), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ qty: newQty })
        }).then(function (data) {
            applyCartData(data);
            renderCart();
        }).catch(function (err) { console.warn('Failed to update quantity:', err); });
    }

    function removeItem(key) {
        const parts = key.split('::');
        const handle = parts[0];
        const size = parts[1] || 'M';
        apiFetch('/cart/items/' + encodeURIComponent(handle) + '/' + encodeURIComponent(size), { method: 'DELETE' })
            .then(function (data) {
                applyCartData(data);
                renderCart();
            }).catch(function (err) { console.warn('Failed to remove item:', err); });
    }

    function cartTotal() {
        let total = 0;
        CART.forEach(function (item) { total += item.lineTotal; });
        return total;
    }

    let toastTimer = null;
    function toast(msg) {
        const el = document.getElementById('cartToast');
        if (!el) return;
        el.textContent = msg;
        el.classList.add('show');
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1800);
    }

    /* ---------- Checkout ---------- */
    function checkoutTotal() {
        const ship = coShippingFee();
        return { items: cartTotal(), ship: ship, total: cartTotal() + ship };
    }

    const FREE_SHIP_THRESHOLD = 1499;
    const SHIP_COST = 79;

    function coShippingFee() {
        const subtotal = cartTotal();
        return subtotal >= FREE_SHIP_THRESHOLD || subtotal === 0 ? 0 : SHIP_COST;
    }

    function coRefreshTotals() {
        const t = checkoutTotal();
        const shipEl = document.getElementById('coShippingVal');
        const totalEl = document.getElementById('coTotal');
        if (shipEl) shipEl.textContent = t.ship > 0 ? '+ ₹ ' + t.ship + ' (shipping)' : 'free shipping';
        if (totalEl) totalEl.textContent = fmtPrice(t.total);
    }

    function openCheckout() {
        if (CART.length === 0) {
            toast('your bag is empty');
            return;
        }
        const overlay = document.getElementById('checkoutOverlay');
        const form = document.getElementById('checkoutForm');
        const success = document.getElementById('checkoutSuccess');
        if (form) form.style.display = 'block';
        if (success) success.style.display = 'none';
        if (overlay) overlay.classList.add('active');
        coRefreshTotals();
    }

    function closeCheckout() {
        const overlay = document.getElementById('checkoutOverlay');
        if (overlay) overlay.classList.remove('active');
    }

    function placeOrder() {
        const name = document.getElementById('coName');
        const phone = document.getElementById('coPhone');
        const address = document.getElementById('coAddress');
        const city = document.getElementById('coCity');
        const pin = document.getElementById('coPin');
        if (!name || !phone) return;
        if (!name.value.trim() || !phone.value.trim() || !address || !address.value.trim()) {
            toast('please fill name, phone and address');
            return;
        }
        if (!/^[0-9]{10}$/.test(phone.value.trim())) {
            toast('phone must be exactly 10 digits');
            return;
        }
        if (!pin || !/^[0-9]{6}$/.test(pin.value.trim())) {
            toast('pincode must be 6 digits');
            return;
        }

        const shipping = {
            name: name.value.trim(),
            phone: phone.value.trim(),
            address: address.value.trim(),
            city: city ? city.value.trim() : '',
            pincode: pin.value.trim()
        };

        const payMethod = document.querySelector('input[name="pay"]:checked');
        const method = payMethod ? payMethod.value : 'cod';

        if (method === 'razorpay') {
            payWithRazorpay(shipping);
        } else {
            apiFetch('/orders/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ shipping: shipping, paymentMethod: 'cod' })
            }).then(showOrderSuccess).catch(function (err) {
                console.warn('Checkout failed:', err);
                toast('checkout failed, please try again');
            });
        }
    }

    function trackPurchaseConversion(order) {
        if (typeof gtag !== 'function') {
            console.warn('[gtag] not loaded — conversion NOT sent (likely blocked by an ad blocker/extension)');
            return;
        }

        // Google Ads conversion action ("Purchase")
        const adsPayload = {
            send_to: 'AW-18335514085/1AMECM7Xj-ocEOX7hqdE',
            transaction_id: order.orderNumber,
            value: order.totals.total,
            currency: 'INR'
        };
        console.log('[gtag] firing Ads conversion event:', adsPayload);
        gtag('event', 'conversion', adsPayload);

        // GA4 purchase event — feeds the "lunafemme.in (web) purchase" conversion action
        const ga4Payload = {
            transaction_id: order.orderNumber,
            value: order.totals.total,
            currency: 'INR',
            shipping: order.totals.shipping,
            items: order.items.map(function (item) {
                return {
                    item_id: item.handle,
                    item_name: item.title,
                    price: item.price,
                    quantity: item.qty
                };
            })
        };
        console.log('[gtag] firing GA4 purchase event:', ga4Payload);
        gtag('event', 'purchase', ga4Payload);
    }

    function showOrderSuccess(order) {
        trackPurchaseConversion(order);
        const noEl = document.getElementById('orderNo');
        if (noEl) noEl.textContent = 'order #' + order.orderNumber;
        const totEl = document.getElementById('orderTotal');
        if (totEl) totEl.textContent = 'total ' + fmtPrice(order.totals.total) + ' (incl ₹ ' + order.totals.shipping + ' shipping)';
        CART = [];
        renderCart();
        const form = document.getElementById('checkoutForm');
        const success = document.getElementById('checkoutSuccess');
        if (form) form.style.display = 'none';
        if (success) success.style.display = 'block';
        const badge = document.getElementById('cartCount');
        if (badge) badge.textContent = '0';
    }

    function payWithRazorpay(shipping) {
        if (typeof Razorpay === 'undefined') {
            toast('payment widget failed to load');
            return;
        }
        apiFetch('/payments/razorpay/order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ shipping: shipping })
        }).then(function (data) {
            const rzp = new Razorpay({
                key: data.keyId,
                amount: data.amount,
                currency: data.currency,
                order_id: data.orderId,
                name: 'Luna Femme',
                description: 'Order payment',
                prefill: { name: shipping.name, contact: shipping.phone },
                theme: { color: '#1B1815' },
                handler: function (response) {
                    apiFetch('/payments/razorpay/verify', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            shipping: shipping,
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature
                        })
                    }).then(showOrderSuccess).catch(function (err) {
                        console.warn('Payment verification failed:', err);
                        toast('payment could not be verified, please contact support');
                    });
                },
                modal: {
                    ondismiss: function () { toast('payment cancelled'); }
                }
            });
            rzp.on('payment.failed', function () { toast('payment failed, please try again'); });
            rzp.open();
        }).catch(function (err) {
            console.warn('Could not start payment:', err);
            toast('online payment is unavailable right now, try cash on delivery');
        });
    }

    function initCart() {
        const drawer = document.getElementById('cartDrawer');
        const overlay = document.getElementById('cartOverlay');
        if (!drawer || !overlay) return;

        const open = function () { drawer.classList.add('active'); overlay.classList.add('active'); drawer.setAttribute('aria-hidden', 'false'); };
        const close = function () { drawer.classList.remove('active'); overlay.classList.remove('active'); drawer.setAttribute('aria-hidden', 'true'); };

        const openDrawer = function (mode) {
            drawerMode = mode;
            renderCart();
            open();
        };
        const cartBtn = document.getElementById('cartBtn');
        if (cartBtn) cartBtn.addEventListener('click', function (e) { e.preventDefault(); openDrawer('cart'); });
        const wishBtn = document.getElementById('wishBtn');
        if (wishBtn) wishBtn.addEventListener('click', function (e) { e.preventDefault(); openDrawer('wish'); });

        const closeBtn = document.getElementById('cartClose');
        if (closeBtn) closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', close);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') close();
        });

        const checkout = document.getElementById('cartCheckout');
        if (checkout) checkout.addEventListener('click', openCheckout);

        const coClose = document.getElementById('checkoutClose');
        const coOverlay = document.getElementById('checkoutOverlay');
        if (coOverlay) coOverlay.addEventListener('click', function (e) { if (e.target === coOverlay) closeCheckout(); });
        if (coClose) coClose.addEventListener('click', closeCheckout);
        const coPhone = document.getElementById('coPhone');
        if (coPhone) coPhone.addEventListener('input', function () {
            this.value = this.value.replace(/[^0-9]/g, '').slice(0, 10);
        });
        const coPin = document.getElementById('coPin');
        if (coPin) coPin.addEventListener('input', function () {
            this.value = this.value.replace(/[^0-9]/g, '').slice(0, 6);
        });
        document.querySelectorAll('input[name="pay"]').forEach(function (r) {
            r.addEventListener('change', coRefreshTotals);
        });
        const coPlace = document.getElementById('placeOrder');
        if (coPlace) coPlace.addEventListener('click', placeOrder);
        const coOk = document.getElementById('orderOk');
        if (coOk) coOk.addEventListener('click', function () { closeCheckout(); close(); });

        document.addEventListener('click', function (e) {
            const bagBtn = e.target.closest('.add-to-bag');
            if (bagBtn) {
                e.preventDefault();
                e.stopPropagation();
                addToBag(bagBtn.getAttribute('data-handle'), 'M', 1, bagBtn);
                return;
            }
            const wishAdd = e.target.closest('[data-wish-add]');
            if (wishAdd) {
                addToBag(wishAdd.getAttribute('data-wish-add'), 'M', 1);
                return;
            }
            const wishRem = e.target.closest('[data-wish-remove]');
            if (wishRem) {
                toggleWish(wishRem.getAttribute('data-wish-remove'));
                return;
            }
            const inc = e.target.closest('[data-cart-inc]');
            if (inc) { changeQty(inc.getAttribute('data-cart-inc'), 1); return; }
            const dec = e.target.closest('[data-cart-dec]');
            if (dec) { changeQty(dec.getAttribute('data-cart-dec'), -1); return; }
            const rem = e.target.closest('[data-cart-remove]');
            if (rem) { removeItem(rem.getAttribute('data-cart-remove')); return; }
        });
    }

    /* ---------- Info modal (About Us / Policies / Contact) ---------- */
    const INFO_PAGES = {
        about: {
            title: 'About Luna Femme',
            body: '<p><strong>Luna Femme</strong> is a trendy women\'s clothing brand from India. We design and create fashionable clothing for the modern Indian woman — from casual everyday wear to party-ready outfits.</p>' +
                '<p>Everything is designed in-house, and we restock the newest trends every single week. Our sizes run from S to XL and we focus on comfort, quality fabrics, and flattering fits.</p>' +
                '<p>COD available across India · 7-day easy returns · new drop every wednesday.</p>'
        },
        blog: {
            title: 'Luna Femme Journal',
            body: '<p>Style tips, trend guides, and outfit ideas — coming to our journal soon.</p>' +
                '<p>Right now, explore our collections: tops, dresses, co-ords, shirts and tees for this week\'s hottest looks.</p>'
        },
        returns_my: {
            title: 'My Returns',
            body: '<p>All orders include <strong>7-day easy returns</strong>.</p>' +
                '<p>To start a return, send your order number and the items you want to return to <a href="mailto:svigneshinba@gmail.com">svigneshinba@gmail.com</a> within 7 days of delivery.</p>' +
                '<p>Refunds are processed within 3–5 business days after the returned items reach us.</p>'
        },
        privacy: {
            title: 'Privacy Policy',
            body: '<p>We only collect what\'s needed to process your order (name, phone, address, email). Your data is never sold or shared with third parties (except the delivery partner).</p>' +
                '<p>This is a demo store — no real personal data is stored.</p>'
        },
        shipping: {
            title: 'Shipping & Returns',
            body: '<p><strong>Shipping:</strong> ₹100 flat shipping on every order (COD and prepaid). Delivery takes 3–7 business days across India.</p>' +
                '<p><strong>Returns:</strong> 7-day easy returns. Items must be unworn with tags attached. Send a photo of the item to <a href="mailto:svigneshinba@gmail.com">svigneshinba@gmail.com</a> to start the process.</p>'
        },
        payments: {
            title: 'Payments & Orders',
            body: '<p>We accept <strong>Cash on Delivery (COD)</strong> and UPI.</p>' +
                '<p>Once you place an order you\'ll receive a confirmation with your order number. Track your order by emailing us with your order number.</p>' +
                '<p><em>Note:</em> this demo store does not charge real money.</p>'
        },
        contact: {
            title: 'Contact Us',
            body: '<p>We\'d love to hear from you!</p>' +
                '<p>Email: <a href="mailto:svigneshinba@gmail.com">svigneshinba@gmail.com</a></p>' +
                '<p>WhatsApp: <a href="https://wa.me/917695841371" target="_blank" rel="noopener">+91 76958 41371</a></p>' +
                '<p>Hours: Mon–Sat, 10 AM – 7 PM IST</p>'
        },
        terms: {
            title: 'Terms & Conditions',
            body: '<p>By using this store you agree that all product images, descriptions and pricing are for demo purposes.</p>' +
                '<p>Prices include a flat ₹100 shipping fee. Offers, codes and promotions are shown at the storefront.</p>' +
                '<p>This is a personal replica project of a real storefront and is not affiliated with uptownie.com.</p>'
        }
    };

    function initInfoPages() {
        const overlay = document.getElementById('infoOverlay');
        if (!overlay) return;
        const close = function () { overlay.classList.remove('active'); };
        const closeBtn = document.getElementById('infoClose');
        if (closeBtn) closeBtn.addEventListener('click', close);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
        document.addEventListener('click', function (e) {
            const link = e.target.closest('[data-info]');
            if (!link) return;
            e.preventDefault();
            const key = link.getAttribute('data-info');
            if (key === 'sizeguide') {
                const sg = document.getElementById('sizeGuideOverlay');
                if (sg) sg.classList.add('active');
                return;
            }
            const page = INFO_PAGES[key];
            if (!page) return;
            const title = document.getElementById('infoTitle');
            const body = document.getElementById('infoBody');
            if (title) title.textContent = page.title;
            if (body) body.innerHTML = page.body;
            overlay.classList.add('active');
        });
    }

    /* ---------- Init ---------- */
    initCategoryLinks();
    initNavLinks();
    initPDP();
    initCart();
    initAccount();
    initInfoPages();
    initImageFallback();
    loadCatalog(function () {
        // Supports deep links like ?shop=Dresses or ?shop=sale (used by ad
        // sitelinks) to land directly on a filtered view instead of the top.
        const shopParam = new URLSearchParams(window.location.search).get('shop');
        if (shopParam) {
            applyNav(shopParam);
            const el = document.getElementById('shopAll');
            if (el) el.scrollIntoView();
        }
    });
    loadAccount();
    loadCart();
    loadWishlist();
});