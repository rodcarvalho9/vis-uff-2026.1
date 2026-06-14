// ════════════════════════════════════════════════════════════════════════
// map.js — Renderização e interação de todas as visões (camada de visualização)
//
// Concentra o desenho com D3.js das quatro visões coordenadas:
//   • Mapa coroplético (Overview)        → renderMap()
//   • Tipos de crime do município       → renderTopCrimesChart() + drawBarChart()
//   • Top 5 municípios do tipo          → renderTopMunChart()    + drawBarChart()
//   • Série histórica mensal (timeline)  → renderTimeline()
//
// Três responsabilidades técnicas recorrentes neste arquivo:
//   1. CÁLCULO DE ESCALAS — mapear valores de dados para canais visuais
//      (cor, posição, comprimento) via d3.scale*.
//   2. ATUALIZAÇÃO DO DOM — usar o padrão data join do D3
//      (selectAll().data().join()) para criar/atualizar/remover elementos SVG.
//   3. COORDENAÇÃO — toda interação volta ao estado global (em main.js) e
//      dispara um novo render, mantendo as visões sincronizadas.
// ════════════════════════════════════════════════════════════════════════
import * as d3 from 'd3';
import { Database } from './database';

// ── Singletons de módulo ───────────────────────────────────────────────────
const db = new Database();
let geojson = null;
let crimeTypeMap = new Map();
export const CRIME_TYPES = [];

// Escopo selecionado no mapa; null = nenhum
let selectedScope = null; // { kind: 'municipio'|'regiao', code: string, name: string }
let municipalityRegionLookup = new Map();

// Parâmetros do último render — permitem que interações disparadas pelos
// gráficos secundários (cliques em barras, brush) reconstruam as views sem
// precisar reconsultar o estado global de main.js.
let current = { metric: null, useRate: false, yearFrom: null, yearTo: null, aggregation: 'municipio' };

// Callbacks registrados por main.js para fechar o ciclo de Linked Views:
// uma interação num gráfico altera o estado global, que re-renderiza tudo.
let handlers = { onMetricPick: null, onPeriodPick: null };
export function setInteractionHandlers(h) { handlers = { ...handlers, ...h }; }

// ── Inicialização ──────────────────────────────────────────────────────────
export async function initData(geoData) {
    geojson = geoData;
    await db.init();
    // Carrega as tabelas de crimes, população e mapeamento por tipo de crime
    await Promise.all([db.loadCrime(), db.loadPopulacao(), db.loadTipoCrime()]);

    const typeRows = await db.query('SELECT variavel, tipo FROM tipo_crime');
    buildCrimeTypeMap(typeRows);

    const regionRows = await db.query('SELECT DISTINCT fmun_cod, regiao FROM crime_rj');
    municipalityRegionLookup = new Map(regionRows.map(({ fmun_cod, regiao }) => [String(fmun_cod), regiao]));
}

// ── Helpers de query ───────────────────────────────────────────────────────

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

// Para o modo taxa, calcula a média anual das taxas por 10k no período.
// Usar AVG de taxas anuais é mais correto do que somar crimes e dividir por
// uma única população, evitando distorção em períodos multi-anuais.
function rateExpr(metric, useRate) {
    if (!useRate) return `SUM(c.${metric})`;
    return `
        AVG(year_rate) FROM (
            SELECT c2.fmun_cod,
                   SUM(c2.${metric}) * 10000.0 / NULLIF(MAX(p2.populacao), 0) AS year_rate
            FROM crime_rj c2
            LEFT JOIN populacao_rj p2 ON c2.fmun_cod = p2.fmun_cod AND c2.ano = p2.ano
    `;
}

// Wrapper genérico para queries — centraliza o tratamento de erros
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

function buildRegionGeometry(regionFeatures) {
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
        geometry: buildRegionGeometry(regionFeatures)
    }));
}

