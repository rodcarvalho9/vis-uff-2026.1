import * as d3 from 'd3';
import { Crime } from './crime';
import { Populacao } from './populacao';

const crime = new Crime();
const populacao = new Populacao();

let selectedMunicipality = null;
let selectedMunicipalityName = null;

export const CRIME_TYPES = [
    'hom_doloso',
    'lesao_corp_morte',
    'latrocinio',
    'cvli',
    'hom_por_interv_policial',
    'feminicidio',
    'letalidade_violenta',
    'tentat_hom',
    'tentativa_feminicidio',
    'lesao_corp_dolosa',
    'estupro',
    'hom_culposo',
    'lesao_corp_culposa',
    'roubo_transeunte',
    'roubo_celular',
    'roubo_em_coletivo',
    'roubo_rua',
    'roubo_veiculo',
    'roubo_carga',
    'roubo_comercio',
    'roubo_residencia',
    'roubo_banco',
    'roubo_cx_eletronico',
    'roubo_conducao_saque',
    'roubo_apos_saque',
    'roubo_bicicleta',
    'outros_roubos',
    'furto_veiculos',
    'furto_transeunte',
    'furto_coletivo',
    'furto_celular',
    'furto_bicicleta',
    'outros_furtos',
    'sequestro',
    'extorsao',
    'sequestro_relampago',
    'estelionato',
    'apreensao_drogas',
    'posse_drogas',
    'trafico_drogas',
    'ameaca'
];

export async function initDbs() {
    console.log('Initializing data...');
    await crime.init();
    await crime.loadCrime();

    await populacao.init();
    await populacao.loadPopulacao();

    console.log('Data initialized');
}

export async function getAvailableYears() {
    const years = await crime.query('SELECT DISTINCT ano FROM crime_rj ORDER BY ano');
    return years.map(item => Number(item.ano)).filter(Boolean);
}

