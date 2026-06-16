// main.js
// É aqui que o app começa e onde fica o "estado" — um objeto só (state) com o
// que está selecionado. A regra: qualquer botão/clique muda o state e chama
// render(); o render manda o map.js redesenhar tudo a partir daí. Assim os
// gráficos nunca saem de sincronia, porque todos leem do mesmo lugar.

import { initData, renderMap, clearCharts, CRIME_TYPES, setInteractionHandlers } from './map';

// o estado da aplicação
//   metric: tipo de crime no mapa | useRate: false=total, true=taxa/10mil hab
//   aggregation: 'municipio' ou 'regiao' | yearFrom/yearTo: janela de anos
const state = {
    metric: 'Crimes Violentos',
    useRate: true,
    aggregation: 'municipio',
    yearFrom: 2014,
    yearTo: 2025,
};

// manda o mapa (e o resto) redesenhar com o estado atual
async function render() {
    await renderMap(state.metric, state.useRate, state.yearFrom, state.yearTo, state.aggregation);
}

window.onload = async () => {
    const overlay = document.getElementById('loading-overlay');

    // Carrega GeoJSON e inicializa DuckDB com as tabelas crime + população
    const geojson = await fetch('RJ_Municipios_2025.geojson').then(r => r.json());
    await initData(geojson);

    // campo de busca de tipo de crime (no lugar de um <select> comum)
    setupMetricCombo();

    // preenche os selects de ano (2014 a 2025)
    const yearFromSel = document.querySelector('#yearFrom');
    const yearToSel   = document.querySelector('#yearTo');
    for (let y = 2014; y <= 2025; y++) {
        yearFromSel.add(new Option(y, y, y === 2014, y === 2014));
        yearToSel.add(  new Option(y, y, y === 2025, y === 2025));
    }

    // o map.js chama esses callbacks quando clicam numa barra; aqui a gente
    // muda o estado e redesenha (é o que faz o clique no gráfico mexer no mapa)
    setInteractionHandlers({
        // clicou num tipo de crime no gráfico -> vira a métrica do mapa
        onMetricPick: (metric) => {
            if (!CRIME_TYPES.includes(metric) || metric === state.metric) return;
            state.metric = metric;
            const input = document.querySelector('#metricSearch');
            if (input) input.value = metric;       // atualiza o texto da busca
            render();
        },
        // (sobra de uma versão antiga em que o brush mudava o período)
        onPeriodPick: (from, to) => {
            const a = Math.max(2014, Math.min(from, to));
            const b = Math.min(2025, Math.max(from, to));
            if (a === state.yearFrom && b === state.yearTo) return;
            state.yearFrom = a;
            state.yearTo   = b;
            yearFromSel.value = String(a);          // sincroniza os selects
            yearToSel.value   = String(b);
            render();
        },
    });

    // botões da barra de controle
    document.querySelector('#btn-total').addEventListener('click', () => {
        state.useRate = false;
        document.querySelector('#btn-total').classList.add('active');
        document.querySelector('#btn-rate').classList.remove('active');
        render();
    });

    document.querySelector('#btn-rate').addEventListener('click', () => {
        state.useRate = true;
        document.querySelector('#btn-rate').classList.add('active');
        document.querySelector('#btn-total').classList.remove('active');
        render();
    });

    document.querySelector('#btn-municipio').addEventListener('click', () => {
        state.aggregation = 'municipio';
        document.querySelector('#btn-municipio').classList.add('active');
        document.querySelector('#btn-regiao').classList.remove('active');
        render();
    });

    document.querySelector('#btn-regiao').addEventListener('click', () => {
        state.aggregation = 'regiao';
        document.querySelector('#btn-regiao').classList.add('active');
        document.querySelector('#btn-municipio').classList.remove('active');
        render();
    });

    // (a interação da métrica é tratada dentro de setupMetricCombo)

    // Período: garante yearFrom <= yearTo
    yearFromSel.addEventListener('change', () => {
        state.yearFrom = +yearFromSel.value;
        if (state.yearFrom > state.yearTo) {
            state.yearTo = state.yearFrom;
            yearToSel.value = state.yearFrom;
        }
        render();
    });

    yearToSel.addEventListener('change', () => {
        state.yearTo = +yearToSel.value;
        if (state.yearTo < state.yearFrom) {
            state.yearFrom = state.yearTo;
            yearFromSel.value = state.yearTo;
        }
        render();
    });

    document.querySelector('#clearBtn').addEventListener('click', clearCharts);

    // deixa os botões com o visual certo conforme o estado inicial
document.querySelector('#btn-rate')
    .classList.toggle('active', state.useRate);

document.querySelector('#btn-total')
    .classList.toggle('active', !state.useRate);

document.querySelector('#btn-municipio')
    .classList.toggle('active', state.aggregation === 'municipio');

document.querySelector('#btn-regiao')
    .classList.toggle('active', state.aggregation === 'regiao');

    // tira o "carregando" e desenha pela primeira vez
    overlay.classList.add('hidden');

    const mapSvg = document.querySelector('#chart-map');
    await render();

    // redesenha quando a janela muda de tamanho (com um debouncezinho)
    let lastWidth = mapSvg.getBoundingClientRect().width;
    let resizeTimer = null;
    const onResize = () => {
        const w = mapSvg.getBoundingClientRect().width;
        if (w < 50 || Math.abs(w - lastWidth) < 4) return;
        lastWidth = w;
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => render(), 150);
    };
    if (typeof ResizeObserver !== 'undefined') {
        new ResizeObserver(onResize).observe(mapSvg);
    }
    window.addEventListener('resize', onResize);

    // campo de busca de tipo de crime. fica aqui dentro pra enxergar state/render.
    function setupMetricCombo() {
        const combo  = document.querySelector('#metric-combo');
        const input  = document.querySelector('#metricSearch');
        const list   = document.querySelector('#metric-list');
        let activeIdx = -1;   // índice destacado pela navegação por teclado

        input.value = state.metric;

        // (Re)constrói a lista a partir do texto digitado
        function buildList(filter = '') {
            const q = filter.trim().toLowerCase();
            const matches = CRIME_TYPES.filter(m => m.toLowerCase().includes(q));
            list.innerHTML = '';
            activeIdx = -1;

            if (!matches.length) {
                const li = document.createElement('li');
                li.className = 'empty';
                li.textContent = 'Nenhum tipo de crime encontrado';
                list.appendChild(li);
                return;
            }

            matches.forEach(m => {
                const li = document.createElement('li');
                li.textContent = m;
                li.setAttribute('role', 'option');
                if (m === state.metric) li.classList.add('selected');
                // mousedown (não click) para disparar antes do blur do input
                li.addEventListener('mousedown', e => {
                    e.preventDefault();
                    choose(m);
                });
                list.appendChild(li);
            });
        }

        function open()  { list.classList.add('open');  input.setAttribute('aria-expanded', 'true');  }
        function close() { list.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); }

        // Confirma a métrica escolhida e re-renderiza tudo
        function choose(metric) {
            state.metric = metric;
            input.value = metric;
            close();
            render();
        }

        // Move o destaque (setas) e rola para mantê-lo visível
        function moveActive(delta) {
            const items = [...list.querySelectorAll('li:not(.empty)')];
            if (!items.length) return;
            items.forEach(li => li.classList.remove('active'));
            activeIdx = (activeIdx + delta + items.length) % items.length;
            items[activeIdx].classList.add('active');
            items[activeIdx].scrollIntoView({ block: 'nearest' });
        }

        input.addEventListener('focus', () => { buildList(''); open(); input.select(); });
        input.addEventListener('input', () => { buildList(input.value); open(); });

        input.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown')      { e.preventDefault(); open(); moveActive(1); }
            else if (e.key === 'ArrowUp')   { e.preventDefault(); moveActive(-1); }
            else if (e.key === 'Enter')     {
                e.preventDefault();
                const items = [...list.querySelectorAll('li:not(.empty)')];
                if (activeIdx >= 0 && items[activeIdx]) choose(items[activeIdx].textContent);
                else if (items.length === 1)            choose(items[0].textContent);
            }
            else if (e.key === 'Escape')    { close(); input.value = state.metric; input.blur(); }
        });

        // Clicar fora fecha a lista e restaura o texto do tipo vigente
        document.addEventListener('mousedown', e => {
            if (!combo.contains(e.target)) {
                close();
                input.value = state.metric;
            }
        });
    }
};
