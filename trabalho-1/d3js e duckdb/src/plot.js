import * as d3 from 'd3';

export async function loadMeanEarnPerMinuteBarChart(data, svgSelector, margens = { left: 50, right: 25, top: 50, bottom: 50 }){
    const svg = d3.select(svgSelector);

    if (!svg) {
        return;
    }
        
    const chartData = Array.isArray(data)
        ? data.map(d => {
            const boroughKey = d.pu_borough !== undefined ? 'pu_borough' : 'do_borough';
            return { 
                borough: d[boroughKey], 
                mean_earn_per_minute: d.mean_earn_per_minute 
            };
        })
        : Array.from(data, ([borough, mean_earn_per_minute]) => ({ borough: borough, mean_earn_per_minute: mean_earn_per_minute }));

    chartData.sort((a, b) => d3.descending(a.mean_earn_per_minute, b.mean_earn_per_minute));

    // Declare the x (horizontal position) scale.
    const x = d3.scaleBand()
        .domain(chartData.map(d => d.borough))
        .range([0, +svg.style("width").split("px")[0] - margens.left - margens.right])
        .padding(0.1);
  
    // Declare the y (vertical position) scale.
    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.mean_earn_per_minute) || 0])
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
        .attr("y", (d) => y(d.mean_earn_per_minute))
        .attr("height", (d) => y(0) - y(d.mean_earn_per_minute))
        .attr("width", x.bandwidth());

    // Add the x-axis and label.
    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${+svg.style('height').split('px')[0] - margens.bottom})`)
        .call(d3.axisBottom(x))
        .call(g => g.append("text")
            .attr("x", (+svg.style("width").split("px")[0] - margens.left - margens.right) / 2)
            .attr("y", 40)
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
            .attr("x", 20)
            .attr("y", -20)
            .attr("fill", "currentColor")
            .attr("text-anchor", "middle")
            .attr("font-size", "12px")
            .attr("font-weight", "bold")
            .text("Mean Earn per Minute"));

}

export async function loadTripsPerBoroughPieChart(data, svgSelector, margens = { left: 50, right: 25, top: 50, bottom: 50 }){
    const svg = d3.select(svgSelector);

    if (!svg) {
        return;
    }

    const width = +svg.style("width").split("px")[0];
    const height = +svg.style("height").split("px")[0];
    const innerWidth = width - margens.left - margens.right;
    const innerHeight = height - margens.top - margens.bottom;
    const radius = Math.min(innerWidth, innerHeight) / 2;

    const chartData = Array.isArray(data)
        ? data.map(d => {
            const boroughKey = d.pu_borough !== undefined ? 'pu_borough' : 'do_borough';
            return {
                borough: d[boroughKey],
                total_viagens: Number(d.total_viagens)
            };
        })
        : Array.from(data, ([borough, total_viagens]) => ({ borough, total_viagens: Number(total_viagens) }));

    //const validData = chartData.filter(d => d.borough && Number.isFinite(d.total_viagens) && d.total_viagens > 0);

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