export async function loadMap(geojson, metric = 'furto_celular', year = null, margens = { left: 5, right: 5, top: 5, bottom: 5 }) {
    const svg = d3.select('#chart-map');

    if (svg.empty()) {
        console.log('SVG element not found');
        return;
    }

    // ---- Tamanho do Gráfico
    const width = +svg.node().getBoundingClientRect().width - margens.left - margens.right;
    const height = +svg.node().getBoundingClientRect().height - margens.top - margens.bottom;

    const selectedYear = year || (await getAvailableYears()).at(-1) || new Date().getFullYear();
    const data = await queryCrimeData(metric, selectedYear);
    const intData = data.map(d => ({
        fmun_cod: String(d.fmun_cod),
        value: Number(d.value)
    }));

    const maxValue = d3.max(intData, d => d.value) || 0;
    const colorScale = d3.scaleLinear()
        .domain([0, maxValue || 1])
        .range(['#f7f7f7', '#b30000']);

    let projection = d3.geoMercator().
        fitExtent([[0, 0], [width, height]], geojson);

    let path = d3.geoPath()
        .projection(projection);

    const mGroup = svg.selectAll('#group')
        .data([0])
        .join('g')
        .attr('id', 'group')
        .attr('transform', `translate(${margens.left}, ${margens.top})`);

    function updateMapSelection() {
        mGroup.selectAll('path')
            .style('fill', d => {
                const id = String(d.properties.CD_MUN);
                if (selectedMunicipality && selectedMunicipality === id) {
                    return '#f4d03f';
                }

                const value = intData.find(item => item.fmun_cod === id)?.value || 0;
                return value > 0 ? colorScale(value) : '#f7f7f7';
            })
            .style('stroke-width', d => {
                const id = String(d.properties.CD_MUN);
                return selectedMunicipality && selectedMunicipality === id ? 2.2 : 1;
            })
            .style('stroke', d => {
                const id = String(d.properties.CD_MUN);
                return selectedMunicipality && selectedMunicipality === id ? '#8a6d0d' : 'black';
            });
    }

    const tooltip = d3.select('body')
        .selectAll('#tooltip')
        .data([0])
        .join('div')
        .attr('id', 'tooltip')
        .style('position', 'absolute')
        .style('display', 'none')
        .style('background', 'white')
        .style('border', '1px solid black')
        .style('padding', '5px')
        .style('pointer-events', 'none');

    mGroup.selectAll('path')
        .data(geojson.features)
        .join('path')
        .attr('d', path)
        .style('stroke', 'black')
        .on('mouseover', handleMouseOver)
        .on('mousemove', handleMouseMove)
        .on('mouseout', handleMouseOut)
        .on('click', handleClick);

    updateMapSelection();

    // ---- Zoom e Pan
    const zoom = d3.zoom()
        .scaleExtent([1, 8])
        .on('zoom', handleZoom);
    svg.call(zoom);

    await renderTopMunicipalities(metric, selectedYear);
    await renderTopCrimes(metric, selectedYear, selectedMunicipality, selectedMunicipalityName);
    await renderMonthlyEvolution(metric, selectedYear, selectedMunicipality, selectedMunicipalityName);

    function handleMouseOver(event, d) {
        const id = String(d.properties.CD_MUN);
        const value = intData.find(item => item.fmun_cod === id)?.value || 0;
        const formattedValue = value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

        tooltip
            .style('display', 'block')
            .html(`${d.properties.NM_MUN}<br>${metric} (${selectedYear}): ${formattedValue} por 10 mil hab.`);
    }

    function handleMouseMove(event) {
        tooltip
            .style('left', `${event.pageX + 10}px`)
            .style('top', `${event.pageY + 10}px`);
    }

    function handleMouseOut() {
        tooltip
            .style('display', 'none');
    }

    async function handleClick(event, d) {
        const id = String(d.properties.CD_MUN);
        const isSameSelection = selectedMunicipality === id;

        selectedMunicipality = isSameSelection ? null : id;
        selectedMunicipalityName = isSameSelection ? null : d.properties.NM_MUN;
        updateMapSelection();

        await renderTopCrimes(metric, selectedYear, selectedMunicipality, selectedMunicipalityName);
        await renderMonthlyEvolution(metric, selectedYear, selectedMunicipality, selectedMunicipalityName);
    }
}

export function clearMap() {
    selectedMunicipality = null;
    selectedMunicipalityName = null;

    d3.select('#chart-map')
        .selectAll('#group')
        .selectAll('path')
        .remove();

    d3.select('#chart-secondary')
        .selectAll('*')
        .remove();

    d3.select('#chart-tertiary')
        .selectAll('*')
        .remove();

    d3.select('#chart-line')
        .selectAll('*')
        .remove();
}

function handleZoom({ transform }) {
    d3.select('#chart-map')
        .selectAll('#group')
        .selectAll('path')
        .attr('transform', transform);
}

async function queryCrimeData(metric = 'furto_celular', year = null) {
    if (!CRIME_TYPES.includes(metric)) {
        throw new Error(`Invalid crime metric: ${metric}`);
    }

    const selectedYear = year || new Date().getFullYear();

    const sql = `
        SELECT
            c.fmun_cod,
            SUM(c.${metric}) * 10000.0 / NULLIF(MAX(p.populacao), 0) AS value
        FROM crime_rj c
        LEFT JOIN populacao_rj p
            ON c.fmun_cod = p.fmun_cod
           AND c.ano = p.ano
        WHERE c.ano = ${selectedYear}
        GROUP BY c.fmun_cod
    `;

    return await crime.query(sql);
}

async function queryTopMunicipalitiesData(metric = 'furto_celular', year = null) {
    const selectedYear = year || new Date().getFullYear();

    const sql = `
        SELECT
            c.fmun_cod,
            c.fmun,
            SUM(c.${metric}) * 10000.0 / NULLIF(MAX(p.populacao), 0) AS value
        FROM crime_rj c
        LEFT JOIN populacao_rj p
            ON c.fmun_cod = p.fmun_cod
           AND c.ano = p.ano
        WHERE c.ano = ${selectedYear}
        GROUP BY c.fmun_cod, c.fmun
        ORDER BY value DESC
        LIMIT 5
    `;

    return await crime.query(sql);
}

