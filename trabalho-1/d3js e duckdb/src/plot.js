import * as d3 from 'd3';

// Paleta categórica consistente para os 4 distritos em todos os gráficos.
// Tableau10 é perceptualmente distinta e amigável para daltônicos (Munzner, aula 11).
// A mesma cor sempre representa o mesmo distrito independente do gráfico.
const BOROUGH_COLORS = d3.scaleOrdinal()
    .domain(['Bronx', 'Brooklyn', 'Manhattan', 'Queens'])
    .range(d3.schemeTableau10);

// ─── 1. BAR CHART — Ganho médio por distrito ───────────────────────────────────
// Tarefa: identificar qual distrito oferece maior retorno por minuto (ou km).
// Canal: posição em eixo comum (eficácia máxima para quantitativos, Munzner).
// Cor categórica consistente com os demais gráficos.
export async function loadEarnPerBoroughBarplot(data, svgSelector, borough_type = 'pu_borough', metricLabel = 'US$/min', margens = { left: 55, right: 25, top: 40, bottom: 50 }) {
    const svg = d3.select(svgSelector);
    if (svg.empty()) return;

    const svgWidth  = +svg.style("width").split("px")[0];
    const svgHeight = +svg.style("height").split("px")[0];
    const innerWidth  = svgWidth  - margens.left - margens.right;
    const innerHeight = svgHeight - margens.top  - margens.bottom;

    // Título dinâmico reflete a métrica atual
    svg.append("text")
        .attr("x", svgWidth / 2).attr("y", 20)
        .attr("text-anchor", "middle").attr("fill", "currentColor")
        .attr("font-size", "14px").attr("font-weight", "bold")
        .text(`Ganho médio por Distrito (${metricLabel})`);

    const chartData = Array.isArray(data)
        ? data.map(d => ({ borough: d[borough_type], mean_earn: d.mean_earn }))
        : Array.from(data, ([borough, mean_earn]) => ({ borough, mean_earn }));

    chartData.sort((a, b) => d3.descending(a.mean_earn, b.mean_earn));

    const x = d3.scaleBand()
        .domain(chartData.map(d => d.borough))
        .range([0, innerWidth]).padding(0.1);

    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.mean_earn) || 0])
        .range([innerHeight, 0]);

    const mainGroup = svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`);

    mainGroup.selectAll("rect")
        .data(chartData).join("rect")
        // Cada distrito tem sempre a mesma cor em todos os gráficos
        .attr("fill", d => BOROUGH_COLORS(d.borough))
        .attr("x", d => x(d.borough))
        .attr("y", d => y(d.mean_earn))
        .attr("height", d => y(0) - y(d.mean_earn))
        .attr("width", x.bandwidth())
        .append("title")
        .text(d => `${d.borough}: ${d.mean_earn.toFixed(2)} ${metricLabel}`);

    // Rótulo numérico no topo de cada barra
    mainGroup.selectAll(".bar-label")
        .data(chartData).join("text")
        .attr("class", "bar-label")
        .attr("x", d => x(d.borough) + x.bandwidth() / 2)
        .attr("y", d => y(d.mean_earn) - 6)
        .attr("text-anchor", "middle")
        .attr("font-size", "11px").attr("fill", "currentColor")
        .text(d => d.mean_earn.toFixed(2));

    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${svgHeight - margens.bottom})`)
        .call(d3.axisBottom(x))
        .call(g => g.selectAll("text").attr("font-size", "11px").attr("text-anchor", "middle"))
        .call(g => g.append("text")
            .attr("x", innerWidth / 2).attr("y", 45)
            .attr("text-anchor", "middle").attr("fill", "currentColor")
            .attr("font-size", "12px").attr("font-weight", "bold")
            .text("Distrito"));

    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`)
        .call(d3.axisLeft(y).tickFormat(v => v.toFixed(2)))
        .call(g => g.append("text")
            .attr("x", -40).attr("y", -12)
            .attr("fill", "currentColor").attr("text-anchor", "start")
            .attr("font-size", "12px").attr("font-weight", "bold")
            .text(`Ganho (${metricLabel})`));
}

// ─── 2. BAR CHART HORIZONTAL — Total de viagens por distrito ───────────────────
// Substitui o pie chart original.
// Justificativa Munzner: posição em eixo comum tem maior eficácia que ângulo.
export async function loadTripsPerBoroughBarChart(data, svgSelector, borough_type = 'pu_borough', margens = { left: 90, right: 60, top: 40, bottom: 50 }) {
    const svg = d3.select(svgSelector);
    if (svg.empty()) return;

    const width  = +svg.style("width").split("px")[0];
    const height = +svg.style("height").split("px")[0];
    const innerWidth  = width  - margens.left - margens.right;
    const innerHeight = height - margens.top  - margens.bottom;

    svg.append("text")
        .attr("x", width / 2).attr("y", 20)
        .attr("text-anchor", "middle").attr("fill", "currentColor")
        .attr("font-size", "14px").attr("font-weight", "bold")
        .text("Total de viagens por Distrito");

    const chartData = Array.isArray(data)
        ? data.map(d => ({ borough: d[borough_type], total_viagens: Number(d.total_viagens) }))
        : [];

    chartData.sort((a, b) => d3.descending(a.total_viagens, b.total_viagens));

    const y = d3.scaleBand()
        .domain(chartData.map(d => d.borough))
        .range([0, innerHeight]).padding(0.25);

    const x = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.total_viagens) || 0])
        .range([0, innerWidth]);

    const mainGroup = svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`);

    mainGroup.selectAll("rect")
        .data(chartData).join("rect")
        .attr("y", d => y(d.borough)).attr("x", 0)
        .attr("height", y.bandwidth())
        .attr("width", d => x(d.total_viagens))
        // Cor categórica consistente com os demais gráficos
        .attr("fill", d => BOROUGH_COLORS(d.borough))
        .append("title")
        .text(d => `${d.borough}: ${d.total_viagens.toLocaleString()} viagens`);

    // Rótulo numérico no fim de cada barra
    mainGroup.selectAll(".bar-label")
        .data(chartData).join("text")
        .attr("class", "bar-label")
        .attr("x", d => x(d.total_viagens) + 6)
        .attr("y", d => y(d.borough) + y.bandwidth() / 2)
        .attr("dominant-baseline", "middle")
        .attr("font-size", "11px").attr("fill", "currentColor")
        .text(d => d.total_viagens.toLocaleString());

    mainGroup.append("g")
        .call(d3.axisLeft(y))
        .call(g => g.selectAll("text").attr("font-size", "11px"));

    mainGroup.append("g")
        .attr("transform", `translate(0, ${innerHeight})`)
        .call(d3.axisBottom(x).ticks(5).tickFormat(d => d.toLocaleString()))
        .call(g => g.selectAll("text").attr("font-size", "11px"))
        .call(g => g.append("text")
            .attr("x", innerWidth / 2).attr("y", 45)
            .attr("text-anchor", "middle").attr("fill", "currentColor")
            .attr("font-size", "12px").attr("font-weight", "bold")
            .text("Total de viagens"));
}

