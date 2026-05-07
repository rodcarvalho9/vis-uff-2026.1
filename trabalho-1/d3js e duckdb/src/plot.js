import * as d3 from 'd3';

export async function loadEarnPerBoroughBarplot(data, svgSelector, borough_type = 'pu_borough', margens = { left: 50, right: 25, top: 25, bottom: 50 }){
    const svg = d3.select(svgSelector);

    if (svg.empty()) {
        return;
    }

    const chartData = Array.isArray(data)
        ? data.map(d => ({ 
            borough: d[borough_type], 
            mean_earn: d.mean_earn 
        }))
        : Array.from(data, ([borough, mean_earn]) => ({ borough: borough, mean_earn: mean_earn }));

    chartData.sort((a, b) => d3.descending(a.mean_earn, b.mean_earn));

    // Declare the x (horizontal position) scale.
    const x = d3.scaleBand()
        .domain(chartData.map(d => d.borough))
        .range([0, +svg.style("width").split("px")[0] - margens.left - margens.right])
        .padding(0.1);
  
    // Declare the y (vertical position) scale.
    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.mean_earn) || 0])
        .range([+svg.style("height").split("px")[0] - margens.bottom - margens.top, 0]);

    // Create main group for bars with margins
    const mainGroup = svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`);

    // Add a rect for each bar.
    mainGroup.selectAll("rect")
        .data(chartData)
        .join("rect")
        .attr("fill", "steelblue")
        .attr("x", (d) => x(d.borough))
        .attr("y", (d) => y(d.mean_earn))
        .attr("height", (d) => y(0) - y(d.mean_earn))
        .attr("width", x.bandwidth());

    // Add the x-axis and label.
    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${+svg.style('height').split('px')[0] - margens.bottom})`)
        .call(d3.axisBottom(x))
        .call(g => g.selectAll("text")
            .attr("font-size", "11px")
            .attr("text-anchor", "middle"))
        .call(g => g.append("text")
            .attr("x", (+svg.style("width").split("px")[0] - margens.left - margens.right) / 2)
            .attr("y", 45)
            .attr("text-anchor", "middle")
            .attr("fill", "currentColor")
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .text("Bairro"));

    // Add the y-axis and label.
    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`)
        .call(d3.axisLeft(y).tickFormat((value) => value.toFixed(2)))
        .call(g => g.append("text")
            .attr("x", -35)
            .attr("y", -12)
            .attr("fill", "currentColor")
            .attr("text-anchor", "start")
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .text("Ganho médio"));

}

export async function loadTripsPerBoroughPieChart(data, svgSelector, borough_type = 'pu_borough', margens = { left: 25, right: 25, top: 25, bottom: 25 }){
    const svg = d3.select(svgSelector);

    if (svg.empty()) {
        return;
    }

    const width = +svg.style("width").split("px")[0];
    const height = +svg.style("height").split("px")[0];
    const innerWidth = width - margens.left - margens.right;
    const innerHeight = height - margens.top - margens.bottom;
    const radius = Math.min(innerWidth, innerHeight) / 2;

    svg.append("text")
        .attr("x", width / 2)
        .attr("y", 12)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .attr("font-size", "14px")
        .attr("font-weight", "bold")
        .text("Viagens por bairro");

    const chartData = Array.isArray(data)
        ? data.map(d => ({
            borough: d[borough_type],
            total_viagens: Number(d.total_viagens)
        }))
        : Array.from(data, ([borough, total_viagens]) => ({ borough, total_viagens: Number(total_viagens) }));

    const color = d3.scaleOrdinal()
        .domain(chartData.map(d => d.borough))
        .range(d3.schemeTableau10);

    const pie = d3.pie()
        .sort(null)
        .value(d => d.total_viagens);

    const arc = d3.arc()
        .innerRadius(0)
        .outerRadius(radius);

    const labelArc = d3.arc()
        .innerRadius(radius * 0.65)
        .outerRadius(radius * 0.65);

    const mainGroup = svg.append("g")
        .attr("transform", `translate(${margens.left + innerWidth / 2}, ${margens.top + innerHeight / 2})`);

    mainGroup.selectAll("path")
        .data(pie(chartData))
        .join("path")
        .attr("d", arc)
        .attr("fill", d => color(d.data.borough))
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 2)
        .append("title")
        .text(d => `${d.data.borough}: ${d.data.total_viagens}`);

    mainGroup.selectAll("text")
        .data(pie(chartData))
        .join("text")
        .attr("transform", d => `translate(${labelArc.centroid(d)})`)
        .attr("text-anchor", "middle")
        .attr("fill", "#000000")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .text(d => d.data.borough);
}

export async function loadEarnPerWeekdayLineChart(data, svgSelector, borough_type = 'pu_borough', margens = { left: 50, right: 25, top: 25, bottom: 50 }){
    const svg = d3.select(svgSelector);

    if (svg.empty()) {
        return;
    }

    const width = +svg.style("width").split("px")[0];
    const height = +svg.style("height").split("px")[0];
    const innerWidth = width - margens.left - margens.right;
    const innerHeight = height - margens.top - margens.bottom;
    const weekdays = ["Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado", "Domingo"];
    const weekdaysByNumber = ["Domingo", "Segunda", "Terca", "Quarta", "Quinta", "Sexta", "Sabado"];

    function weekdayNumberToLabel(dayNumber) {
        return weekdaysByNumber[Number(dayNumber)];
    }

    const chartData = Array.isArray(data)
        ? data.map(d => ({
            borough: d[borough_type],
            weekday: weekdayNumberToLabel(d.day_num),
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

    const x = d3.scalePoint()
        .domain(weekdays)
        .range([0, innerWidth])
        .padding(0.4);

    const minEarn = d3.min(chartData, d => d.mean_earn) || 0;
    const maxEarn = d3.max(chartData, d => d.mean_earn) || 0;
    const yStart = Math.max(0, Math.floor(minEarn));

    const y = d3.scaleLinear()
        .domain([yStart, maxEarn])
        .nice()
        .range([innerHeight, 0]);

    const color = d3.scaleOrdinal()
        .domain(groupedData.map(d => d.borough))
        .range(d3.schemeTableau10);

    const line = d3.line()
        .x(d => x(d.weekday))
        .y(d => y(d.mean_earn));

    const mainGroup = svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`);

    mainGroup.selectAll(".borough-line")
        .data(groupedData)
        .join("path")
        .attr("class", "borough-line")
        .attr("fill", "none")
        .attr("stroke", d => color(d.borough))
        .attr("stroke-width", 2)
        .attr("d", d => line(d.values));

    mainGroup.selectAll(".borough-point")
        .data(chartData)
        .join("circle")
        .attr("class", "borough-point")
        .attr("cx", d => x(d.weekday))
        .attr("cy", d => y(d.mean_earn))
        .attr("r", 3)
        .attr("fill", d => color(d.borough))
        .append("title")
        .text(d => `${d.borough} - ${d.weekday}: ${d.mean_earn.toFixed(2)}`);

    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${height - margens.bottom})`)
        .call(d3.axisBottom(x))
        .call(g => g.selectAll("text")
            .attr("font-size", "11px")
            .attr("text-anchor", "middle"))
        .call(g => g.append("text")
            .attr("x", innerWidth / 2)
            .attr("y", 45)
            .attr("text-anchor", "middle")
            .attr("fill", "currentColor")
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .text("Dia da semana"));

    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`)
        .call(d3.axisLeft(y).tickFormat(value => value.toFixed(2)))
        .call(g => g.append("text")
            .attr("x", -35)
            .attr("y", -12)
            .attr("fill", "currentColor")
            .attr("text-anchor", "start")
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .text("Ganho médio"));

    const legend = svg.append("g")
        .attr("transform", `translate(${margens.left + 10}, ${margens.top + 10})`);

    const legendItems = legend.selectAll("g")
        .data(groupedData)
        .join("g")
        .attr("transform", (d, i) => `translate(0, ${i * 18})`);

    legendItems.append("line")
        .attr("x1", 0)
        .attr("x2", 18)
        .attr("y1", 6)
        .attr("y2", 6)
        .attr("stroke", d => color(d.borough))
        .attr("stroke-width", 2);

    legendItems.append("text")
        .attr("x", 24)
        .attr("y", 10)
        .attr("fill", "currentColor")
        .attr("font-size", "11px")
        .text(d => d.borough);
}

