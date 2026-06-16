// map.js
// Aqui fica todo o desenho com D3: o mapa, os dois bar charts e as duas
// timelines. As funções principais são renderMap (mapa + orquestra o resto),
// renderTopCrimesChart, renderTopMunChart, renderTimeline e renderTimelineDetail.
// A regra geral: quem guarda o estado é o main.js; este arquivo só desenha e,
// quando o usuário clica/arrasta, avisa o main.js pelos callbacks.

import * as d3 from 'd3';
import { Database } from './database';

// estado de módulo
const db = new Database();
let geojson = null;
let crimeTypeMap = new Map();
export const CRIME_TYPES = [];

// guarda o zoom/pan atual pra não resetar a cada render
let currentTransform = d3.zoomIdentity;
let zoomInitialized = false;

// o que está selecionado no mapa (município ou região), ou null
let selectedScope = null; // { kind, code, name }
let municipalityRegionLookup = new Map(); // fmun_cod -> regiao

// geometria das regiões já com as divisas internas removidas (calculado 1x no init)
let regionGeometryCache = new Map();

// trecho [Date, Date] que o usuário marcou na timeline de cima (pra timeline de baixo)
let detailRange = null;
let hoveredScope = null;

// últimos parâmetros usados no render, pra reaproveitar quando o clique vem de um gráfico
let current = {}

// o main.js registra aqui o que fazer quando clicam numa barra ou métrica
let handlers = { onMetricPick: null, onPeriodPick: null };
export function setInteractionHandlers(h) { handlers = { ...handlers, ...h }; }

// carrega os dados no DuckDB e prepara os lookups. roda uma vez no começo.
export async function initData(geoData) {
    geojson = geoData;
    await db.init();
    await Promise.all([db.loadCrime(), db.loadPopulacao(), db.loadTipoCrime()]);

    const typeRows = await db.query('SELECT variavel, tipo FROM tipo_crime');
    buildCrimeTypeMap(typeRows);

    const regionRows = await db.query('SELECT DISTINCT fmun_cod, regiao FROM crime_rj');
    municipalityRegionLookup = new Map(regionRows.map(({ fmun_cod, regiao }) => [String(fmun_cod), regiao]));

    precomputeRegionGeometries(); // pré-calcula as regiões dissolvidas
}

// Junta os municípios de uma região num polígono só, sem as divisas internas.
// A ideia: como a malha do IBGE é "casadinha", cada divisa interna aparece duas
// vezes (uma em cada município, em sentido contrário). Se a gente cancela essas
// arestas repetidas, sobra só o contorno de fora. Feito na mão, sem topojson.
function ringsOf(feature) {
    const g = feature.geometry;
    if (!g) return [];
    if (g.type === 'Polygon') return g.coordinates;
    if (g.type === 'MultiPolygon') return g.coordinates.flat();
    return [];
}

function dissolveRings(rings) {
    // arredonda o vértice pra string, senão pontos iguais não batem por causa de float
    const K = p => `${Math.round(p[0] * 1e6)},${Math.round(p[1] * 1e6)}`;
    const edges = new Map();

    for (const ring of rings) {
        for (let i = 0; i + 1 < ring.length; i++) {
            const a = ring[i], b = ring[i + 1];
            const ka = K(a), kb = K(b);
            if (ka === kb) continue;
            const rev = `${kb}>${ka}`;
            if (edges.has(rev)) edges.delete(rev);   // já tinha a volta -> divisa interna, tira as duas
            else edges.set(`${ka}>${kb}`, [a, b]);
        }
    }

    // monta um índice "de qual vértice sai cada aresta" pra conseguir costurar os anéis
    const adj = new Map();
    for (const [, seg] of edges) {
        const ka = K(seg[0]);
        if (!adj.has(ka)) adj.set(ka, []);
        adj.get(ka).push(seg);
    }

    const used = new Set();
    const outRings = [];
    for (const [, seg] of edges) {
        const segId = `${K(seg[0])}>${K(seg[1])}`;
        if (used.has(segId)) continue;
        const startK = K(seg[0]);
        const ring = [seg[0]];
        let cur = seg, guard = 0;
        while (cur && guard++ < 2_000_000) {
            used.add(`${K(cur[0])}>${K(cur[1])}`);
            ring.push(cur[1]);
            const nk = K(cur[1]);
            if (nk === startK) break;               // anel fechado
            const cands = (adj.get(nk) || []).filter(s => !used.has(`${K(s[0])}>${K(s[1])}`));
            cur = cands[0] || null;
        }
        if (ring.length >= 4) outRings.push(ring);
    }

    return { type: 'MultiPolygon', coordinates: outRings.map(r => [r]) };
}

function precomputeRegionGeometries() {
    const grouped = new Map();
    geojson.features.forEach(f => {
        const region = municipalityRegionLookup.get(String(f.properties.CD_MUN));
        if (!region) return;
        if (!grouped.has(region)) grouped.set(region, []);
        grouped.get(region).push(f);
    });

    regionGeometryCache = new Map();
    for (const [region, feats] of grouped) {
        const dissolved = dissolveRings(feats.flatMap(ringsOf));
        // se por algum motivo não sair nenhum anel, usa os polígonos sem dissolver
        regionGeometryCache.set(
            region,
            dissolved.coordinates.length ? dissolved : buildRegionGeometryRaw(feats)
        );
    }
}