// ── Mapa coroplético (Overview) ────────────────────────────────────────────
export async function renderMap(metric, useRate, yearFrom, yearTo, aggregation = 'municipio') {
    const svg = d3.select('#chart-map');
    if (svg.empty() || !geojson) return;

    // Registra os parâmetros correntes para uso pelas interações dos gráficos
    current = { metric, useRate, yearFrom, yearTo, aggregation };

    // top maior reserva espaço para o título do mapa (2 linhas, ~50px)
    const mg = { left: 5, right: 5, top: 54, bottom: 5 };

    // Largura/altura do container com fallbacks em cascata. Se o SVG ainda não
    // tem largura resolvida (CSS width:100% antes do layout), usamos o container
    // pai e, em último caso, um padrão fixo. Isso garante que o mapa SEMPRE
    // desenhe com uma projeção válida — nunca em branco. O resize handler em
    // main.js reajusta quando a largura real fica disponível.
    const node = svg.node();
    let rawW = node.getBoundingClientRect().width;
    if (rawW < 50 && node.parentNode) rawW = node.parentNode.getBoundingClientRect().width;
    if (rawW < 50) rawW = 800;
    let rawH = node.getBoundingClientRect().height;
    if (rawH < 50) rawH = 560;

    const W = rawW - mg.left - mg.right;
    const H = rawH - mg.top  - mg.bottom;

    // Agrega crimes pelo nível escolhido (município ou região) no período;
    // no modo taxa, calcula a média anual por unidade de agregação.
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

    // ── CÁLCULO DE ESCALA (cor) ────────────────────────────────────────────
    // Escala quantílica: o domínio é o conjunto de valores observados e o range
    // são 7 tons de vermelho. Diferente de scaleLinear, ela coloca ~o mesmo
    // número de municípios em cada faixa, distribuindo-os uniformemente e
    // impedindo que valores extremos (ex.: capital) achatem toda a paleta.
    const colorScale = d3.scaleQuantile()
        .domain(rows.map(d => +d.value).filter(v => v > 0))
        .range(d3.schemeReds[7]);

    // ── CÁLCULO DE ESCALA (geográfica) ─────────────────────────────────────
    // A projeção Mercator converte (lon, lat) → (x, y) em pixels. fitExtent
    // calcula automaticamente escala e translação para encaixar todo o GeoJSON
    // dentro da área útil [W, H]. geoPath gera o atributo "d" de cada <path>.
    const projection = d3.geoMercator().fitExtent([[0, 0], [W, H]], geojson);
    const pathGen = d3.geoPath().projection(projection);

    // ── ATUALIZAÇÃO DO DOM (data join) ─────────────────────────────────────
    // Grupo <g> único e idempotente: data([0]) garante que ele seja criado uma
    // vez e apenas reaproveitado nos re-renders (em vez de duplicado).
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

    // Data join: vincula um <path> a cada unidade do mapa (município ou região).
    // join('path') cria os ausentes (enter), atualiza os existentes e remove
    // os sobrando (exit) — assim a troca de métrica/período só recolore os
    // mesmos polígonos, sem recriar o SVG inteiro.
    g.selectAll('path')
        .data(mapFeatures)
        .join('path')
        .attr('d', pathGen)                              // geometria projetada
        .style('fill', d => {                            // cor ← valor via escala
            const key = String(d.properties.CD_MUN);
            const val = lookup.get(key) ?? 0;
            return val > 0 ? colorScale(val) : '#f0f0f0'; // cinza = sem dado/zero
        })
        .style('stroke', '#fff').style('stroke-width', '0.5')
        .on('mouseover', (event, d) => {
            const key = String(d.properties.CD_MUN);
            const val = lookup.get(key) ?? 0;
            const region = aggregation === 'regiao' ? d.properties.NM_MUN : municipalityRegionLookup.get(key);
            tip.style('display', 'block').html(
                `<strong>${d.properties.NM_MUN}</strong><br>` +
                `${aggregation === 'regiao' ? `Região: ${region ?? '—'}<br>` : ''}` +
                `${metric}: ${val.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}` +
                (useRate ? ' / 10k hab.' : '')
            );
            d3.select(event.currentTarget).style('stroke', '#333').style('stroke-width', '1.5');
        })
        .on('mousemove', event => {
            tip.style('left', `${event.pageX + 14}px`).style('top', `${event.pageY + 14}px`);
        })
        .on('mouseout', (event, d) => {
            tip.style('display', 'none');
            const isSelected = isFeatureSelected(d);
            d3.select(event.currentTarget)
                .style('stroke', isSelected ? '#333' : '#fff')
                .style('stroke-width', isSelected ? '2' : '0.5');
        })
        // Click: Details on Demand — atualiza todas as linked views.
        // Segundo clique no mesmo município desseleciona (toggle).
        .on('click', (event, d) => {
            selectScope(String(d.properties.CD_MUN), d.properties.NM_MUN, aggregation);
        });

    // Zoom/pan — aplica transform apenas nos paths, não na legenda
    svg.call(
        d3.zoom().scaleExtent([1, 8]).on('zoom', ({ transform }) => {
            g.selectAll('path').attr('transform', transform);
        })
    );

    renderLegend(svg, colorScale, mg);
    renderMapTitle(svg, metric, useRate, yearFrom, yearTo, aggregation);
    applyMapHighlight(g);

    // Re-renderiza linked views se um escopo estava selecionado
    await renderLinkedViews(metric, useRate, yearFrom, yearTo, aggregation);
}

