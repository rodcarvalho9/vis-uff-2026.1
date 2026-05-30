import { Taxi } from "./taxi";
import {
    loadEarnPerBoroughBarplot,
    loadTripsPerBoroughBarChart,
    loadEarnPerWeekdayLineChart,
    loadEarnHeatMap,
    loadEarnRidgeline
} from './plot';

// Seletores de todos os SVGs para o clearAll
const CHART_SELECTORS = [
    '#chart-earn-per-borough',
    '#chart-trips-per-borough',
    '#chart-earn-per-weekday',
    '#chart-earn-heatmap',
    '#chart-ridgeline'
];

// Estado global das duas interações
// boroughType controla embarque (pu_borough) ou desembarque (do_borough)
// metric controla ganho por minuto ou ganho por quilômetro
let boroughType = 'pu_borough';
let metric = 'min';

// Instância global do Taxi para reutilizar nas re-renderizações
let taxi;

// Remove todos os elementos filhos dos SVGs sem recarregar a página
function clearAll() {
    CHART_SELECTORS.forEach(selector => {
        const chart = document.querySelector(selector);
        if (chart) chart.replaceChildren();
    });
}

// Busca os dados com as configurações atuais e redesenha todos os gráficos
async function renderAll() {
    clearAll();

    const earn_data      = await taxi.query(generateEarnPerBoroughSQL(boroughType, metric));
    const trips_data     = await taxi.query(generateTripsPerBoroughSQL(boroughType));
    const weekday_data   = await taxi.query(generateEarnPerWeekdaySQL(boroughType, metric));
    const heatmap_data   = await taxi.query(generateEarnHeatMapSQL(metric));
    const ridgeline_data = await taxi.query(generateRidgelineSQL(boroughType, metric));

    const metricLabel = metric === 'min' ? 'US$/min' : 'US$/km';

    await loadEarnPerBoroughBarplot(earn_data, '#chart-earn-per-borough', boroughType, metricLabel);
    await loadTripsPerBoroughBarChart(trips_data, '#chart-trips-per-borough', boroughType);
    await loadEarnPerWeekdayLineChart(weekday_data, '#chart-earn-per-weekday', boroughType, metricLabel);
    await loadEarnHeatMap(heatmap_data, '#chart-earn-heatmap', metricLabel);
    await loadEarnRidgeline(ridgeline_data, '#chart-ridgeline', boroughType, metricLabel);
}

// Registra os eventos dos botões de toggle e Load/Clear
function setupControls() {
    // Toggle embarque ↔ desembarque
    document.querySelector('#btn-pu').addEventListener('click', async () => {
        boroughType = 'pu_borough';
        document.querySelector('#btn-pu').classList.add('active');
        document.querySelector('#btn-do').classList.remove('active');
        await renderAll();
    });

    document.querySelector('#btn-do').addEventListener('click', async () => {
        boroughType = 'do_borough';
        document.querySelector('#btn-do').classList.add('active');
        document.querySelector('#btn-pu').classList.remove('active');
        await renderAll();
    });

    // Toggle ganho/min ↔ ganho/km
    document.querySelector('#btn-min').addEventListener('click', async () => {
        metric = 'min';
        document.querySelector('#btn-min').classList.add('active');
        document.querySelector('#btn-dist').classList.remove('active');
        await renderAll();
    });

    document.querySelector('#btn-dist').addEventListener('click', async () => {
        metric = 'dist';
        document.querySelector('#btn-dist').classList.add('active');
        document.querySelector('#btn-min').classList.remove('active');
        await renderAll();
    });

    // Botões Load e Clear
    document.querySelector('#loadBtn').addEventListener('click', async () => await renderAll());
    document.querySelector('#clearBtn').addEventListener('click', () => clearAll());
}

// Ganho médio por distrito
// Divisor muda conforme a métrica selecionada: minutos ou distância em km (milhas * 1.609)
function generateEarnPerBoroughSQL(boroughType = 'pu_borough', metric = 'min') {
    const divisor = metric === 'min'
        ? 'trip_duration_minutes'
        : 'trip_distance * 1.609'; // converte milhas para km
    return `
        WITH metric AS (
            SELECT
                ${boroughType},
                (fare_amount + extra) / (${divisor}) AS base_earn,
                tip_amount / (${divisor}) AS tip_earn
            FROM taxi_2025
        )
        SELECT
            ${boroughType},
            AVG(base_earn) + AVG(tip_earn) AS mean_earn
        FROM metric
        GROUP BY ${boroughType}
        ORDER BY mean_earn DESC
    `;
}

// Total de corridas por distrito
function generateTripsPerBoroughSQL(boroughType = 'pu_borough') {
    return `
        SELECT ${boroughType}, COUNT(*) AS total_viagens
        FROM taxi_2025
        GROUP BY ${boroughType}
        ORDER BY total_viagens DESC
    `;
}

// Ganho médio por distrito e dia da semana
// strftime '%w': 0=Dom, 1=Seg, ..., 6=Sab
function generateEarnPerWeekdaySQL(boroughType = 'pu_borough', metric = 'min') {
    const divisor = metric === 'min'
        ? 'trip_duration_minutes'
        : 'trip_distance * 1.609';
    return `
        WITH metric AS (
            SELECT
                ${boroughType},
                CAST(strftime(lpep_pickup_datetime, '%w') AS INTEGER) AS day_num,
                (fare_amount + extra) / (${divisor}) AS base_earn,
                tip_amount / (${divisor}) AS tip_earn
            FROM taxi_2025
        )
        SELECT
            ${boroughType},
            day_num,
            AVG(base_earn) + AVG(tip_earn) AS mean_earn
        FROM metric
        GROUP BY ${boroughType}, day_num
        ORDER BY ${boroughType}, day_num
    `;
}

// Ganho médio por par embarque → desembarque (heatmap)
function generateEarnHeatMapSQL(metric = 'min') {
    const divisor = metric === 'min'
        ? 'trip_duration_minutes'
        : 'trip_distance * 1.609';
    return `
        WITH metric AS (
            SELECT
                pu_borough, do_borough,
                (fare_amount + extra) / (${divisor}) AS base_earn,
                tip_amount / (${divisor}) AS tip_earn
            FROM taxi_2025
        )
        SELECT
            pu_borough, do_borough,
            AVG(base_earn) + AVG(tip_earn) AS mean_earn
        FROM metric
        GROUP BY pu_borough, do_borough
        ORDER BY pu_borough, do_borough
    `;
}

// Ganho médio por distrito e hora do dia (ridgeline)
function generateRidgelineSQL(boroughType = 'pu_borough', metric = 'min') {
    const divisor = metric === 'min'
        ? 'trip_duration_minutes'
        : 'trip_distance * 1.609';
    return `
        WITH metric AS (
            SELECT
                ${boroughType},
                CAST(strftime(lpep_pickup_datetime, '%H') AS INTEGER) AS hour,
                (fare_amount + extra) / (${divisor}) AS base_earn,
                tip_amount / (${divisor}) AS tip_earn
            FROM taxi_2025
        )
        SELECT
            ${boroughType},
            hour,
            AVG(base_earn) + AVG(tip_earn) AS mean_earn
        FROM metric
        GROUP BY ${boroughType}, hour
        ORDER BY ${boroughType}, hour
    `;
}

// Ponto de entrada: inicializa DuckDB, carrega o parquet e configura os controles
window.onload = async () => {
    taxi = new Taxi();
    await taxi.init();
    await taxi.loadTaxi();
    setupControls();
};