// monta o mapa "tipo de crime -> colunas que somam aquele tipo", na ordem que
// queremos exibir, e preenche CRIME_TYPES com os tipos que existem nos dados
function buildCrimeTypeMap(rows) {
    const grouped = new Map();
    rows.forEach(({ variavel, tipo }) => {
        if (!grouped.has(tipo)) grouped.set(tipo, []);
        grouped.get(tipo).push(variavel);
    });

    const orderedLabels = [
        'Crimes Violentos',
        'Crimes de Trânsito',
        'Roubos',
        'Furtos',
        'Extorsão e Estelionato',
        'Drogas'
    ];

    crimeTypeMap = new Map();
    const labels = orderedLabels.filter(label => grouped.has(label));
    labels.forEach(label => crimeTypeMap.set(label, grouped.get(label)));

    CRIME_TYPES.splice(0, CRIME_TYPES.length, ...labels);
}

function buildCrimeTypeSumExpr(typeLabel, alias = 'c') {
    const columns = crimeTypeMap.get(typeLabel) ?? [];
    if (!columns.length) return '0';
    return columns.map(col => `COALESCE(${alias}.${col}, 0)`).join(' + ');
}

// atalho pra não escrever db.query toda hora
async function q(sql) {
    return db.query(sql);
}

function convexHull(points) {
    const cleaned = points
        .map(([x, y]) => [x, y])
        .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

    if (cleaned.length < 3) {
        return {
            type: 'Polygon',
            coordinates: [cleaned.length ? [cleaned[0], cleaned[0]] : []]
        };
    }

    const sorted = [...cleaned].sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
    const lower = [];
    for (const point of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
            lower.pop();
        }
        lower.push(point);
    }

    const upper = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
        const point = sorted[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
            upper.pop();
        }
        upper.push(point);
    }

    const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
    if (hull.length < 3) return { type: 'Polygon', coordinates: [[...hull, hull[0]]] };

    return {
        type: 'Polygon',
        coordinates: [[...hull, hull[0]]]
    };
}