async function queryTopCrimesData(fmunCod, year = null) {
    const selectedYear = year || new Date().getFullYear();
    const whereClause = fmunCod ? `WHERE c.fmun_cod = '${fmunCod}'` : 'WHERE 1 = 1';

    const crimesSql = CRIME_TYPES.map(metric => `
        SELECT '${metric}' AS crime_type,
               SUM(c.${metric}) * 10000.0 / NULLIF(MAX(p.populacao), 0) AS value
        FROM crime_rj c
        LEFT JOIN populacao_rj p
            ON c.fmun_cod = p.fmun_cod
           AND c.ano = p.ano
        ${whereClause}
          AND c.ano = ${selectedYear}
    `).join(`
        UNION ALL
    `);

    const sql = `
        SELECT crime_type, value
        FROM (
            ${crimesSql}
        )
        ORDER BY value DESC
        LIMIT 5
    `;

    return await crime.query(sql);
}

export async function renderTopMunicipalities(metric, year) {
    const data = await queryTopMunicipalitiesData(metric, year);
    await loadTopMunicipalitiesBarChart(data, metric, year);
}

async function renderTopCrimes(metric, year, municipalityCode = null, municipalityName = null) {
    const data = await queryTopCrimesData(municipalityCode, year);
    await loadTopCrimesBarChart(data, municipalityName || 'Estado');
}