// ─── 3. LINE CHART — Ganho médio por dia da semana ───────────────────────────
// Tarefa: comparar variação de lucratividade ao longo da semana entre distritos.
// Canal: posição Y (ganho) + matiz consistente com BOROUGH_COLORS.
// Insight: Brooklyn sobe no fim de semana, Bronx cai na segunda-feira.
export async function loadEarnPerWeekdayLineChart(data, svgSelector, borough_type = 'pu_borough', metricLabel = 'US$/min', margens = { left: 55, right: 110, top: 40, bottom: 50 }) {
    const svg = d3.select(svgSelector);
    if (svg.empty()) return;

    const width  = +svg.style("width").split("px")[0];
    const height = +svg.style("height").split("px")[0];
    const innerWidth  = width  - margens.left - margens.right;
    const innerHeight = height - margens.top  - margens.bottom;

    svg.append("text")
        .attr("x", width / 2).attr("y", 20)
        .attr("text-anchor", "middle").attr("fill", "currentColor")
        .attr("font-size", "14px").attr("font-weight", "bold")
        .text(`Ganho médio por dia da semana (${metricLabel})`);

    // Ordem do eixo X: começa na segunda-feira
    const weekdays = ["Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado", "Domingo"];
    // strftime '%w' retorna 0=Dom, remapeamos para o label correto
    const weekdaysByNumber = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];

    const chartData = Array.isArray(data)
        ? data.map(d => ({
            borough: d[borough_type],
            weekday: weekdaysByNumber[Number(d.day_num)],
            mean_earn: Number(d.mean_earn)
        }))
        : [];

    const groupedData = Array.from(
        d3.group(chartData, d => d.borough),
        ([borough, values]) => ({
            borough,
            values: values.sort((a, b) => weekdays.indexOf(a.weekday) - weekdays.indexOf(b.weekday))
        })
    );

    const x = d3.scalePoint().domain(weekdays).range([0, innerWidth]).padding(0.4);

    // Eixo Y começa no décimo imediatamente abaixo do menor valor observado
    const minEarn = d3.min(chartData, d => d.mean_earn) || 0;
    const maxEarn = d3.max(chartData, d => d.mean_earn) || 0;
    const yMin = Math.max(0, Math.floor(minEarn * 10) / 10);
    const y = d3.scaleLinear()
        .domain([yMin, maxEarn])
        .range([innerHeight, 0]);

    const line = d3.line()
        .x(d => x(d.weekday))
        .y(d => y(d.mean_earn));

    const mainGroup = svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`);

    mainGroup.selectAll(".borough-line")
        .data(groupedData).join("path")
        .attr("class", "borough-line").attr("fill", "none")
        .attr("stroke", d => BOROUGH_COLORS(d.borough))
        .attr("stroke-width", 2)
        .attr("d", d => line(d.values));

    // Pontos sobre cada linha para facilitar leitura de valores exatos
    mainGroup.selectAll(".borough-point")
        .data(chartData).join("circle")
        .attr("class", "borough-point")
        .attr("cx", d => x(d.weekday)).attr("cy", d => y(d.mean_earn))
        .attr("r", 3).attr("fill", d => BOROUGH_COLORS(d.borough))
        .append("title")
        .text(d => `${d.borough} - ${d.weekday}: ${d.mean_earn.toFixed(2)} ${metricLabel}`);

    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${height - margens.bottom})`)
        .call(d3.axisBottom(x))
        .call(g => g.selectAll("text").attr("font-size", "11px").attr("text-anchor", "middle"))
        .call(g => g.append("text")
            .attr("x", innerWidth / 2).attr("y", 45)
            .attr("text-anchor", "middle").attr("fill", "currentColor")
            .attr("font-size", "12px").attr("font-weight", "bold")
            .text("Dia da semana"));

    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`)
        .call(d3.axisLeft(y).tickFormat(v => v.toFixed(2)))
        .call(g => g.append("text")
            .attr("x", -40).attr("y", -12)
            .attr("fill", "currentColor").attr("text-anchor", "start")
            .attr("font-size", "12px").attr("font-weight", "bold")
            .text(`Ganho (${metricLabel})`));

    // Legenda com as mesmas cores da paleta global
    const legend = svg.append("g")
        .attr("transform", `translate(${margens.left + innerWidth + 16}, ${margens.top + 10})`);

    const legendItems = legend.selectAll("g")
        .data(groupedData).join("g")
        .attr("transform", (d, i) => `translate(0, ${i * 18})`);

    legendItems.append("line")
        .attr("x1", 0).attr("x2", 18).attr("y1", 6).attr("y2", 6)
        .attr("stroke", d => BOROUGH_COLORS(d.borough)).attr("stroke-width", 2);

    legendItems.append("text")
        .attr("x", 24).attr("y", 10)
        .attr("fill", "currentColor").attr("font-size", "11px")
        .text(d => d.borough);
}

// ─── 4. HEATMAP — Ganho médio por par embarque → desembarque ─────────────────
// Tarefa: identificar quais trajetos são mais lucrativos para o taxista.
// Escala sequencial de cores (luminância): azul mais escuro = ganho maior.
// Escala divergente seria mais adequada se houvesse um ponto médio de referência,
// mas aqui todos os valores são positivos, então sequencial é a escolha correta.
export async function loadEarnHeatMap(data, svgSelector, metricLabel = 'US$/min', margens = { left: 75, right: 25, top: 40, bottom: 50 }) {
    const svg = d3.select(svgSelector);
    if (svg.empty()) return;

    const width  = +svg.style("width").split("px")[0];
    const height = +svg.style("height").split("px")[0];
    const innerWidth  = width  - margens.left - margens.right;
    const innerHeight = height - margens.top  - margens.bottom;

    svg.append("text")
        .attr("x", width / 2).attr("y", 20)
        .attr("text-anchor", "middle").attr("fill", "currentColor")
        .attr("font-size", "14px").attr("font-weight", "bold")
        .text(`Ganho médio por trajeto (${metricLabel})`);

    const chartData = Array.isArray(data)
        ? data.map(d => ({ pu_borough: d.pu_borough, do_borough: d.do_borough, mean_earn: Number(d.mean_earn) }))
        : [];

    const puBoroughs = Array.from(new Set(chartData.map(d => d.pu_borough))).sort();
    const doBoroughs = Array.from(new Set(chartData.map(d => d.do_borough))).sort();

    // Indexa por chave composta para lookup O(1)
    const valuesByRoute = new Map(chartData.map(d => [`${d.pu_borough}|${d.do_borough}`, d.mean_earn]));

    const heatmapData = puBoroughs.flatMap(pu =>
        doBoroughs.map(dob => ({
            pu_borough: pu, do_borough: dob,
            mean_earn: valuesByRoute.get(`${pu}|${dob}`)
        }))
    );

    const x = d3.scaleBand().domain(doBoroughs).range([0, innerWidth]).padding(0.04);
    const y = d3.scaleBand().domain(puBoroughs).range([0, innerHeight]).padding(0.04);

    const earnValues = chartData.map(d => d.mean_earn).filter(Number.isFinite);
    const minEarn = d3.min(earnValues) || 0;
    const maxEarn = d3.max(earnValues) || 0;

    // Escala sequencial: todos os valores são positivos, luminância é suficiente
    const color = d3.scaleSequential()
        .domain([minEarn, maxEarn])
        .interpolator(d3.interpolateBlues); // azul claro → azul escuro

    const mainGroup = svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`);

    mainGroup.selectAll("rect")
        .data(heatmapData).join("rect")
        .attr("x", d => x(d.do_borough)).attr("y", d => y(d.pu_borough))
        .attr("width", x.bandwidth()).attr("height", y.bandwidth())
        .attr("fill", d => Number.isFinite(d.mean_earn) ? color(d.mean_earn) : "#f2f2f2")
        .attr("stroke", "#ffffff").attr("stroke-width", 2)
        .append("title")
        .text(d => `${d.pu_borough} → ${d.do_borough}: ${Number.isFinite(d.mean_earn) ? d.mean_earn.toFixed(2) : "sem dados"} ${metricLabel}`);

    // Rótulo numérico — texto escuro em células claras, branco em células escuras
    mainGroup.selectAll(".cell-label")
        .data(heatmapData).join("text")
        .attr("class", "cell-label")
        .attr("x", d => x(d.do_borough) + x.bandwidth() / 2)
        .attr("y", d => y(d.pu_borough) + y.bandwidth() / 2)
        .attr("text-anchor", "middle").attr("dominant-baseline", "middle")
        .attr("fill", d => d.mean_earn > (minEarn + maxEarn) / 2 ? "#ffffff" : "#1f2933")
        .attr("font-size", "12px").attr("font-weight", "bold")
        .text(d => Number.isFinite(d.mean_earn) ? d.mean_earn.toFixed(2) : "");

    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top + innerHeight})`)
        .call(d3.axisBottom(x))
        .call(g => g.selectAll("text").attr("font-size", "11px").attr("text-anchor", "middle"))
        .call(g => g.append("text")
            .attr("x", innerWidth / 2).attr("y", 45)
            .attr("text-anchor", "middle").attr("fill", "currentColor")
            .attr("font-size", "12px").attr("font-weight", "bold")
            .text("Distrito de desembarque"));

    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`)
        .call(d3.axisLeft(y))
        .call(g => g.selectAll("text").attr("font-size", "11px"))
        .call(g => g.append("text")
            .attr("x", -60).attr("y", -12)
            .attr("text-anchor", "start").attr("fill", "currentColor")
            .attr("font-size", "12px").attr("font-weight", "bold")
            .text("Distrito de embarque"));

    // Legenda de escala de cor (barra gradiente horizontal)
    // Indica ao leitor o que a luminância representa sem precisar decorar os valores
    const legendWidth = 120;
    const legendHeight = 10;
    const legendX = margens.left + innerWidth - legendWidth;
    const legendY = margens.top - 20;

    // Definição do gradiente linear no defs do SVG
    const defs = svg.append("defs");
    const gradientId = "heatmap-gradient";
    const gradient = defs.append("linearGradient")
        .attr("id", gradientId)
        .attr("x1", "0%").attr("x2", "100%");

    gradient.append("stop").attr("offset", "0%").attr("stop-color", color(minEarn));
    gradient.append("stop").attr("offset", "100%").attr("stop-color", color(maxEarn));

    // Retângulo preenchido com o gradiente
    svg.append("rect")
        .attr("x", legendX).attr("y", legendY)
        .attr("width", legendWidth).attr("height", legendHeight)
        .attr("fill", `url(#${gradientId})`)
        .attr("stroke", "#ccc").attr("stroke-width", 0.5);

    // Rótulos de mínimo e máximo nas extremidades
    svg.append("text")
        .attr("x", legendX).attr("y", legendY - 3)
        .attr("text-anchor", "start").attr("font-size", "10px").attr("fill", "currentColor")
        .text(minEarn.toFixed(2));

    svg.append("text")
        .attr("x", legendX + legendWidth).attr("y", legendY - 3)
        .attr("text-anchor", "end").attr("font-size", "10px").attr("fill", "currentColor")
        .text(maxEarn.toFixed(2));

    svg.append("text")
        .attr("x", legendX + legendWidth / 2).attr("y", legendY - 3)
        .attr("text-anchor", "middle").attr("font-size", "10px").attr("fill", "#666")
        .text(metricLabel);
}