function cross(a, b, c) {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

// plano B: só junta os polígonos da região sem tirar as divisas (se o dissolve falhar)
function buildRegionGeometryRaw(regionFeatures) {
    const polygons = regionFeatures.flatMap(feature => {
        const geometry = feature.geometry;
        if (!geometry) return [];
        if (geometry.type === 'Polygon') return [geometry.coordinates];
        if (geometry.type === 'MultiPolygon') return geometry.coordinates;
        return [];
    });

    if (polygons.length) {
        return { type: 'MultiPolygon', coordinates: polygons };
    }

    const points = regionFeatures.map(feature => d3.geoCentroid(feature));
    return convexHull(points);
}

function buildMapFeatures(features, aggregation) {
    if (aggregation !== 'regiao') return features;

    const grouped = new Map();
    features.forEach(feature => {
        const region = municipalityRegionLookup.get(String(feature.properties.CD_MUN));
        if (!region) return;
        if (!grouped.has(region)) grouped.set(region, []);
        grouped.get(region).push(feature);
    });

    return Array.from(grouped.entries()).map(([region, regionFeatures]) => ({
        type: 'Feature',
        properties: {
            CD_MUN: region,
            NM_MUN: region,
            region
        },
        geometry: regionGeometryCache.get(region) ?? buildRegionGeometryRaw(regionFeatures)
    }));
}

// desenha o mapa e, no fim, manda redesenhar os gráficos da direita
export async function renderMap(metric, useRate, yearFrom, yearTo, aggregation = 'municipio') {
    const svg = d3.select('#chart-map');

    svg.on('click', () => clearSelection());

    if (svg.empty() || !geojson) return;

    // se trocou município <-> região, a seleção antiga não faz mais sentido.
    // limpa tudo pra não deixar o bar chart de cima com dado de outro modo.
    if (current.aggregation && current.aggregation !== aggregation) {
    selectedScope = null;
    detailRange = null;

    currentTransform = d3.zoomIdentity;

    d3.select('#chart-timeline').selectAll('*').remove();
    d3.select('#chart-timeline-detail').selectAll('*').remove();
}

    // guarda os parâmetros pra quando o clique numa barra precisar redesenhar
    current = { metric, useRate, yearFrom, yearTo, aggregation };

    const mg = { left: 5, right: 5, top: 54, bottom: 5 }; // top sobra pro título

    // pega a largura/altura do SVG. às vezes no 1º render o CSS ainda não
    // resolveu a largura (fica ~0), então tem uns fallbacks pra não nascer em branco.
    const node = svg.node();
    let rawW = node.getBoundingClientRect().width;
    if (rawW < 50 && node.parentNode) rawW = node.parentNode.getBoundingClientRect().width;
    if (rawW < 50) rawW = 800;
    let rawH = node.getBoundingClientRect().height;
    if (rawH < 50) rawH = 560;

    const W = rawW - mg.left - mg.right;
    const H = rawH - mg.top  - mg.bottom;

    // soma os crimes por local no período. no modo taxa, faz a média das
    // taxas de cada ano (mais correto que somar tudo e dividir por uma pop. só).
    let rows;
    const crimeExpr = buildCrimeTypeSumExpr(metric, 'c');
    if (aggregation === 'regiao') {
        if (!useRate) {
            rows = await q(`
                SELECT c.regiao AS region, SUM(${crimeExpr}) AS value
                FROM crime_rj c
                WHERE c.ano >= ${yearFrom} AND c.ano <= ${yearTo}
                GROUP BY c.regiao
            `);
        } else {
            rows = await q(`
                SELECT region, AVG(year_rate) AS value
                FROM (
                    SELECT c.regiao AS region, c.ano,
                           SUM(${crimeExpr}) * 10000.0 / NULLIF(SUM(p.populacao), 0) AS year_rate
                    FROM crime_rj c
                    LEFT JOIN (
                        SELECT fmun_cod, ano, MAX(populacao) AS populacao
                        FROM populacao_rj
                        GROUP BY fmun_cod, ano
                    ) p ON c.fmun_cod = p.fmun_cod AND c.ano = p.ano
                    WHERE c.ano >= ${yearFrom} AND c.ano <= ${yearTo}
                    GROUP BY c.regiao, c.ano
                ) sub
                GROUP BY region
            `);
        }
    } else {
        if (!useRate) {
            rows = await q(`
                SELECT c.fmun_cod, SUM(${crimeExpr}) AS value
                FROM crime_rj c
                WHERE c.ano >= ${yearFrom} AND c.ano <= ${yearTo}
                GROUP BY c.fmun_cod
            `);
        } else {
            rows = await q(`
                SELECT fmun_cod, AVG(year_rate) AS value
                FROM (
                    SELECT c.fmun_cod, c.ano,
                           SUM(${crimeExpr}) * 10000.0 / NULLIF(MAX(p.populacao), 0) AS year_rate
                    FROM crime_rj c
                    LEFT JOIN populacao_rj p ON c.fmun_cod = p.fmun_cod AND c.ano = p.ano
                    WHERE c.ano >= ${yearFrom} AND c.ano <= ${yearTo}
                    GROUP BY c.fmun_cod, c.ano
                ) sub
                GROUP BY fmun_cod
            `);
        }
    }

    // Índice código→valor (Map) para lookup O(1) ao colorir cada polígono,
    // evitando varrer o array de linhas a cada município desenhado.
    const lookup = new Map();
    if (aggregation === 'regiao') {
        const regionValueMap = new Map(rows.map(d => [String(d.region), +d.value]));
        geojson.features.forEach(feature => {
            const code = String(feature.properties.CD_MUN);
            const region = municipalityRegionLookup.get(code);
            lookup.set(code, region ? regionValueMap.get(region) ?? 0 : 0);
        });
        regionValueMap.forEach((value, region) => lookup.set(region, value));
    } else {
        rows.forEach(d => lookup.set(String(d.fmun_cod), +d.value));
    }

    // cor por quantil (não linear): joga mais ou menos a mesma quantidade de
    // locais em cada uma das 7 faixas de vermelho. usamos quantil porque a
    // capital tem valores absurdos e numa escala linear o mapa ficaria quase todo claro.
    const colorScale = d3.scaleQuantile()
        .domain(rows.map(d => +d.value).filter(v => v > 0))
        .range(d3.schemeReds[7]);

    // Mercator + fitExtent pra encaixar o RJ todo na área disponível
    const projection = d3.geoMercator().fitExtent([[0, 0], [W, H]], geojson);
    const pathGen = d3.geoPath().projection(projection);

    // o <g> que segura os paths; data([0]) é truque pra criar uma vez só
    const g = svg.selectAll('#map-group').data([0]).join('g')
        .attr('id', 'map-group')
        .attr('transform', `translate(${mg.left},${mg.top})`);

    const tip = d3.select('body').selectAll('#tooltip').data([0]).join('div')
        .attr('id', 'tooltip')
        .style('position', 'absolute').style('display', 'none')
        .style('background', '#fff').style('border', '1px solid #bbb')
        .style('border-radius', '5px').style('padding', '6px 11px')
        .style('font-size', '13px').style('pointer-events', 'none')
        .style('box-shadow', '0 2px 8px rgba(0,0,0,0.14)');

    const mapFeatures = buildMapFeatures(geojson.features, aggregation);

    // um path por local. a chave no data() inclui o modo de agregação pra
    // forçar a troca quando alterna município/região (geometrias diferentes).
    g.selectAll('path')
    .data(
        mapFeatures,
        d => `${aggregation}-${String(d.properties.CD_MUN)}`
    )
    .join('path')
        .attr('d', pathGen)
        .style('fill', d => {                            // cor a partir do valor
            const key = aggregation === 'regiao'
    ? d.properties.NM_MUN
    : String(d.properties.CD_MUN);
            const val = lookup.get(key) ?? 0;
            return val > 0 ? colorScale(val) : '#f0f0f0'; // cinza = sem dado/zero
        })
        .style('stroke', '#fff').style('stroke-width', '0.5')
        .on('mouseover', (event, d) => {
    const key = aggregation === 'regiao'
    ? d.properties.NM_MUN
    : String(d.properties.CD_MUN);
    const val = lookup.get(key) ?? 0;
    const region = aggregation === 'regiao'
        ? d.properties.NM_MUN
        : municipalityRegionLookup.get(key);

    tip.style('display', 'block').html(
        `<strong>${d.properties.NM_MUN}</strong><br>` +
        `${aggregation === 'regiao' ? `Região: ${region ?? '—'}<br>` : ''}` +
        `${metric}: ${val.toLocaleString('pt-BR', {
            maximumFractionDigits: 2
        })}` +
        (useRate ? ' / 10k hab.' : '')
    );

    hoveredScope = key;
    applyMapHighlight(g);
})
        .on('mousemove', event => {
            tip.style('left', `${event.pageX + 14}px`).style('top', `${event.pageY + 14}px`);
        })
        .on('mouseout', () => {
    tip.style('display', 'none');

    hoveredScope = null;
    applyMapHighlight(g);
})
        // clicar seleciona o local (e abre os detalhes); clicar de novo tira a seleção
        .on('click', async function(event, d) {
    event.stopPropagation();
    event.preventDefault();

    await selectScope(
        String(d.properties.CD_MUN),
        d.properties.NM_MUN,
        aggregation
    );
});

    // zoom/pan só nos paths (a legenda e o título ficam parados).
    // registra o comportamento uma vez só e guarda o transform em currentTransform.
    if (!zoomInitialized) {
    const zoomBehavior = d3.zoom()
        .scaleExtent([1, 8])
        .on('zoom', ({ transform }) => {
            currentTransform = transform;

            d3.select('#map-group')
                .attr(
                    'transform',
                    `translate(${mg.left},${mg.top}) ${transform}`
                );
        });

    svg.call(zoomBehavior);
    svg.on('dblclick.zoom', null);
    zoomInitialized = true;
}

g.attr(
    'transform',
    `translate(${mg.left},${mg.top}) ${currentTransform}`
);

applyMapHighlight(g);
renderMapTitle(svg, metric, useRate, yearFrom, yearTo, aggregation);
renderLegend(svg, colorScale, mg);
await renderLinkedViews(metric, useRate, yearFrom, yearTo, aggregation);
}

// seleciona (ou tira a seleção, se clicar de novo no mesmo) e redesenha os
// gráficos. usada tanto pelo clique no mapa quanto pelo clique numa barra do Top 5.
async function selectScope(code, name, aggregation) {
    hoveredScope = null;
    const normalizedCode = String(code);
    const selectedKind = aggregation === 'regiao' ? 'regiao' : 'municipio';
    const isSame = selectedScope?.kind === selectedKind && selectedScope?.code === normalizedCode;
    selectedScope = isSame ? null : { kind: selectedKind, code: normalizedCode, name };

    detailRange = null; // seleção nova zera o trecho marcado na timeline

    applyMapHighlight(d3.select('#map-group'));

    if (!selectedScope) {
        d3.select('#chart-timeline').selectAll('*').remove();
        d3.select('#chart-timeline-detail').selectAll('*').remove();
    }
    await renderLinkedViews(current.metric, current.useRate, current.yearFrom, current.yearTo, current.aggregation);
}

async function clearSelection() {
    if (!selectedScope) return;

    hoveredScope = null;
    selectedScope = null;
    detailRange = null;

    applyMapHighlight(d3.select('#map-group'));

    d3.select('#chart-timeline').selectAll('*').remove();
    d3.select('#chart-timeline-detail').selectAll('*').remove();

    await renderLinkedViews(
        current.metric,
        current.useRate,
        current.yearFrom,
        current.yearTo,
        current.aggregation
    );
}

function isFeatureSelected(d) {
    if (!selectedScope) return false;
    const code = String(d.properties.CD_MUN);
    if (selectedScope.kind === 'municipio') return selectedScope.code === code;
    return d.properties.region === selectedScope.code ||
       String(d.properties.CD_MUN) === selectedScope.code;
}

function applyMapHighlight(g) {
    g.selectAll('path').each(function(d) {
        const key = current.aggregation === 'regiao'
    ? d.properties.NM_MUN
    : String(d.properties.CD_MUN);
        const isSelected = isFeatureSelected(d);
        const isHovered = key === hoveredScope;

        const sel = d3.select(this)
            .style('opacity',
                selectedScope && !isSelected ? 0.5 : 1
            )
            .style('stroke',
                (isSelected || isHovered) ? '#000' : '#fff'
            )
            .style('stroke-width',
                isSelected ? 2 :
                isHovered ? 1.5 :
                0.5
            );
    });
}

// título em cima do mapa: tipo de crime + modo + período, pro usuário não
// precisar olhar os controles pra saber o que está vendo
function renderMapTitle(svg, metric, useRate, yearFrom, yearTo, aggregation) {
    svg.selectAll('#map-title').remove();
    const W = +svg.node().getBoundingClientRect().width;
    const periodo = yearFrom === yearTo ? `${yearFrom}` : `${yearFrom}–${yearTo}`;
    const modo = useRate ? 'Taxa por 10 mil hab.' : 'Total acumulado';

    const t = svg.append('g').attr('id', 'map-title');
    t.append('text')
        .attr('x', W / 2).attr('y', 26)
        .attr('text-anchor', 'middle')
        .attr('font-size', '15px').attr('font-weight', '700')
        .attr('fill', '#1f4e79')
        .text(`${metric} · ${aggregation === 'regiao' ? 'Região' : 'Município'}`);
    t.append('text')
        .attr('x', W / 2).attr('y', 44)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px').attr('fill', '#777')
        .text(`${modo} · ${periodo}`);
}

// legenda: os 7 quadradinhos de cor com as faixas de valor
function renderLegend(svg, colorScale, mg) {
    svg.selectAll('#legend').remove();
    const quantiles = colorScale.quantiles();
    const colors = d3.schemeReds[7];
    const bSize = 13, gap = 3;

    const lg = svg.append('g').attr('id', 'legend')
        .attr('transform', `translate(${mg.left + 8},${mg.top + 8})`);

    colors.forEach((color, i) => {
        lg.append('rect')
            .attr('x', 0).attr('y', i * (bSize + gap))
            .attr('width', bSize).attr('height', bSize)
            .attr('fill', color).attr('rx', 2);
        const lo = i === 0 ? 0 : quantiles[i - 1];
        const hi = quantiles[i];
        lg.append('text')
            .attr('x', bSize + 5).attr('y', i * (bSize + gap) + bSize - 2)
            .attr('font-size', '9px').attr('fill', '#333')
            .text(hi != null ? `${fmt(lo)} – ${fmt(hi)}` : `> ${fmt(lo)}`);
    });
}

const fmt = n => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

// redesenha os 3 gráficos da direita/baixo a partir do estado atual
async function renderLinkedViews(metric, useRate, yearFrom, yearTo, aggregation) {
    const code = selectedScope?.code ?? null;
    const name = selectedScope?.name ?? null;

    await renderTopCrimesChart(code, name, useRate, yearFrom, yearTo, aggregation);
    await renderTopMunChart(metric, useRate, yearFrom, yearTo, aggregation);

    await renderTimeline(
    code,
    name ?? 'Estado do RJ',
    metric,
    useRate,
    yearFrom,
    yearTo,
    aggregation
);
}

// bar chart com os 6 tipos de crime do local selecionado (ou do estado todo)
async function renderTopCrimesChart(code, name, useRate, yearFrom, yearTo, aggregation) {
    const scopeFilter = !code
    ? '1=1'
    : aggregation === 'regiao'
        ? `c.regiao = '${code}'`
        : `CAST(c.fmun_cod AS VARCHAR) = '${code}'`;
    
    const parts = CRIME_TYPES.map(typeLabel => {
        const expr = buildCrimeTypeSumExpr(typeLabel, 'c');
        if (!useRate) return `
            SELECT '${typeLabel}' AS crime_type, SUM(${expr}) AS value
            FROM crime_rj c
            WHERE ${scopeFilter}
  AND c.ano >= ${yearFrom}
  AND c.ano <= ${yearTo}
        `;
        return `
    SELECT '${typeLabel}' AS crime_type, AVG(yr) AS value
    FROM (
        SELECT c.ano,
               SUM(${expr}) * 10000.0 / NULLIF(MAX(p.populacao), 0) AS yr
        FROM crime_rj c
        LEFT JOIN populacao_rj p
            ON c.fmun_cod = p.fmun_cod
           AND c.ano = p.ano
        WHERE ${scopeFilter}
          AND c.ano >= ${yearFrom}
          AND c.ano <= ${yearTo}
        GROUP BY c.ano
    ) sub
`;
    });

    const rows = await q(`
        SELECT crime_type, value FROM (${parts.join(' UNION ALL ')}) sub
        ORDER BY value DESC
    `);

    drawBarChart(
    '#chart-sidebar',
    rows.map(d => ({ label: d.crime_type, val: +d.value })),
    `Tipos de crime − ${name ?? 'Estado do RJ'}`,
    useRate ? 'Taxa / 10k hab.' : 'Total',
    '#2c6fad',
    {
        hint: 'clique em um tipo para mapeá-lo',
        onBarClick: d => handlers.onMetricPick?.(d.label),
    }
);
}

// bar chart com os 5 locais que mais têm o tipo de crime selecionado
async function renderTopMunChart(metric, useRate, yearFrom, yearTo, aggregation) {
    const crimeExpr = buildCrimeTypeSumExpr(metric, 'c');
    let rows;
    if (aggregation === 'regiao') {
        if (!useRate) {
            rows = await q(`
                SELECT c.regiao AS label, c.regiao AS code, SUM(${crimeExpr}) AS value
                FROM crime_rj c
                WHERE c.ano >= ${yearFrom} AND c.ano <= ${yearTo}
                GROUP BY c.regiao
                ORDER BY value DESC LIMIT 5
            `);
        } else {
            rows = await q(`
                SELECT region AS label, region AS code, AVG(year_rate) AS value
                FROM (
                    SELECT c.regiao AS region, c.ano,
                           SUM(${crimeExpr}) * 10000.0 / NULLIF(SUM(p.populacao), 0) AS year_rate
                    FROM crime_rj c
                    LEFT JOIN (
                        SELECT fmun_cod, ano, MAX(populacao) AS populacao
                        FROM populacao_rj
                        GROUP BY fmun_cod, ano
                    ) p ON c.fmun_cod = p.fmun_cod AND c.ano = p.ano
                    WHERE c.ano >= ${yearFrom} AND c.ano <= ${yearTo}
                    GROUP BY c.regiao, c.ano
                ) sub
                GROUP BY region
                ORDER BY value DESC LIMIT 5
            `);
        }
    } else {
        const scopeFilter =
    selectedScope?.kind === 'regiao' && selectedScope?.code
        ? `c.regiao = '${selectedScope.code}'`
        : '1=1';
        if (!useRate) {
            rows = await q(`
                SELECT c.fmun_cod, c.fmun, SUM(${crimeExpr}) AS value
                FROM crime_rj c
                WHERE ${scopeFilter}
  AND c.ano >= ${yearFrom}
  AND c.ano <= ${yearTo}
                GROUP BY c.fmun_cod, c.fmun
                ORDER BY value DESC LIMIT 5
            `);
        } else {
            rows = await q(`
                SELECT fmun_cod, fmun, AVG(year_rate) AS value
                FROM (
                    SELECT c.fmun_cod, c.fmun, c.ano,
                           SUM(${crimeExpr}) * 10000.0 / NULLIF(MAX(p.populacao), 0) AS year_rate
                    FROM crime_rj c
                    LEFT JOIN populacao_rj p ON c.fmun_cod = p.fmun_cod AND c.ano = p.ano
                    WHERE ${scopeFilter}
  AND c.ano >= ${yearFrom}
  AND c.ano <= ${yearTo}
                    GROUP BY c.fmun_cod, c.fmun, c.ano
                ) sub
                GROUP BY fmun_cod, fmun
                ORDER BY value DESC LIMIT 5
            `);
        }
    }

    drawBarChart(
        '#chart-top-mun',
        rows.map(d => ({
            label: aggregation === 'regiao' ? d.label : d.fmun,
            code: String(aggregation === 'regiao' ? d.code : d.fmun_cod),
            val: +d.value
        })),
        aggregation === 'regiao' ? `Top 5 regiões − ${metric}` : `Top 5 municípios − ${metric}`,
        useRate ? 'Taxa / 10k hab.' : 'Total',
        '#5a8fc9',
        {
            hint: aggregation === 'regiao' ? 'clique em uma região para selecioná-la' : 'clique em um município para selecioná-lo',
            // clicar na barra seleciona aquele local no mapa
            onBarClick: d => selectScope(d.code, d.label, aggregation),
        }
    );
}

// função genérica de bar chart, usada pelos dois gráficos de cima.
// opts.onBarClick deixa as barras clicáveis; opts.hint põe uma dica embaixo do título.
function drawBarChart(selector, data, title, yLabel, color, opts = {}) {
    const { onBarClick = null, hint = null } = opts;
    const svg = d3.select(selector);
    if (svg.empty()) return;
    svg.selectAll('*').remove();

    const chartData = (Array.isArray(data) ? data : [])
        .filter(Boolean)
        .map(d => ({
            ...d,
            label: String(d.label ?? ''),
            val: Number(d.val)
        }))
        .filter(d => d.label && Number.isFinite(d.val));

    const m = { left: 78, right: 18, top: 36, bottom: 90 };
    const W  = +svg.node().getBoundingClientRect().width;
    const H  = +svg.node().getBoundingClientRect().height;
    const iW = W - m.left - m.right;
    const iH = H - m.top  - m.bottom;

    if (!chartData.length) {
        svg.append('text')
            .attr('x', W / 2).attr('y', H / 2)
            .attr('text-anchor', 'middle')
            .attr('font-size', '11px')
            .attr('fill', '#888')
            .text('Sem dados para exibir');
        return;
    }

    svg.append('text').attr('x', W / 2).attr('y', 19)
        .attr('text-anchor', 'middle').attr('font-size', '13px').attr('font-weight', '700')
        .attr('fill', '#1f4e79')
        .text(title);

    if (hint) {
        svg.append('text').attr('x', W / 2).attr('y', 32)
            .attr('text-anchor', 'middle').attr('font-size', '9px')
            .attr('fill', '#999').attr('font-style', 'italic')
            .text(hint);
    }

    // x: uma barra por categoria. y: valor -> altura (começa no 0, com 12% de
    // folga em cima pro rótulo). y vai de iH a 0 porque no SVG o y cresce pra baixo.
    const x = d3.scaleBand().domain(chartData.map(d => d.label)).range([0, iW]).padding(0.22);
    const maxValue = d3.max(chartData, d => d.val) ?? 0;
    const y = d3.scaleLinear()
        .domain([0, maxValue > 0 ? maxValue * 1.12 : 1])
        .nice()
        .range([iH, 0]);

    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

    const tip = d3.select('body').select('#tooltip'); // reusa o tooltip do mapa

    // um retângulo por barra
    g.selectAll('rect').data(chartData).join('rect')
        .attr('fill', color).attr('rx', 2)
        .attr('x', d => x(d.label)).attr('width', x.bandwidth())
        .attr('y', d => y(d.val)).attr('height', d => iH - y(d.val))
        .style('cursor', onBarClick ? 'pointer' : 'default')
        // hover escurece a barra e mostra o valor
        .on('mouseover', function (event, d) {
            d3.select(this).attr('fill', d3.color(color).darker(0.6));
            if (!tip.empty()) tip.style('display', 'block').html(
                `<strong>${d.label}</strong><br>` +
                `${d.val.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}` +
                `${yLabel.includes('Taxa') ? ' / 10k hab.' : ''}`
            );
        })
        .on('mousemove', event => {
            if (!tip.empty()) tip.style('left', `${event.pageX + 14}px`)
                                  .style('top', `${event.pageY + 14}px`);
        })
        .on('mouseout', function () {
    d3.select(this).attr('fill', color);

    if (!tip.empty()) {
        tip.style('display', 'none');
    }
})
        .on('click', (event, d) => { if (onBarClick) onBarClick(d); });

    g.selectAll('.lbl').data(chartData).join('text').attr('class', 'lbl')
        .attr('x', d => x(d.label) + x.bandwidth() / 2)
        .attr('y', d => y(d.val) - 4)
        .attr('text-anchor', 'middle').attr('font-size', '9px')
        .text(d => d.val.toLocaleString('pt-BR', { maximumFractionDigits: 1 }));

    svg.append('g').attr('transform', `translate(${m.left},${H - m.bottom})`)
        .call(d3.axisBottom(x))
        .selectAll('text')
        .attr('font-size', '9px').attr('text-anchor', 'end')
        .attr('transform', 'rotate(-35)').attr('dx', '-0.4em').attr('dy', '0.2em');

    svg.append('g').attr('transform', `translate(${m.left},${m.top})`)
        .call(d3.axisLeft(y).ticks(4)
            .tickFormat(v => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })));

    svg.append('text')
    .attr('transform', `translate(18,${m.top + iH / 2}) rotate(-90)`)
    .attr('text-anchor', 'middle')
    .attr('font-size', '13px')
    .attr('font-weight', 'bold')
    .text(yLabel);
}