async function loadTopMunicipalitiesBarChart(data, metric, year, svgSelector = '#chart-tertiary', margens = { left: 55, right: 25, top: 40, bottom: 95 }) {
    const svg = d3.select(svgSelector);
    if (svg.empty()) return;

    svg.selectAll('*').remove();

    const svgWidth = +svg.style('width').split('px')[0];
    const svgHeight = +svg.style('height').split('px')[0];
    const innerWidth = svgWidth - margens.left - margens.right;
    const innerHeight = svgHeight - margens.top - margens.bottom;

    svg.append('text')
        .attr('x', svgWidth / 2).attr('y', 20)
        .attr('text-anchor', 'middle').attr('fill', 'currentColor')
        .attr('font-size', '14px').attr('font-weight', 'bold')
        .text(`Top 5 municípios - ${metric} (${year})`);

    const chartData = data.map(d => ({
        municipality: d.fmun || d.fmun_cod,
        value: Number(d.value)
    }));

    const x = d3.scaleBand()
        .domain(chartData.map(d => d.municipality))
        .range([0, innerWidth]).padding(0.1);

    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.value) || 0])
        .nice()
        .range([innerHeight, 0]);

    const mainGroup = svg.append('g')
        .attr('transform', `translate(${margens.left}, ${margens.top})`);

    mainGroup.selectAll('rect')
        .data(chartData).join('rect')
        .attr('fill', '#2c6fad')
        .attr('x', d => x(d.municipality))
        .attr('y', d => y(d.value))
        .attr('height', d => y(0) - y(d.value))
        .attr('width', x.bandwidth())
        .append('title')
        .text(d => `${d.municipality}: ${d.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

    mainGroup.selectAll('.bar-label')
        .data(chartData).join('text')
        .attr('class', 'bar-label')
        .attr('x', d => x(d.municipality) + x.bandwidth() / 2)
        .attr('y', d => y(d.value) - 6)
        .attr('text-anchor', 'middle')
        .attr('font-size', '11px').attr('fill', 'currentColor')
        .text(d => d.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

    svg.append('g')
        .attr('transform', `translate(${margens.left}, ${svgHeight - margens.bottom})`)
        .call(d3.axisBottom(x))
        .call(g => g.selectAll('text')
            .attr('font-size', '11px')
            .attr('text-anchor', 'end')
            .attr('transform', 'rotate(-35)')
            .attr('dx', '-0.5em')
            .attr('dy', '0.2em'));

    svg.append('g')
        .attr('transform', `translate(${margens.left}, ${margens.top})`)
        .call(d3.axisLeft(y).ticks(5).tickFormat(d => d.toLocaleString('pt-BR')))
        .call(g => g.append('text')
            .attr('x', -40).attr('y', -18)
            .attr('fill', 'currentColor').attr('text-anchor', 'start')
            .attr('font-size', '12px').attr('font-weight', 'bold')
            .text('Total (por 10 mil hab.)'));
}

async function queryMonthlyEvolution(metric = 'furto_celular', year = null, municipalityCode = null) {
    const selectedYear = year || new Date().getFullYear();

    let sql = `
        SELECT
            mes AS month,
            SUM(${metric}) * 10000.0 / NULLIF(MAX(populacao), 0) AS value
        FROM (
            SELECT
                c.mes,
                c.${metric},
                p.populacao
            FROM crime_rj c
            LEFT JOIN populacao_rj p
                ON c.fmun_cod = p.fmun_cod
               AND c.ano = p.ano
            WHERE c.ano = ${selectedYear}
    `;

    if (municipalityCode) {
        sql += ` AND c.fmun_cod = '${municipalityCode}'`;
    }

    sql += `
        ) t
        GROUP BY mes
        ORDER BY mes
    `;

    return await crime.query(sql);
}

export async function renderMonthlyEvolution(metric, year, municipalityCode = null, municipalityName = null) {
    const data = await queryMonthlyEvolution(metric, year, municipalityCode);
    await loadMonthlyEvolutionLineChart(data, metric, year, municipalityName);
}

async function loadMonthlyEvolutionLineChart(data, metric, year, municipalityName = null, svgSelector = '#chart-line', margens = { left: 55, right: 25, top: 40, bottom: 70 }) {
    const svg = d3.select(svgSelector);
    if (svg.empty()) return;

    svg.selectAll('*').remove();

    const svgWidth = +svg.style('width').split('px')[0];
    const svgHeight = +svg.style('height').split('px')[0];
    const innerWidth = svgWidth - margens.left - margens.right;
    const innerHeight = svgHeight - margens.top - margens.bottom;

    svg.append('text')
        .attr('x', svgWidth / 2).attr('y', 20)
        .attr('text-anchor', 'middle').attr('fill', 'currentColor')
        .attr('font-size', '14px').attr('font-weight', 'bold')
        .text(municipalityName ? `Evolução mensal - ${metric} (${municipalityName}, ${year})` : `Evolução mensal - ${metric} (${year})`);

    const chartData = data.map(d => ({
        month: Number(d.month),
        value: Number(d.value)
    }));

    if (!chartData.length) {
        svg.append('text')
            .attr('x', svgWidth / 2)
            .attr('y', svgHeight / 2)
            .attr('text-anchor', 'middle')
            .attr('fill', 'currentColor')
            .attr('font-size', '13px')
            .text('Selecione um município no mapa');
        return;
    }

    const x = d3.scaleLinear()
        .domain(d3.extent(chartData, d => d.month))
        .range([0, innerWidth]);

    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.value) || 0])
        .nice()
        .range([innerHeight, 0]);

    const line = d3.line()
        .x(d => x(d.month))
        .y(d => y(d.value));

    const mainGroup = svg.append('g')
        .attr('transform', `translate(${margens.left}, ${margens.top})`);

    mainGroup.append('path')
        .datum(chartData)
        .attr('fill', 'none')
        .attr('stroke', '#2c6fad')
        .attr('stroke-width', 2.5)
        .attr('d', line);

    mainGroup.selectAll('circle')
        .data(chartData).join('circle')
        .attr('cx', d => x(d.month))
        .attr('cy', d => y(d.value))
        .attr('r', 3.5)
        .attr('fill', '#2c6fad');

    mainGroup.append('g')
        .attr('transform', `translate(0, ${innerHeight})`)
        .call(d3.axisBottom(x).ticks(chartData.length).tickFormat(d => d.toString()));

    mainGroup.append('g')
        .call(d3.axisLeft(y).ticks(5).tickFormat(d => d.toLocaleString('pt-BR', { maximumFractionDigits: 2 })));

    mainGroup.append('text')
        .attr('x', -40).attr('y', -12)
        .attr('fill', 'currentColor').attr('text-anchor', 'start')
        .attr('font-size', '12px').attr('font-weight', 'bold')
        .text('Total');

    mainGroup.append('text')
        .attr('x', innerWidth / 2).attr('y', innerHeight + 45)
        .attr('text-anchor', 'middle').attr('fill', 'currentColor')
        .attr('font-size', '12px').attr('font-weight', 'bold')
        .text('Mês');

    mainGroup.append('text')
        .attr('x', 18)
        .attr('y', 20)
        .attr('fill', 'currentColor')
        .attr('font-size', '11px')
        .text('(por 10 mil hab.)');
}

async function loadTopCrimesBarChart(data, municipalityName, svgSelector = '#chart-secondary', margens = { left: 55, right: 25, top: 40, bottom: 95 }) {
    const svg = d3.select(svgSelector);
    if (svg.empty()) return;

    svg.selectAll('*').remove();

    const svgWidth = +svg.style("width").split("px")[0];
    const svgHeight = +svg.style("height").split("px")[0];
    const innerWidth = svgWidth - margens.left - margens.right;
    const innerHeight = svgHeight - margens.top - margens.bottom;

    svg.append("text")
        .attr("x", svgWidth / 2).attr("y", 20)
        .attr("text-anchor", "middle").attr("fill", "currentColor")
        .attr("font-size", "14px").attr("font-weight", "bold")
        .text(`Top 5 crimes - ${municipalityName}`);

    const chartData = data.map(d => ({
        crime_type: d.crime_type,
        value: Number(d.value)
    }));

    const x = d3.scaleBand()
        .domain(chartData.map(d => d.crime_type))
        .range([0, innerWidth]).padding(0.1);

    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.value) || 0])
        .nice()
        .range([innerHeight, 0]);

    const mainGroup = svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`);

    mainGroup.selectAll("rect")
        .data(chartData).join("rect")
        .attr("fill", "#2c6fad")
        .attr("x", d => x(d.crime_type))
        .attr("y", d => y(d.value))
        .attr("height", d => y(0) - y(d.value))
        .attr("width", x.bandwidth())
        .append("title")
        .text(d => `${d.crime_type}: ${d.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

    mainGroup.selectAll(".bar-label")
        .data(chartData).join("text")
        .attr("class", "bar-label")
        .attr("x", d => x(d.crime_type) + x.bandwidth() / 2)
        .attr("y", d => y(d.value) - 6)
        .attr("text-anchor", "middle")
        .attr("font-size", "11px").attr("fill", "currentColor")
        .text(d => d.value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${svgHeight - margens.bottom})`)
        .call(d3.axisBottom(x))
        .call(g => g.selectAll("text")
            .attr("font-size", "11px")
            .attr("text-anchor", "end")
            .attr("transform", "rotate(-35)")
            .attr("dx", "-0.5em")
            .attr("dy", "0.2em"))
        .call(g => g.append("text")
            .attr("x", innerWidth / 2).attr("y", 85)
            .attr("text-anchor", "middle").attr("fill", "currentColor")
            .attr("font-size", "12px").attr("font-weight", "bold")
            .text("Tipo de crime"));

    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`)
        .call(d3.axisLeft(y).ticks(5).tickFormat(d => d.toLocaleString()))
        .call(g => g.append("text")
            .attr("x", -40).attr("y", -18)
            .attr("fill", "currentColor").attr("text-anchor", "start")
            .attr("font-size", "12px").attr("font-weight", "bold")
            .text("Total (por 10 mil hab.)"));
}