// Seleciona/desseleciona um escopo (município ou região) e re-renderiza as linked views.
// Reutilizado pelo clique no mapa E pelo clique nas barras de "Top municípios",
// garantindo que ambas as origens produzam exatamente o mesmo comportamento.
async function selectScope(code, name, aggregation) {
    const normalizedCode = String(code);
    const selectedKind = aggregation === 'regiao' ? 'regiao' : 'municipio';
    const isSame = selectedScope?.kind === selectedKind && selectedScope?.code === normalizedCode;
    selectedScope = isSame ? null : { kind: selectedKind, code: normalizedCode, name };

    applyMapHighlight(d3.select('#map-group'));

    if (!selectedScope) {
        d3.select('#chart-timeline').selectAll('*').remove();
        const c = document.getElementById('timeline-container');
        if (c) c.style.display = 'none';
    }
    await renderLinkedViews(current.metric, current.useRate, current.yearFrom, current.yearTo, current.aggregation);
}

function isFeatureSelected(d) {
    if (!selectedScope) return false;
    const code = String(d.properties.CD_MUN);
    if (selectedScope.kind === 'municipio') return selectedScope.code === code;
    return d.properties.region === selectedScope.code || d.properties.CD_MUN === selectedScope.code;
}

function applyMapHighlight(g) {
    g.selectAll('path').each(function(d) {
        const isSelected = isFeatureSelected(d);
        d3.select(this)
            .style('opacity', selectedScope && !isSelected ? 0.5 : 1)
            .style('stroke', isSelected ? '#333' : '#fff')
            .style('stroke-width', isSelected ? '2' : '0.5');
    });
}

// ── Título do mapa ─────────────────────────────────────────────────────────
// Exibe o tipo de crime, o modo de normalização e o período correntes, deixando
// explícito "o que" está sendo mostrado sem o usuário precisar olhar os controles.
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

// ── Legenda de cor ─────────────────────────────────────────────────────────
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

// ── Orquestrador das linked views ──────────────────────────────────────────
// Coordena os 3 gráficos secundários: top crimes, top municípios e timeline.
// Todos reagem ao mesmo estado (tipo de crime, período, município selecionado).
async function renderLinkedViews(metric, useRate, yearFrom, yearTo, aggregation) {
    const code = selectedScope?.code ?? null;
    const name = selectedScope?.name ?? null;

    await renderTopCrimesChart(code, name, useRate, yearFrom, yearTo, aggregation);
    await renderTopMunChart(metric, useRate, yearFrom, yearTo, aggregation);

    if (selectedScope && code) {
        await renderTimeline(code, name, metric, useRate, yearFrom, yearTo, aggregation);
    }
}