// timeline de cima (contexto): a série mês a mês do período inteiro
async function renderTimeline(code, name, metric, useRate, yearFrom, yearTo, aggregation) {
    const container = document.getElementById('timeline-container');
    if (container) container.style.display = 'block';

    const svg = d3.select('#chart-timeline');
    if (svg.empty()) return;
    svg.selectAll('*').remove();

    const crimeExpr = buildCrimeTypeSumExpr(metric, 'c');
    
    const scopeFilter = !code
    ? '1=1'
    : aggregation === 'regiao'
        ? `c.regiao = '${code}'`
        : `CAST(c.fmun_cod AS VARCHAR) = '${code}'`;
    
    let rows;
    if (!useRate) {
        rows = await q(`
            SELECT c.ano, c.mes, SUM(${crimeExpr}) AS value
            FROM crime_rj c
            WHERE ${scopeFilter}
  AND c.ano >= ${yearFrom}
  AND c.ano <= ${yearTo}
            GROUP BY c.ano, c.mes ORDER BY c.ano, c.mes
        `);
    } else {
        rows = await q(`
            SELECT c.ano, c.mes,
                   SUM(${crimeExpr}) * 10000.0 / NULLIF(MAX(p.populacao), 0) AS value
            FROM crime_rj c
            LEFT JOIN populacao_rj p ON c.fmun_cod = p.fmun_cod AND c.ano = p.ano
            WHERE ${scopeFilter}
              AND c.ano >= ${yearFrom} AND c.ano <= ${yearTo}
            GROUP BY c.ano, c.mes ORDER BY c.ano, c.mes
        `);
    }

    if (!rows.length) return;

    const m = { left: 58, right: 24, top: 36, bottom: 36 };
    const W  = +svg.node().getBoundingClientRect().width;
    const H  = +svg.node().getBoundingClientRect().height;
    const iW = W - m.left - m.right;
    const iH = H - m.top  - m.bottom;

    // Number() porque o DuckDB às vezes devolve BigInt em ano/mes
    const parsed = rows.map(d => ({
        date: new Date(Number(d.ano), Number(d.mes) - 1, 1),
        val: +d.value
    }));

    // x = tempo, y = valor
    const x = d3.scaleTime().domain(d3.extent(parsed, d => d.date)).range([0, iW]);
    const y = d3.scaleLinear().domain([0, d3.max(parsed, d => d.val) ?? 1]).nice().range([iH, 0]);

    svg.append('text').attr('x', W / 2).attr('y', 19)
        .attr('text-anchor', 'middle').attr('font-size', '13px').attr('font-weight', '700')
        .attr('fill', '#1f4e79')
.text(`${metric} — ${name} (série histórica mensal)`);

    svg.append('text').attr('x', W / 2).attr('y', 32)
        .attr('text-anchor', 'middle').attr('font-size', '9px')
        .attr('fill', '#999').attr('font-style', 'italic')
        .text('arraste na horizontal para filtrar o período · clique fora para limpar');

    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

    // área clarinha embaixo da linha só pra dar peso visual
    g.append('path').datum(parsed)
        .attr('fill', '#2c6fad').attr('fill-opacity', 0.12)
        .attr('d', d3.area().x(d => x(d.date)).y0(iH).y1(d => y(d.val)).curve(d3.curveMonotoneX));

    g.append('path').datum(parsed)
        .attr('fill', 'none').attr('stroke', '#2c6fad').attr('stroke-width', 1.8)
        .attr('d', d3.line().x(d => x(d.date)).y(d => y(d.val)).curve(d3.curveMonotoneX));

    // o brush daqui é o "context": o trecho que o usuário arrasta vai pro
    // gráfico de baixo (o "focus"), mês a mês. atualizo já no 'brush' (e não só
    // no 'end') pra timeline de baixo acompanhar ao vivo — é barato porque só
    // filtra o array em memória, sem ir no banco de novo.
    const onBrush = (event) => {
        if (!event.sourceEvent) return;            // ignora quando eu mesmo movo o brush
        if (!event.selection) {                    // clicou sem arrastar -> limpa
            detailRange = null;
            renderTimelineDetail(parsed, metric, useRate, name, aggregation);
            return;
        }
        const [x0, x1] = event.selection.map(x.invert);
        detailRange = [x0, x1];
        renderTimelineDetail(parsed, metric, useRate, name, aggregation);
    };
    const brush = d3.brushX()
        .extent([[0, 0], [iW, iH]])
        .on('brush end', onBrush);
    const brushG = g.append('g').attr('class', 'time-brush').call(brush);
    // se já tinha um trecho marcado, redesenha a faixa cinza no lugar
    if (detailRange) {
        const px = detailRange.map(d => Math.max(0, Math.min(iW, x(d))));
        if (px[1] - px[0] > 1) brushG.call(brush.move, px);
    }

    // Pontos mensais — apenas visuais (pointer-events: none) para NÃO interceptar
    // o arraste do brush. A leitura de valores mês a mês fica no gráfico de
    // detalhe abaixo, cujos pontos têm tooltip. Isso resolve o "não consigo puxar".
    g.selectAll('circle.pt').data(parsed).join('circle')
        .attr('class', 'pt')
        .attr('cx', d => x(d.date)).attr('cy', d => y(d.val))
        .attr('r', 2).attr('fill', '#2c6fad')
        .style('pointer-events', 'none');

    svg.append('g').attr('transform', `translate(${m.left},${m.top + iH})`)
        .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat('%Y')))
        .selectAll('text').attr('font-size', '10px');

    svg.append('g').attr('transform', `translate(${m.left},${m.top})`)
        .call(d3.axisLeft(y).ticks(4)
            .tickFormat(v => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })));

    svg.append('text')
        .attr('transform', `translate(14,${m.top + iH / 2}) rotate(-90)`)
        .attr('text-anchor', 'middle').attr('font-size', '13px')
        .attr('font-weight', 'bold')
        .text(useRate ? 'Taxa / 10k' : 'Total');

    // desenha a timeline de baixo (ou a dica, se ainda não marcou nada)
    renderTimelineDetail(parsed, metric, useRate, name, aggregation);
}

