/**
 * OJS 3.3 Metadata Auto-Filler (v3.2 - English Initials Fix)
 * ==========================================
 * Инструкция:
 * 1. Откройте страницу редактирования статьи в OJS.
 * 2. Откройте консоль браузера (F12).
 * 3. Вставьте этот код и нажмите Enter.
 * 4. Заполните данные через панель.
 */

(function () {
    // === КОНФИГУРАЦИЯ ===
    const LOCALE_MAP = {
        'rus': 'ru_RU',
        'kaz': 'kk_KZ',
        'kk': 'kk_KZ',
        'eng': 'en_US'
    };

    const COUNTRY_MAP = {
        'Казахстан': 'Kazakhstan',
        'Kazakhstan': 'Kazakhstan',
        'Қазақстан': 'Kazakhstan'
    };

    let parsedData = null;

    // === UI ===
    function createUI() {
        const id = 'ojs-autofill-panel';
        if (document.getElementById(id)) document.getElementById(id).remove();

        const panel = document.createElement('div');
        panel.id = id;
        panel.style.cssText = `
            position: fixed; top: 10px; left: 10px; width: 350px; max-height: 90vh;
            background: #ffffff; border: 1px solid #ccc; box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 10000; padding: 15px; font-family: sans-serif; font-size: 13px;
            overflow-y: auto; border-radius: 8px;
        `;

        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <h3 style="margin:0; color:#007ab2;">OJS Auto-Filler v3.2</h3>
                <button id="ojs-debug-btn" style="font-size:10px; padding:2px 5px;">Debug</button>
            </div>
            <textarea id="ojs-json-input" placeholder="Вставьте JSON..." style="width:100%; height:80px; margin:10px 0; border:1px solid #ddd; padding:5px;"></textarea>
            <button id="ojs-parse-btn" style="width:100%; padding:8px; background:#007ab2; color:white; border:none; cursor:pointer; border-radius:4px;">1. Распознать JSON</button>
            
            <div id="ojs-controls" style="margin-top:15px; display:none;">
                <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">
                <h4 style="margin:5px 0;">Метаданные публикации</h4>
                <button id="ojs-fill-meta" style="width:100%; padding:8px; background:#28a745; color:white; border:none; cursor:pointer; border-radius:4px;">Заполнить Title и Abstract</button>
                
                <h4 style="margin:10px 0 5px;">Ключевые слова (Click to Copy)</h4>
                <div id="ojs-keywords-list" style="margin-bottom:10px;"></div>

                <hr style="border:0; border-top:1px solid #eee; margin:10px 0;">
                <h4 style="margin:5px 0;">Авторы (Contributors)</h4>
                <p style="font-size:11px; color:#666; margin-bottom:5px;">Откройте модалку автора, затем нажмите кнопку:</p>
                <div id="ojs-authors-list"></div>
            </div>
            <button id="ojs-close-btn" style="margin-top:15px; width:100%; padding:5px; background:#6c757d; color:white; border:none; cursor:pointer; border-radius:4px;">Закрыть</button>
        `;

        document.body.appendChild(panel);
        document.getElementById('ojs-close-btn').onclick = () => panel.remove();
        document.getElementById('ojs-parse-btn').onclick = parseJSON;
        document.getElementById('ojs-fill-meta').onclick = fillMainMetadata;
        document.getElementById('ojs-debug-btn').onclick = runDebug;
    }

    // === ЛОГИКА ===

    function findElementV3(type, locale) {
        // Based on user logs
        const selectors = [];

        if (type === 'title') {
            selectors.push({ id: `titleAbstract-title-control-${locale}` });
            selectors.push({ name: `title-${locale}` });
            selectors.push({ name: `title[${locale}]` });
        } else if (type === 'abstract') {
            selectors.push({ id: `titleAbstract-abstract-control-${locale}`, isTiny: true });
            selectors.push({ name: `abstract-${locale}`, isTiny: true });
        } else if (type === 'givenName') {
            selectors.push({ idSuffix: `-givenName-control-${locale}` });
            selectors.push({ name: `givenName-${locale}` });
            selectors.push({ name: `givenName[${locale}]` });
        } else if (type === 'familyName') {
            selectors.push({ idSuffix: `-familyName-control-${locale}` });
            selectors.push({ name: `familyName-${locale}` });
            selectors.push({ name: `familyName[${locale}]` });
        } else if (type === 'affiliation') {
            selectors.push({ idSuffix: `-affiliation-control-${locale}`, isTiny: true });
            selectors.push({ name: `affiliation-${locale}`, isTiny: true });
            selectors.push({ name: `affiliation[${locale}]` });
        }

        // Executor
        for (let s of selectors) {
            if (s.id) {
                const el = document.getElementById(s.id);
                if (el) return { el, method: s.isTiny ? 'tinymce' : 'value', key: s.id };
                if (s.isTiny && window.tinyMCE && window.tinyMCE.get(s.id)) {
                    return { el: null, method: 'tinymce-direct', key: s.id };
                }
            }
            if (s.name) {
                const el = document.querySelector(`[name="${s.name}"]`);
                if (el) return { el, method: s.isTiny ? 'tinymce' : 'value', key: s.name };
            }
            if (s.idSuffix) {
                const all = document.querySelectorAll('input, textarea');
                for (let el of all) {
                    if (el.id && el.id.endsWith(s.idSuffix)) {
                        return { el, method: s.isTiny ? 'tinymce' : 'value', key: el.id };
                    }
                }
                if (s.isTiny && window.tinyMCE && window.tinyMCE.editors) {
                    for (let i = 0; i < window.tinyMCE.editors.length; i++) {
                        const ed = window.tinyMCE.editors[i];
                        if (ed.id && ed.id.endsWith(s.idSuffix)) {
                            return { el: null, method: 'tinymce-direct', key: ed.id };
                        }
                    }
                }
            }
        }
        return null;
    }

    function setValue(target, value) {
        if (!target) return false;

        if (target.method === 'tinymce' || target.method === 'tinymce-direct') {
            const editorId = target.key;
            let ed = window.tinyMCE.get(editorId);
            if (!ed && target.el) {
                for (let i = 0; i < window.tinyMCE.editors.length; i++) {
                    if (window.tinyMCE.editors[i].getElement() === target.el) {
                        ed = window.tinyMCE.editors[i];
                        break;
                    }
                }
            }
            if (ed) {
                ed.setContent(value);
                return true;
            } else {
                if (target.el) {
                    target.el.value = value;
                    triggerChange(target.el);
                    return true;
                }
            }
        } else {
            if (target.el) {
                target.el.value = value;
                triggerChange(target.el);
                return true;
            }
        }
        return false;
    }

    function fillMainMetadata() {
        if (!parsedData) return;
        let log = [];

        ['rus', 'kaz', 'eng'].forEach(lang => {
            const val = parsedData['article_title_' + lang];
            if (val) {
                const locale = LOCALE_MAP[lang];
                const found = findElementV3('title', locale);
                if (setValue(found, val)) log.push(`✅ Title ${locale}`);
                else log.push(`❌ Title ${locale} not found`);
            }
        });

        ['rus', 'kaz', 'eng'].forEach(lang => {
            const val = parsedData['abstract_' + lang];
            if (val) {
                const locale = LOCALE_MAP[lang];
                const found = findElementV3('abstract', locale);
                if (setValue(found, val)) log.push(`✅ Abstract ${locale}`);
                else log.push(`❌ Abstract ${locale} not found`);
            }
        });

        console.log(log.join('\n'));
        alert('Результат:\n' + log.join('\n'));
    }

    function fillAuthorForm(authData) {
        let log = [];
        const langs = ['ru', 'kk', 'en'];

        langs.forEach(l => {
            const d = authData[l];
            if (!d) return;
            const locale = LOCALE_MAP[l === 'kk' ? 'kaz' : (l === 'ru' ? 'rus' : 'eng')];

            // Name processing
            let fName = d.first_name;
            if (fName && fName.length > 0) {
                fName = fName.trim();

                // Special Initials Logic for English
                if (l === 'en') {
                    // Check specific digraphs/prefixes
                    const lower = fName.toLowerCase();
                    if (lower.startsWith('zh') || lower.startsWith('kh') || lower.startsWith('ye') || lower.startsWith('sh') || lower.startsWith('ch')) {
                        // Take 2 letters for Zh, Kh, Ye, Sh, Ch
                        fName = fName.substr(0, 2) + '.';
                    } else {
                        // Standard 1 letter
                        fName = fName.charAt(0) + '.';
                    }
                } else {
                    // Standard logic for RU/KK
                    fName = fName.charAt(0).toUpperCase() + '.';
                }
            }

            if (setValue(findElementV3('givenName', locale), fName)) log.push(`Name ${locale}`);
            if (setValue(findElementV3('familyName', locale), d.last_name)) log.push(`Surname ${locale}`);

            // Affiliation
            if (setValue(findElementV3('affiliation', locale), d.university)) log.push(`Affiliation ${locale}`);
        });

        // Common
        const ru = authData.ru;
        if (ru.email) {
            const el = document.querySelector('input[name="email"]');
            if (el) { el.value = ru.email; triggerChange(el); log.push('Email'); }
        }

        // ORCID Fix
        if (ru.orcid) {
            let orcidVal = ru.orcid.trim();
            if (!orcidVal.startsWith('http')) {
                orcidVal = `https://orcid.org/${orcidVal}`;
            }
            const el = document.querySelector('input[name="orcid"]');
            if (el) { el.value = orcidVal; triggerChange(el); log.push('ORCID'); }
        }

        // Country
        if (ru.country) {
            const el = document.querySelector('select[name="country"]');
            if (el) {
                const target = COUNTRY_MAP[ru.country] || ru.country;
                let found = false;
                for (let opt of el.options) {
                    if (opt.text.includes(target) || opt.value === target) {
                        el.selectedIndex = opt.index;
                        triggerChange(el);
                        log.push(`Country: ${target}`);
                        found = true;
                        break;
                    }
                }
                if (!found) log.push(`Country not found: ${target}`);
            }
        }

        console.log('Author Log:', log);
        const btn = document.activeElement;
        if (btn && btn.tagName === 'BUTTON') {
            const old = btn.innerText;
            btn.innerText = '✅ OK';
            setTimeout(() => btn.innerText = old, 1500);
        }
    }

    // --- Helpers ---
    function parseJSON() {
        try {
            parsedData = JSON.parse(document.getElementById('ojs-json-input').value);
            document.getElementById('ojs-controls').style.display = 'block';
            document.getElementById('ojs-parse-btn').textContent = '✅ OK';
            renderAuthors();
            renderKeywordsHelp();
        } catch (e) { alert('Invalid JSON'); }
    }

    function renderAuthors() {
        const c = document.getElementById('ojs-authors-list');
        c.innerHTML = '';
        const ru = parsedData.authors_ru || [];
        const en = parsedData.authors_en || [];
        const kk = parsedData.authors_kk || [];

        ru.forEach((r, i) => {
            const div = document.createElement('div');
            div.style.cssText = 'margin-bottom:8px; padding:8px; background:#f4f4f4; border:1px solid #ddd;';
            div.innerHTML = `<div><b>${i + 1}. ${r.first_name} ${r.last_name}</b></div><button style="width:100%; margin-top:4px; cursor:pointer;">Заполнить сейчас</button>`;
            div.querySelector('button').onclick = () => fillAuthorForm({ ru: r, en: en[i] || {}, kk: kk[i] || {} });
            c.appendChild(div);
        });
    }

    function renderKeywordsHelp() {
        const c = document.getElementById('ojs-keywords-list');
        c.innerHTML = '';
        ['rus', 'kaz', 'eng'].forEach(k => {
            const val = (parsedData['keywords_' + k] || []).join(', ');
            if (!val) return;
            const d = document.createElement('div');
            d.style.marginBottom = '4px';
            d.innerHTML = `<span style="font-weight:bold;font-size:10px;width:30px;display:inline-block;">${k.substr(0, 2).toUpperCase()}</span> <input type="text" value="${val}" style="width:180px;font-size:11px;" readonly> <button>Copy</button>`;
            d.querySelector('button').onclick = () => { d.querySelector('input').select(); document.execCommand('copy'); };
            c.appendChild(d);
        });
    }

    function triggerChange(el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function runDebug() {
        console.log('--- V3 DEBUG ---');
        console.log('TinyMCE Editors:', window.tinyMCE ? window.tinyMCE.editors.length : 'None');
        if (window.tinyMCE) {
            for (let i = 0; i < window.tinyMCE.editors.length; i++) {
                console.log(`Editor[${i}] ID:`, window.tinyMCE.editors[i].id);
            }
        }
        document.querySelectorAll('input').forEach(i => console.log('Input:', i.name, i.id));
        alert('Check Console');
    }

    createUI();
    console.log('OJS Auto-Filler V3.2 Ready');
})();