// ── Todos os tipos de crime do escopo selecionado (ou estado) ───────────
async function renderTopCrimesChart(code, name, useRate, yearFrom, yearTo, aggregation) {
    const scopeFilter = code ? (aggregation === 'regiao' ? `c.regiao = '${code}' AND` : `CAST(c.fmun_cod AS VARCHAR) = '${code}' AND`) : '';
    const parts = CRIME_TYPES.map(typeLabel => {
        const expr = buildCrimeTypeSumExpr(typeLabel, 'c');
        if (!useRate) return `
            SELECT '${typeLabel}' AS crime_type, SUM(${expr}) AS value
            FROM crime_rj c
            WHERE ${scopeFilter}
                  c.ano >= ${yearFrom} AND c.ano <= ${yearTo}
        `;
        return `
            SELECT '${typeLabel}' AS crime_type, AVG(yr) AS value FROM (
                SELECT c.ano,
                       SUM(${expr}) * 10000.0 / NULLIF(MAX(p.populacao), 0) AS yr
                FROM crime_rj c
                LEFT JOIN populacao_rj p ON c.fmun_cod = p.fmun_cod AND c.ano = p.ano
                WHERE ${scopeFilter}
                      c.ano >= ${yearFrom} AND c.ano <= ${yearTo}
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
        aggregation === 'regiao' ? `Tipos de crime − ${name ?? 'Estado RJ'} (região)` : `Tipos de crime − ${name ?? 'Estado RJ'}`,
        useRate ? 'Taxa / 10k hab.' : 'Total',
        '#2c6fad',
        {
            hint: 'clique em um tipo para mapeá-lo',
            // Cross-filtering: o tipo clicado vira o tipo ativo do mapa
            onBarClick: d => handlers.onMetricPick?.(d.label),
        }
    );
}

// ── Top 5 municípios para o tipo selecionado ─────────────────────────────
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
        const scopeFilter = selectedScope?.kind === 'regiao' && selectedScope?.code ? `AND c.regiao = '${selectedScope.code}'` : '';
        if (!useRate) {
            rows = await q(`
                SELECT c.fmun_cod, c.fmun, SUM(${crimeExpr}) AS value
                FROM crime_rj c
                WHERE c.ano >= ${yearFrom} AND c.ano <= ${yearTo}
                      ${scopeFilter}
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
                    WHERE c.ano >= ${yearFrom} AND c.ano <= ${yearTo}
                          ${scopeFilter}
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
            // Cross-filtering: seleciona o município no mapa e abre seus detalhes
            onBarClick: d => selectScope(d.code, d.label, aggregation),
        }
    );
}