// timeline de baixo (focus): mostra só o trecho marcado em cima, com os meses
// no eixo. recebe a série inteira e filtra pelo detailRange.
const MESES_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const fmtMesAno = d => `${MESES_ABBR[d.getMonth()]}/${d.getFullYear()}`;

function renderTimelineDetail(parsed, metric, useRate, name, aggregation) {
    const svg = d3.select('#chart-timeline-detail');
    if (svg.empty()) return;
    svg.selectAll('*').remove();

    const W = +svg.node().getBoundingClientRect().width;
    const H = +svg.node().getBoundingClientRect().height;

    // ninguém marcou nada ainda -> mostra a dica
    if (!detailRange) {
        svg.append('text').attr('x', W / 2).attr('y', 19)
            .attr('text-anchor', 'middle').attr('font-size', '13px').attr('font-weight', '700')
            .attr('fill', '#1f4e79').text('Detalhe mensal');
        svg.append('text').attr('x', W / 2).attr('y', H / 2 + 4)
            .attr('text-anchor', 'middle').attr('font-size', '12px').attr('fill', '#999')
            .text('Arraste um trecho na linha de cima para vê-lo mês a mês aqui.');
        return;
    }

    // pega só os meses dentro do trecho (ordena as pontas por garantia)
    const [d0, d1] = detailRange[0] <= detailRange[1] ? detailRange : [detailRange[1], detailRange[0]];
    const sub = parsed.filter(d => d.date >= d0 && d.date <= d1);

    if (sub.length === 0) {
        svg.append('text').attr('x', W / 2).attr('y', H / 2)
            .attr('text-anchor', 'middle').attr('font-size', '12px').attr('fill', '#999')
            .text('Sem meses no trecho selecionado.');
        return;
    }

    const m = { left: 58, right: 24, top: 36, bottom: 52 };
    const iW = W - m.left - m.right;
    const iH = H - m.top - m.bottom;

    // mesmas escalas da de cima, mas o x cobre só o trecho marcado
    const x = d3.scaleTime().domain(d3.extent(sub, d => d.date)).range([0, iW]);
    const y = d3.scaleLinear().domain([0, d3.max(sub, d => d.val) ?? 1]).nice().range([iH, 0]);

    svg.append('text').attr('x', W / 2).attr('y', 19)
        .attr('text-anchor', 'middle').attr('font-size', '13px').attr('font-weight', '700')
        .attr('fill', '#1f4e79')
        .text(`Detalhe mensal — ${name} · ${fmtMesAno(d0)} a ${fmtMesAno(sub[sub.length - 1].date)}`);

    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

    // mesma cara da timeline de cima (área + linha)
    g.append('path').datum(sub)
        .attr('fill', '#2c6fad').attr('fill-opacity', 0.12)
        .attr('d', d3.area().x(d => x(d.date)).y0(iH).y1(d => y(d.val)).curve(d3.curveMonotoneX));
    g.append('path').datum(sub)
        .attr('fill', 'none').attr('stroke', '#2c6fad').attr('stroke-width', 2)
        .attr('d', d3.line().x(d => x(d.date)).y(d => y(d.val)).curve(d3.curveMonotoneX));

    // Pontos com tooltip de detalhe
    const tip = d3.select('body').select('#tooltip');
    g.selectAll('circle.ptd').data(sub).join('circle')
        .attr('class', 'ptd')
        .attr('cx', d => x(d.date)).attr('cy', d => y(d.val))
        .attr('r', 3).attr('fill', '#2c6fad').style('cursor', 'pointer')
        .on('mouseover', function (event, d) {
            d3.select(this).attr('r', 5);
            if (!tip.empty()) tip.style('display', 'block').html(
                `<strong>${fmtMesAno(d.date)}</strong><br>` +
                `${metric}: ${d.val.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}` +
                (useRate ? ' / 10k hab.' : '')
            );
        })
        .on('mousemove', event => {
            if (!tip.empty()) tip.style('left', `${event.pageX + 14}px`)
                                  .style('top', `${event.pageY + 14}px`);
        })
        .on('mouseout', function () {
            d3.select(this).attr('r', 3);
            if (!tip.empty()) tip.style('display', 'none');
        });

    // eixo X com os meses. ajusta de quantos em quantos meses mostrar um tick,
    // senão fica tudo embolado quando o trecho é grande.
    const months = sub.length;
    const step = months <= 14 ? 1 : months <= 30 ? 2 : months <= 60 ? 4 : 6;
    svg.append('g').attr('transform', `translate(${m.left},${m.top + iH})`)
        .call(d3.axisBottom(x).ticks(d3.timeMonth.every(step)).tickFormat(fmtMesAno))
        .selectAll('text')
        .attr('font-size', '9px').attr('text-anchor', 'end')
        .attr('transform', 'rotate(-35)').attr('dx', '-0.4em').attr('dy', '0.3em');

    svg.append('g').attr('transform', `translate(${m.left},${m.top})`)
        .call(d3.axisLeft(y).ticks(4)
            .tickFormat(v => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })));

    svg.append('text')
        .attr('transform', `translate(14,${m.top + iH / 2}) rotate(-90)`)
        .attr('text-anchor', 'middle').attr('font-size', '13px')
        .attr('font-weight', 'bold')
        .text(useRate ? 'Taxa / 10k' : 'Total');
}

// botão "limpar seleção": zera tudo e apaga os gráficos de detalhe
export function clearCharts() {
    selectedScope = null;
    detailRange = null;
    hoveredScope = null;
    d3.select('#map-group').selectAll('path')
        .style('opacity', 1).style('stroke', '#fff').style('stroke-width', '0.5');
    d3.select('#chart-sidebar').selectAll('*').remove();
    d3.select('#chart-top-mun').selectAll('*').remove();
    d3.select('#chart-timeline').selectAll('*').remove();
    d3.select('#chart-timeline-detail').selectAll('*').remove();
}
