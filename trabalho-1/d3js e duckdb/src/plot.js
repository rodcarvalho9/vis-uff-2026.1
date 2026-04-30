import * as d3 from 'd3';

export async function loadMeanFarePerMinuteBarChart(data, svgSelector, margens = { left: 50, right: 25, top: 25, bottom: 50 }){
    const svg = d3.select(svgSelector);

    if (!svg) {
        return;
    }
        
    const chartData = Array.isArray(data)
        ? data.map(d => ({ borough: d.pu_borough, fare_per_minute_mean: d.fare_per_minute_mean }))
        : Array.from(data, ([pu_borough, fare_per_minute_mean]) => ({ borough: pu_borough, fare_per_minute_mean }));

    chartData.sort((a, b) => d3.descending(a.fare_per_minute_mean, b.fare_per_minute_mean));

    // Declare the x (horizontal position) scale.
    const x = d3.scaleBand()
        .domain(chartData.map(d => d.borough))
        .range([0, +svg.style("width").split("px")[0] - margens.left - margens.right])
        .padding(0.1);
  
    // Declare the y (vertical position) scale.
    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.fare_per_minute_mean) || 0])
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
        .attr("y", (d) => y(d.fare_per_minute_mean))
        .attr("height", (d) => y(0) - y(d.fare_per_minute_mean))
        .attr("width", x.bandwidth());

    // Add the x-axis and label.
    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${+svg.style('height').split('px')[0] - margens.bottom})`)
        .call(d3.axisBottom(x).tickSizeOuter(0));

    // Add the y-axis and label.
    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`)
        .call(d3.axisLeft(y).tickFormat((value) => value.toFixed(2)).tickSizeOuter(0))
        .call(g => g.append("text")
            .attr("x", 0)
            .attr("y", -15)
            .attr("fill", "currentColor")
            .attr("text-anchor", "middle")
            .text("Mean Fare per Minute"));

    // Add x-axis label
    svg.append("text")
        .attr("x", margens.left + (+svg.style("width").split("px")[0] - margens.left - margens.right) / 2)
        .attr("y", +svg.style('height').split('px')[0] - margens.bottom + 30)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .attr("font-size", "12px")
        .text("Bairro");

}

export async function loadMeanFarePerMileBarChart(data, svgSelector, margens = { left: 50, right: 25, top: 25, bottom: 50 }){
    const svg = d3.select(svgSelector);

    if (!svg) {
        return;
    }
        
    const chartData = Array.isArray(data)
        ? data.map(d => ({ borough: d.pu_borough, fare_per_mile_mean: d.fare_per_mile_mean }))
        : Array.from(data, ([pu_borough, fare_per_mile_mean]) => ({ borough: pu_borough, fare_per_mile_mean: fare_per_mile_mean }));

    chartData.sort((a, b) => d3.descending(a.fare_per_mile_mean, b.fare_per_mile_mean));

    // Declare the x (horizontal position) scale.
    const x = d3.scaleBand()
        .domain(chartData.map(d => d.borough))
        .range([0, +svg.style("width").split("px")[0] - margens.left - margens.right])
        .padding(0.1);
  
    // Declare the y (vertical position) scale.
    const y = d3.scaleLinear()
        .domain([0, d3.max(chartData, d => d.fare_per_mile_mean) || 0])
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
        .attr("y", (d) => y(d.fare_per_mile_mean))
        .attr("height", (d) => y(0) - y(d.fare_per_mile_mean))
        .attr("width", x.bandwidth());

    // Add the x-axis and label.
    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${+svg.style('height').split('px')[0] - margens.bottom})`)
        .call(d3.axisBottom(x).tickSizeOuter(0));

    // Add the y-axis and label.
    svg.append("g")
        .attr("transform", `translate(${margens.left}, ${margens.top})`)
        .call(d3.axisLeft(y).tickFormat((value) => value.toFixed(2)).tickSizeOuter(0))
        .call(g => g.append("text")
            .attr("x", 0)
            .attr("y", -15)
            .attr("fill", "currentColor")
            .attr("text-anchor", "middle")
            .text("Mean Fare per Mile"));

    // Add x-axis label
    svg.append("text")
        .attr("x", margens.left + (+svg.style("width").split("px")[0] - margens.left - margens.right) / 2)
        .attr("y", +svg.style('height').split('px')[0] - margens.bottom + 30)
        .attr("text-anchor", "middle")
        .attr("fill", "currentColor")
        .attr("font-size", "12px")
        .text("Bairro");

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