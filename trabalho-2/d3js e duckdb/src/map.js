import * as d3 from 'd3';
import { Crime } from "./crime";

const crime = new Crime();

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

export async function initCrime() {
    console.log('Initializing Crime...');
    await crime.init();
    await crime.loadCrime();
    console.log('Crime initialized');
}

export async function loadMap(geojson, metric = 'furto_celular', margens = { left: 5, right: 5, top: 5, bottom: 5 }) {
    const svg = d3.select('#chart-map');

    if (svg.empty()) {
        console.log('SVG element not found');
        return;
    }

    // ---- Tamanho do Gráfico
    const width = +svg.node().getBoundingClientRect().width - margens.left - margens.right;
    const height = +svg.node().getBoundingClientRect().height - margens.top - margens.bottom;

    const data = await queryCrimeData(metric);
    const intData = data.map(d => ({
        fmun_cod: String(d.fmun_cod),
        value: Number(d.value)
    }));

    // Color Scale
    const colorScale = d3.scaleQuantile()
        .domain(intData.map(d => d.value))
        .range(d3.schemeReds[7]);

    let projection = d3.geoMercator().
        fitExtent([[0, 0], [width, height]], geojson);

    let path = d3.geoPath()
        .projection(projection);

    const mGroup = svg.selectAll('#group')
        .data([0])
        .join('g')
        .attr('id', 'group')
        .attr('transform', `translate(${margens.left}, ${margens.top})`);

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
        .style('fill', d => {
            const id = String(d.properties.CD_MUN);
            const value = intData.find(item => item.fmun_cod === id)?.value || 0;

            return colorScale(value);
        })
        .style('stroke', 'black')
        .on('mouseover', handleMouseOver)
        .on('mousemove', handleMouseMove)
        .on('mouseout', handleMouseOut)
        .on('click', handleClick);

    // ---- Zoom e Pan
    const zoom = d3.zoom()
        .scaleExtent([1, 8])
        .on('zoom', handleZoom);
    svg.call(zoom);

    function handleMouseOver(event, d) {
        const id = String(d.properties.CD_MUN);
        const value = intData.find(item => item.fmun_cod === id)?.value || 0;

        tooltip
            .style('display', 'block')
            .html(`${d.properties.NM_MUN}<br>${metric}: ${value}`);
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
        const data = await queryTopCrimesData(id);

        await loadTopCrimesBarChart(data, d.properties.NM_MUN);
    }
}

export function clearMap() {
    d3.select('#chart-map')
        .selectAll('#group')
        .selectAll('path')
        .remove();

    d3.select('#chart-secondary')
        .selectAll('*')
        .remove();
}

function handleZoom({ transform }) {
    d3.select('#chart-map')
        .selectAll('#group')
        .selectAll('path')
        .attr('transform', transform);
}

async function queryCrimeData(metric = 'furto_celular') {
    if (!CRIME_TYPES.includes(metric)) {
        throw new Error(`Invalid crime metric: ${metric}`);
    }

    const sql = `
        SELECT fmun_cod, SUM(${metric}) AS value
        FROM
            crime
        GROUP BY
            fmun_cod
    `;

    return await crime.query(sql);
}

async function queryTopCrimesData(fmunCod) {
    const crimesSql = CRIME_TYPES.map(metric => `
        SELECT '${metric}' AS crime_type, SUM(${metric}) AS value
        FROM crime
        WHERE fmun_cod = '${fmunCod}'
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
        .text(d => `${d.crime_type}: ${d.value.toLocaleString()}`);

    mainGroup.selectAll(".bar-label")
        .data(chartData).join("text")
        .attr("class", "bar-label")
        .attr("x", d => x(d.crime_type) + x.bandwidth() / 2)
        .attr("y", d => y(d.value) - 6)
        .attr("text-anchor", "middle")
        .attr("font-size", "11px").attr("fill", "currentColor")
        .text(d => d.value.toLocaleString());

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
            .attr("x", -40).attr("y", -12)
            .attr("fill", "currentColor").attr("text-anchor", "start")
            .attr("font-size", "12px").attr("font-weight", "bold")
            .text("Total"));
}