// ── Reutilizável: bar chart horizontal ────────────────────────────────────
// opts.onBarClick(d): se fornecido, torna as barras clicáveis (cross-filtering).
// opts.hint: texto-dica exibido sob o título indicando a interação disponível.
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

    const m = { left: 58, right: 18, top: 36, bottom: 90 };
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

    // Dica de interação (ex.: "clique para filtrar")
    if (hint) {
        svg.append('text').attr('x', W / 2).attr('y', 32)
            .attr('text-anchor', 'middle').attr('font-size', '9px')
            .attr('fill', '#999').attr('font-style', 'italic')
            .text(hint);
    }

    // ── CÁLCULO DE ESCALAS (barras) ────────────────────────────────────────
    // x (banda/ordinal): uma faixa por categoria, com padding de 22% entre
    //   barras. x(label) dá a posição e x.bandwidth() a largura de cada barra.
    // y (linear): magnitude → altura. domain começa em 0 (zero significativo) e
    //   sobe 12% acima do máximo para folga do rótulo; .nice() arredonda os
    //   limites. range invertido [iH, 0] porque em SVG o y cresce para baixo.
    const x = d3.scaleBand().domain(chartData.map(d => d.label)).range([0, iW]).padding(0.22);
    const maxValue = d3.max(chartData, d => d.val) ?? 0;
    const y = d3.scaleLinear()
        .domain([0, maxValue > 0 ? maxValue * 1.12 : 1])
        .nice()
        .range([iH, 0]);

    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

    // Tooltip compartilhado (criado no renderMap); reutilizado aqui
    const tip = d3.select('body').select('#tooltip');

    // Data join: um <rect> por item. Posição/tamanho derivam das escalas; a
    // altura é iH - y(val) porque y(val) é a coordenada do topo da barra.
    g.selectAll('rect').data(chartData).join('rect')
        .attr('fill', color).attr('rx', 2)
        .attr('x', d => x(d.label)).attr('width', x.bandwidth())
        .attr('y', d => y(d.val)).attr('height', d => iH - y(d.val))
        .style('cursor', onBarClick ? 'pointer' : 'default')
        // Hover: realça a barra e mostra o valor exato (Details on Demand)
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
            if (!tip.empty()) tip.style('display', 'none');
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
        .attr('transform', 'rotate(-30)').attr('dx', '-0.4em').attr('dy', '0.2em');

    svg.append('g').attr('transform', `translate(${m.left},${m.top})`)
        .call(d3.axisLeft(y).ticks(4)
            .tickFormat(v => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })));

    svg.append('text')
        .attr('transform', `translate(14,${m.top + iH / 2}) rotate(-90)`)
        .attr('text-anchor', 'middle').attr('font-size', '10px')
        .text(yLabel);
}

