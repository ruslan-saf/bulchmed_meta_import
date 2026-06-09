// ==UserScript==
// @name         OJS Auto-Filler (BulChMed)
// @namespace    https://bulchmed.enu.kz/
// @version      4.0
// @description  Автозаполнение метаданных OJS 3.3 для BulChMed
// @author       bulchmed-meta-import
// @match        https://bulchmed.enu.kz/index.php/bulchmed/workflow*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // === КОНФИГУРАЦИЯ ===
    const LOCALE_MAP = {
        'rus': 'ru_RU',
        'kaz': 'kk_KZ',
        'kk':  'kk_KZ',
        'eng': 'en_US'
    };

    const COUNTRY_MAP = {
        'Казахстан':        'Kazakhstan',
        'Kazakhstan':       'Kazakhstan',
        'Қазақстан':        'Kazakhstan',
        'Russian Federation': 'Russia',
        'Российская Федерация': 'Russia',
        'United Kingdom':   'United Kingdom',
        'Великобритания':   'United Kingdom',
        'Azerbaijan':       'Azerbaijan'
    };

    let parsedData = null;
    let isMinimized = false;

    // === UI ===
    function createUI() {
        const id = 'ojs-autofill-panel';
        if (document.getElementById(id)) document.getElementById(id).remove();

        const panel = document.createElement('div');
        panel.id = id;
        panel.style.cssText = `
            position: fixed; top: 10px; left: 10px; width: 360px;
            background: #ffffff; border: 1px solid #ccc;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            z-index: 100000; font-family: sans-serif; font-size: 13px;
            border-radius: 8px; overflow: hidden;
        `;

        panel.innerHTML = `
            <!-- ШАПКА (всегда видна) -->
            <div id="ojs-header" style="
                display:flex; justify-content:space-between; align-items:center;
                background:#007ab2; color:white; padding:8px 12px; cursor:move;
            ">
                <span style="font-weight:bold; font-size:14px;">OJS Auto-Filler v4.0</span>
                <div style="display:flex; gap:6px;">
                    <button id="ojs-debug-btn" title="Debug" style="
                        font-size:11px; padding:2px 7px; border:1px solid rgba(255,255,255,0.4);
                        background:transparent; color:white; cursor:pointer; border-radius:3px;">
                        Debug
                    </button>
                    <button id="ojs-minimize-btn" title="Свернуть/развернуть" style="
                        font-size:14px; padding:2px 8px; border:1px solid rgba(255,255,255,0.4);
                        background:transparent; color:white; cursor:pointer; border-radius:3px; line-height:1;">
                        ▲
                    </button>
                    <button id="ojs-close-btn" title="Закрыть" style="
                        font-size:14px; padding:2px 8px; border:1px solid rgba(255,255,255,0.4);
                        background:transparent; color:white; cursor:pointer; border-radius:3px; line-height:1;">
                        ✕
                    </button>
                </div>
            </div>

            <!-- ТЕЛО (скрывается при сворачивании) -->
            <div id="ojs-body" style="padding:12px; max-height:80vh; overflow-y:auto;">

                <!-- JSON блок -->
                <textarea id="ojs-json-input" placeholder="Вставьте JSON или загрузите файл..." style="
                    width:100%; box-sizing:border-box; height:80px; margin-bottom:8px;
                    border:1px solid #ddd; padding:5px; font-size:12px; resize:vertical;
                "></textarea>

                <div style="display:flex; gap:6px; margin-bottom:8px;">
                    <button id="ojs-parse-btn" style="
                        flex:1; padding:7px; background:#007ab2; color:white;
                        border:none; cursor:pointer; border-radius:4px; font-size:12px;">
                        ▶ Распознать JSON
                    </button>
                    <label id="ojs-load-btn" title="Загрузить JSON из файла" style="
                        padding:7px 10px; background:#6c757d; color:white;
                        border:none; cursor:pointer; border-radius:4px; font-size:12px;
                        display:inline-flex; align-items:center;">
                        📂
                        <input type="file" id="ojs-file-input" accept=".json" style="display:none;">
                    </label>
                    <button id="ojs-clear-btn" title="Очистить JSON" style="
                        padding:7px 10px; background:#dc3545; color:white;
                        border:none; cursor:pointer; border-radius:4px; font-size:12px;">
                        🗑
                    </button>
                </div>

                <!-- Контролы (появляются после парсинга) -->
                <div id="ojs-controls" style="display:none;">
                    <hr style="border:0; border-top:1px solid #eee; margin:8px 0;">
                    <h4 style="margin:4px 0 6px; color:#333;">Метаданные публикации</h4>
                    <button id="ojs-fill-meta" style="
                        width:100%; padding:8px; background:#28a745; color:white;
                        border:none; cursor:pointer; border-radius:4px;">
                        Заполнить Title и Abstract
                    </button>

                    <h4 style="margin:10px 0 5px; color:#333;">Ключевые слова <span style="font-weight:normal;font-size:11px;color:#888;">(нажмите Copy)</span></h4>
                    <div id="ojs-keywords-list" style="margin-bottom:10px;"></div>

                    <hr style="border:0; border-top:1px solid #eee; margin:8px 0;">
                    <h4 style="margin:4px 0 6px; color:#333;">Авторы (Contributors)</h4>
                    <p style="font-size:11px; color:#888; margin:0 0 6px;">Откройте модалку автора, затем нажмите кнопку нужного автора:</p>
                    <div id="ojs-authors-list"></div>
                </div>

            </div>
        `;

        document.body.appendChild(panel);

        // --- Кнопки ---
        document.getElementById('ojs-close-btn').onclick = () => panel.remove();
        document.getElementById('ojs-minimize-btn').onclick = toggleMinimize;
        document.getElementById('ojs-parse-btn').onclick = parseJSON;
        document.getElementById('ojs-fill-meta').onclick = fillMainMetadata;
        document.getElementById('ojs-debug-btn').onclick = runDebug;
        document.getElementById('ojs-clear-btn').onclick = clearJSON;
        document.getElementById('ojs-file-input').onchange = loadJSONFromFile;

        // --- Drag ---
        makeDraggable(panel, document.getElementById('ojs-header'));
    }

    function toggleMinimize() {
        isMinimized = !isMinimized;
        const body = document.getElementById('ojs-body');
        const btn  = document.getElementById('ojs-minimize-btn');
        body.style.display = isMinimized ? 'none' : 'block';
        btn.textContent = isMinimized ? '▼' : '▲';
        btn.title = isMinimized ? 'Развернуть' : 'Свернуть';
    }

    function clearJSON() {
        document.getElementById('ojs-json-input').value = '';
        document.getElementById('ojs-controls').style.display = 'none';
        document.getElementById('ojs-parse-btn').textContent = '▶ Распознать JSON';
        document.getElementById('ojs-file-input').value = '';
        parsedData = null;
    }

    function loadJSONFromFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
            document.getElementById('ojs-json-input').value = ev.target.result;
            parseJSON();
        };
        reader.readAsText(file, 'UTF-8');
    }

    // === Drag ===
    function makeDraggable(panel, handle) {
        let startX, startY, startLeft, startTop;
        handle.addEventListener('mousedown', function (e) {
            if (e.target.tagName === 'BUTTON') return;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            startLeft = rect.left;
            startTop  = rect.top;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            e.preventDefault();
        });
        function onMove(e) {
            panel.style.left = (startLeft + e.clientX - startX) + 'px';
            panel.style.top  = (startTop  + e.clientY - startY) + 'px';
        }
        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }
    }

    // === ЛОГИКА ===

    function findElementV3(type, locale) {
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

        for (let s of selectors) {
            if (s.id) {
                const el = document.getElementById(s.id);
                if (el) return { el, method: s.isTiny ? 'tinymce' : 'value', key: s.id };
                if (s.isTiny && window.tinyMCE && window.tinyMCE.get(s.id))
                    return { el: null, method: 'tinymce-direct', key: s.id };
            }
            if (s.name) {
                const el = document.querySelector(`[name="${s.name}"]`);
                if (el) return { el, method: s.isTiny ? 'tinymce' : 'value', key: s.name };
            }
            if (s.idSuffix) {
                const all = document.querySelectorAll('input, textarea');
                for (let el of all) {
                    if (el.id && el.id.endsWith(s.idSuffix))
                        return { el, method: s.isTiny ? 'tinymce' : 'value', key: el.id };
                }
                if (s.isTiny && window.tinyMCE && window.tinyMCE.editors) {
                    for (let ed of window.tinyMCE.editors) {
                        if (ed.id && ed.id.endsWith(s.idSuffix))
                            return { el: null, method: 'tinymce-direct', key: ed.id };
                    }
                }
            }
        }
        return null;
    }

    function setValue(target, value) {
        if (!target) return false;

        if (target.method === 'tinymce' || target.method === 'tinymce-direct') {
            let ed = window.tinyMCE.get(target.key);
            if (!ed && target.el) {
                for (let e of window.tinyMCE.editors)
                    if (e.getElement() === target.el) { ed = e; break; }
            }
            if (ed) { ed.setContent(value); return true; }
            if (target.el) { target.el.value = value; triggerChange(target.el); return true; }
        } else {
            if (target.el) { target.el.value = value; triggerChange(target.el); return true; }
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
                if (setValue(findElementV3('title', locale), val)) log.push(`✅ Title ${locale}`);
                else log.push(`❌ Title ${locale} not found`);
            }
        });

        ['rus', 'kaz', 'eng'].forEach(lang => {
            const val = parsedData['abstract_' + lang];
            if (val) {
                const locale = LOCALE_MAP[lang];
                if (setValue(findElementV3('abstract', locale), val)) log.push(`✅ Abstract ${locale}`);
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

            let fName = (d.first_name || '').trim();
            if (fName) {
                if (l === 'en') {
                    const low = fName.toLowerCase();
                    const twoLetter = ['zh', 'kh', 'ye', 'sh', 'ch', 'ai', 'ay'];
                    fName = twoLetter.some(p => low.startsWith(p))
                        ? fName.substr(0, 2) + '.'
                        : fName.charAt(0) + '.';
                } else {
                    fName = fName.charAt(0).toUpperCase() + '.';
                }
            }

            if (setValue(findElementV3('givenName',   locale), fName))    log.push(`Name ${locale}`);
            if (setValue(findElementV3('familyName',  locale), d.last_name))  log.push(`Surname ${locale}`);
            if (setValue(findElementV3('affiliation', locale), d.university)) log.push(`Affiliation ${locale}`);
        });

        const ru = authData.ru || {};

        if (ru.email) {
            const el = document.querySelector('input[name="email"]');
            if (el) { el.value = ru.email; triggerChange(el); log.push('Email'); }
        }

        if (ru.orcid) {
            let orcidVal = ru.orcid.trim();
            if (!orcidVal.startsWith('http')) orcidVal = `https://orcid.org/${orcidVal}`;
            const el = document.querySelector('input[name="orcid"]');
            if (el) { el.value = orcidVal; triggerChange(el); log.push('ORCID'); }
        }

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
                if (!found) log.push(`❌ Country not found: ${target}`);
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
        const raw = document.getElementById('ojs-json-input').value.trim();
        if (!raw) { alert('JSON пустой'); return; }
        try {
            parsedData = JSON.parse(raw);
            document.getElementById('ojs-controls').style.display = 'block';
            document.getElementById('ojs-parse-btn').textContent = '✅ JSON принят';
            renderAuthors();
            renderKeywordsHelp();
        } catch (e) {
            alert('Ошибка JSON: ' + e.message);
        }
    }

    function renderAuthors() {
        const c = document.getElementById('ojs-authors-list');
        c.innerHTML = '';
        const ru = parsedData.authors_ru || [];
        const en = parsedData.authors_en || [];
        const kk = parsedData.authors_kk || [];

        ru.forEach((r, i) => {
            const div = document.createElement('div');
            div.style.cssText = 'margin-bottom:6px; padding:7px; background:#f8f9fa; border:1px solid #dee2e6; border-radius:4px;';
            div.innerHTML = `
                <div style="font-weight:bold; font-size:12px; margin-bottom:4px;">${i + 1}. ${r.first_name} ${r.last_name}</div>
                <button style="width:100%; padding:5px; cursor:pointer; background:#17a2b8; color:white; border:none; border-radius:3px; font-size:12px;">
                    Заполнить
                </button>`;
            div.querySelector('button').onclick = () => fillAuthorForm({ ru: r, en: en[i] || {}, kk: kk[i] || {} });
            c.appendChild(div);
        });
    }

    function renderKeywordsHelp() {
        const c = document.getElementById('ojs-keywords-list');
        c.innerHTML = '';
        ['rus', 'kaz', 'eng'].forEach(k => {
            const keywords = parsedData['keywords_' + k] || [];
            if (!keywords.length) return;
            const val = keywords.join(', ');
            const d = document.createElement('div');
            d.style.cssText = 'margin-bottom:5px; display:flex; align-items:center; gap:5px;';
            d.innerHTML = `
                <span style="font-weight:bold; font-size:10px; min-width:28px; color:#555;">${k.substr(0, 2).toUpperCase()}</span>
                <input type="text" value="${val.replace(/"/g, '&quot;')}" style="flex:1; font-size:11px; border:1px solid #ddd; padding:3px;" readonly>
                <button style="padding:3px 7px; font-size:11px; cursor:pointer; white-space:nowrap;">Copy</button>`;
            const input = d.querySelector('input');
            d.querySelector('button').onclick = () => {
                navigator.clipboard ? navigator.clipboard.writeText(val) : (input.select(), document.execCommand('copy'));
                const btn = d.querySelector('button');
                btn.textContent = '✓';
                setTimeout(() => btn.textContent = 'Copy', 1200);
            };
            c.appendChild(d);
        });
    }

    function triggerChange(el) {
        el.dispatchEvent(new Event('input',  { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function runDebug() {
        console.log('--- OJS Auto-Filler DEBUG ---');
        console.log('TinyMCE Editors:', window.tinyMCE ? window.tinyMCE.editors.length : 'None');
        if (window.tinyMCE) {
            window.tinyMCE.editors.forEach((e, i) => console.log(`Editor[${i}] ID:`, e.id));
        }
        document.querySelectorAll('input').forEach(i => console.log('Input:', i.name, i.id));
        alert('Данные выведены в консоль (F12)');
    }

    createUI();
    console.log('OJS Auto-Filler v4.0 Ready');
})();