export async function loadEarnHeatMap(data, svgSelector, margens = { left: 75, right: 25, top: 25, bottom: 50 }){
    const svg = d3.select(svgSelector);

    if (svg.empty()) {
        return;
    }

    const width = +svg.style("width").split("px")[0];
    const height = +svg.style("height").split("px")[0];
    const innerWidth = width - margens.left - margens.right;
    const innerHeight = height - margens.top - margens.bottom;

    const chartData = Array.isArray(data)
        ? data.map(d => ({
            pu_borough: d.pu_borough,
            do_borough: d.do_borough,
            mean_earn: Number(d.mean_earn)
        }))
        : [];

    const puBoroughs = Array.from(new Set(chartData.map(d => d.pu_borough))).sort();
    const doBoroughs = Array.from(new Set(chartData.map(d => d.do_borough))).sort();
    const valuesByRoute = new Map(
        chartData.map(d => [`${d.pu_borough}|${d.do_borough}`, d.mean_earn])
    );

    const heatmapData = puBoroughs.flatMap(pu_borough =>
        doBoroughs.map(do_borough => ({
            pu_borough,
            do_borough,
            mean_earn: valuesByRoute.get(`${pu_borough}|${do_borough}`)
        }))
    );

    const x = d3.scaleBand()
        .domain(doBoroughs)
        .range([0, innerWidth])
        .padding(0.04);

    const y = d3.scaleBand()
        .domain(puBoroughs)
        .range([0, innerHeight])
        .padding(0.04);

    const earnValues = chartData
        .map(d => d.mean_earn)
        .filter(value => Number.isFinite(value));
    const minEarn = d3.min(earnValues) || 0;
    const maxEarn = d3.max(earnValues) || 0;

    const color = d3.scaleSequential()
        .domain([minEarn, maxEarn])
        .interpolator(d3.interpolateGreens);

    const mainGroup = svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`);

    mainGroup.selectAll("rect")
        .data(heatmapData)
        .join("rect")
        .attr("x", d => x(d.do_borough))
        .attr("y", d => y(d.pu_borough))
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .attr("fill", d => Number.isFinite(d.mean_earn) ? color(d.mean_earn) : "#f2f2f2")
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 2)
        .append("title")
        .text(d => {
            const value = Number.isFinite(d.mean_earn)
                ? d.mean_earn.toFixed(2)
                : "sem dados";
            return `${d.pu_borough} -> ${d.do_borough}: ${value}`;
        });

    mainGroup.selectAll("text")
        .data(heatmapData)
        .join("text")
        .attr("x", d => x(d.do_borough) + x.bandwidth() / 2)
        .attr("y", d => y(d.pu_borough) + y.bandwidth() / 2)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("fill", d => d.mean_earn > (minEarn + maxEarn) / 2 ? "#ffffff" : "#1f2933")
        .attr("font-size", "12px")
        .attr("font-weight", "bold")
        .text(d => Number.isFinite(d.mean_earn) ? d.mean_earn.toFixed(2) : "");

    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top + innerHeight})`)
        .call(d3.axisBottom(x))
        .call(g => g.selectAll("text")
            .attr("font-size", "11px")
            .attr("text-anchor", "middle"))
        .call(g => g.append("text")
            .attr("x", innerWidth / 2)
            .attr("y", 45)
            .attr("text-anchor", "middle")
            .attr("fill", "currentColor")
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .text("Bairro de desembarque"));

    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`)
        .call(d3.axisLeft(y))
        .call(g => g.selectAll("text").attr("font-size", "11px"))
        .call(g => g.append("text")
            .attr("x", -60)
            .attr("y", -12)
            .attr("text-anchor", "start")
            .attr("fill", "currentColor")
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .text("Bairro de embarque"));
}

export function clearChart(svgSelector = 'svg') {
    d3.select(svgSelector)
        .selectAll('#group')
        .selectAll('circle')
        .remove();

    d3.select(svgSelector)
        .selectAll('#axisX')
        .selectAll('*')
        .remove();

    d3.select(svgSelector)
        .selectAll('#axisY')
        .selectAll('*')
        .remove();
    }