// ─── 5. RIDGELINE — Ganho médio por hora do dia, por distrito ──────────────────
// Tarefa: identificar horários de pico de lucratividade em cada distrito.
// Escala Y local por distrito: cada curva usa sua própria amplitude mínima/máxima,
// evitando que distritos com menor variação apareçam achatados.
// Cores consistentes com BOROUGH_COLORS — mesma cor do mesmo distrito em todos os gráficos.
export async function loadEarnRidgeline(data, svgSelector, borough_type = 'pu_borough', metricLabel = 'US$/min', margens = { left: 110, right: 25, top: 40, bottom: 50 }) {
    const svg = d3.select(svgSelector);
    if (svg.empty()) return;

    const width  = +svg.style("width").split("px")[0];
    const height = +svg.style("height").split("px")[0];
    const innerWidth  = width  - margens.left - margens.right;
    const innerHeight = height - margens.top  - margens.bottom;

    svg.append("text")
        .attr("x", width / 2).attr("y", 20)
        .attr("text-anchor", "middle").attr("fill", "currentColor")
        .attr("font-size", "14px").attr("font-weight", "bold")
        .text(`Ganho médio por hora do dia, por Distrito (${metricLabel})`);

    const chartData = Array.isArray(data)
        ? data.map(d => ({ borough: d[borough_type], hour: Number(d.hour), mean_earn: Number(d.mean_earn) }))
        : [];

    const boroughs = Array.from(new Set(chartData.map(d => d.borough))).sort();
    const hours = Array.from({ length: 24 }, (_, i) => i);

    // Escala X compartilhada por todos os distritos
    const x = d3.scaleLinear().domain([0, 23]).range([0, innerWidth]);

    const bandHeight  = innerHeight / boroughs.length;
    const curveHeight = bandHeight * 1.3;

    const mainGroup = svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`);

    boroughs.forEach((borough, i) => {
        const boroughData = chartData.filter(d => d.borough === borough);

        // Garante 24 pontos — preenche horas sem dados com 0
        const byHour = new Map(boroughData.map(d => [d.hour, d.mean_earn]));
        const fullData = hours.map(h => ({ hour: h, mean_earn: byHour.get(h) ?? 0 }));

        const baseY = (i + 1) * bandHeight;

        // Escala Y local: amplitude própria de cada distrito
        const localMin = d3.min(fullData, d => d.mean_earn);
        const localMax = d3.max(fullData, d => d.mean_earn);
        const yLocal = d3.scaleLinear()
            .domain([localMin, localMax])
            .range([0, -curveHeight]);

        const area = d3.area()
            .x(d => x(d.hour)).y0(0).y1(d => yLocal(d.mean_earn))
            .curve(d3.curveCatmullRom);

        const line = d3.line()
            .x(d => x(d.hour)).y(d => yLocal(d.mean_earn))
            .curve(d3.curveCatmullRom);

        const g = mainGroup.append("g")
            .attr("transform", `translate(0, ${baseY})`);

        g.append("path").datum(fullData)
            .attr("d", area)
            .attr("fill", BOROUGH_COLORS(borough))
            .attr("fill-opacity", 0.5);

        g.append("path").datum(fullData)
            .attr("d", line).attr("fill", "none")
            .attr("stroke", BOROUGH_COLORS(borough))
            .attr("stroke-width", 2);

        // Linha de base da faixa
        g.append("line")
            .attr("x1", 0).attr("x2", innerWidth)
            .attr("y1", 0).attr("y2", 0)
            .attr("stroke", "#ccc").attr("stroke-width", 0.5);

        // Rótulo do distrito centralizado verticalmente na curva
        g.append("text")
            .attr("x", -10).attr("y", -curveHeight / 2)
            .attr("text-anchor", "end").attr("dominant-baseline", "middle")
            .attr("font-size", "12px").attr("font-weight", "bold")
            .attr("fill", BOROUGH_COLORS(borough))
            .text(borough);
    });

    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top + innerHeight})`)
        .call(d3.axisBottom(x).ticks(24).tickFormat(h => `${h}h`))
        .call(g => g.selectAll("text").attr("font-size", "10px"))
        .call(g => g.append("text")
            .attr("x", innerWidth / 2).attr("y", 45)
            .attr("text-anchor", "middle").attr("fill", "currentColor")
            .attr("font-size", "12px").attr("font-weight", "bold")
            .text("Hora do dia"));
}

// Limpa elementos residuais de renders anteriores
export function clearChart(svgSelector = 'svg') {
    d3.select(svgSelector).selectAll('#group').selectAll('circle').remove();
    d3.select(svgSelector).selectAll('#axisX').selectAll('*').remove();
    d3.select(svgSelector).selectAll('#axisY').selectAll('*').remove();
}