// ── Timeline: série histórica mensal (dimensão "when") ────────────────────
async function renderTimeline(code, name, metric, useRate, yearFrom, yearTo, aggregation) {
    const container = document.getElementById('timeline-container');
    if (container) container.style.display = 'block';

    const svg = d3.select('#chart-timeline');
    if (svg.empty()) return;
    svg.selectAll('*').remove();

    // Série mensal com normalização por população se useRate
    const crimeExpr = buildCrimeTypeSumExpr(metric, 'c');
    const scopeFilter = aggregation === 'regiao' ? `c.regiao = '${code}'` : `CAST(c.fmun_cod AS VARCHAR) = '${code}'`;
    let rows;
    if (!useRate) {
        rows = await q(`
            SELECT c.ano, c.mes, SUM(${crimeExpr}) AS value
            FROM crime_rj c
            WHERE ${scopeFilter}
              AND c.ano >= ${yearFrom} AND c.ano <= ${yearTo}
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

    // Number() evita erro se DuckDB retornar BigInt nos campos inteiros
    const parsed = rows.map(d => ({
        date: new Date(Number(d.ano), Number(d.mes) - 1, 1),
        val: +d.value
    }));

    // ── CÁLCULO DE ESCALAS (timeline) ──────────────────────────────────────
    // x (tempo): d3.extent pega [primeira data, última data] como domínio,
    //   mapeando-as à largura útil — eixo temporal contínuo.
    // y (linear): magnitude → altura, novamente com range invertido [iH, 0].
    const x = d3.scaleTime().domain(d3.extent(parsed, d => d.date)).range([0, iW]);
    const y = d3.scaleLinear().domain([0, d3.max(parsed, d => d.val) ?? 1]).nice().range([iH, 0]);

    svg.append('text').attr('x', W / 2).attr('y', 19)
        .attr('text-anchor', 'middle').attr('font-size', '13px').attr('font-weight', '700')
        .attr('fill', '#1f4e79')
        .text(`${metric} — ${name} (${aggregation === 'regiao' ? 'região' : 'município'}) (série histórica mensal)`);

    // Dica da interação de brushing
    svg.append('text').attr('x', W / 2).attr('y', 32)
        .attr('text-anchor', 'middle').attr('font-size', '9px')
        .attr('fill', '#999').attr('font-style', 'italic')
        .text('arraste na horizontal para filtrar o período · clique fora para limpar');

    const g = svg.append('g').attr('transform', `translate(${m.left},${m.top})`);

    // Área preenchida reforça leitura de magnitude ao longo do tempo
    g.append('path').datum(parsed)
        .attr('fill', '#2c6fad').attr('fill-opacity', 0.12)
        .attr('d', d3.area().x(d => x(d.date)).y0(iH).y1(d => y(d.val)).curve(d3.curveMonotoneX));

    g.append('path').datum(parsed)
        .attr('fill', 'none').attr('stroke', '#2c6fad').attr('stroke-width', 1.8)
        .attr('d', d3.line().x(d => x(d.date)).y(d => y(d.val)).curve(d3.curveMonotoneX));

    // ── Brushing temporal (dimensão "when") ────────────────────────────────
    // Arrastar na horizontal seleciona um intervalo; ao soltar, os anos
    // correspondentes viram o novo período global e tudo é refiltrado.
    // Adicionado ANTES dos círculos para que estes fiquem clicáveis por cima.
    const brush = d3.brushX()
        .extent([[0, 0], [iW, iH]])
        .on('end', (event) => {
            if (!event.selection) return;          // clique simples = limpa (no-op aqui)
            const [x0, x1] = event.selection.map(x.invert);
            const a = Math.min(x0.getFullYear(), x1.getFullYear());
            const b = Math.max(x0.getFullYear(), x1.getFullYear());
            handlers.onPeriodPick?.(a, b);
        });
    g.append('g').attr('class', 'time-brush').call(brush);

    // Pontos mensais — sobre o brush, com tooltip de detalhe ao passar o mouse
    const tip = d3.select('body').select('#tooltip');
    const mesFmt = d3.timeFormat('%m/%Y');
    g.selectAll('circle.pt').data(parsed).join('circle')
        .attr('class', 'pt')
        .attr('cx', d => x(d.date)).attr('cy', d => y(d.val))
        .attr('r', 2.5).attr('fill', '#2c6fad').style('cursor', 'pointer')
        .on('mouseover', function (event, d) {
            d3.select(this).attr('r', 4.5);
            if (!tip.empty()) tip.style('display', 'block').html(
                `<strong>${mesFmt(d.date)}</strong><br>` +
                `${metric}: ${d.val.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}` +
                (useRate ? ' / 10k hab.' : '')
            );
        })
        .on('mousemove', event => {
            if (!tip.empty()) tip.style('left', `${event.pageX + 14}px`)
                                  .style('top', `${event.pageY + 14}px`);
        })
        .on('mouseout', function () {
            d3.select(this).attr('r', 2.5);
            if (!tip.empty()) tip.style('display', 'none');
        });

    svg.append('g').attr('transform', `translate(${m.left},${m.top + iH})`)
        .call(d3.axisBottom(x).ticks(d3.timeYear.every(1)).tickFormat(d3.timeFormat('%Y')))
        .selectAll('text').attr('font-size', '10px');

    svg.append('g').attr('transform', `translate(${m.left},${m.top})`)
        .call(d3.axisLeft(y).ticks(4)
            .tickFormat(v => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })));

    svg.append('text')
        .attr('transform', `translate(14,${m.top + iH / 2}) rotate(-90)`)
        .attr('text-anchor', 'middle').attr('font-size', '10px')
        .text(useRate ? 'Taxa / 10k' : 'Total');
}

// ── Limpeza ────────────────────────────────────────────────────────────────
export function clearCharts() {
    selectedScope = null;
    d3.select('#map-group').selectAll('path')
        .style('opacity', 1).style('stroke', '#fff').style('stroke-width', '0.5');
    d3.select('#chart-sidebar').selectAll('*').remove();
    d3.select('#chart-top-mun').selectAll('*').remove();
    d3.select('#chart-timeline').selectAll('*').remove();
    const c = document.getElementById('timeline-container');
    if (c) c.style.display = 'none';
}
