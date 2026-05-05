import { Taxi } from "./taxi";
import { loadMeanEarnPerMinuteBarChart, loadTripsPerBoroughPieChart } from './plot';

const CHART_SELECTORS = [
    '#chart-mean-earn-per-minute_pu',
    '#chart-mean-earn-per-minute_do',
    '#chart-trips-per-borough_pu',
    '#chart-trips-per-borough_do'
];

function callbacks(mean_earn_per_minute_pu_data, mean_earn_per_minute_do_data, trips_per_borough_pu_data, trips_per_borough_do_data) {
    const loadBtn  = document.querySelector('#loadBtn');
    const clearBtn = document.querySelector('#clearBtn');

    if (!loadBtn || !clearBtn) {
        return;
    }

    loadBtn.addEventListener('click', async () => {
        clearAll();
        await loadAll(mean_earn_per_minute_pu_data, mean_earn_per_minute_do_data, trips_per_borough_pu_data, trips_per_borough_do_data);
    });

    clearBtn.addEventListener('click', async () => {
        clearAll();
    });
}

async function loadAll(mean_earn_per_minute_pu_data, mean_earn_per_minute_do_data, trips_per_borough_pu_data, trips_per_borough_do_data) {
    await loadMeanEarnPerMinuteBarChart(mean_earn_per_minute_pu_data, '#chart-mean-earn-per-minute_pu');
    await loadMeanEarnPerMinuteBarChart(mean_earn_per_minute_do_data, '#chart-mean-earn-per-minute_do');
    await loadTripsPerBoroughPieChart(trips_per_borough_pu_data, '#chart-trips-per-borough_pu');
    await loadTripsPerBoroughPieChart(trips_per_borough_do_data, '#chart-trips-per-borough_do');
}

function clearAll() {
    CHART_SELECTORS.forEach((selector) => {
        const chart = document.querySelector(selector);

        if (chart) {
            chart.replaceChildren();
        }
    });
}

function generateEarnPerMinuteSQL(boroughType = 'pu_borough') {
    const boroughColumn = boroughType === 'do_borough' ? 'do_borough' : 'pu_borough';
    
    return `
        WITH metricas_por_viagem AS (
        SELECT
            ${boroughColumn},
            -- Tarifa base por minuto (calculada para todas as linhas)
            (fare_amount + extra) / trip_duration_minutes AS base_rate,
            -- Gorjeta por minuto (será NULL onde tip_amount for NULL)
            tip_amount / trip_duration_minutes AS tip_rate
        FROM
            taxi_2023
        WHERE
            ${boroughColumn} NOT IN ('Unknown', 'N/A')
            AND trip_duration_minutes > 1 
            AND fare_amount > 0
    )
    SELECT
        ${boroughColumn},
        AVG(base_rate) AS avg_base_per_minute,
        AVG(tip_rate) AS avg_tip_per_minute,
        -- Soma das médias (usando COALESCE para o caso de 0 gorjetas no bairro)
        (AVG(base_rate) + COALESCE(AVG(tip_rate), 0)) AS mean_earn_per_minute
    FROM
        metricas_por_viagem
    GROUP BY
        ${boroughColumn}
    ORDER BY
        mean_earn_per_minute DESC
    `;
}

function generateTripsPerBoroughSQL(boroughType = 'pu_borough') {
    const boroughColumn = boroughType === 'do_borough' ? 'do_borough' : 'pu_borough';
    
    return `
        SELECT
        ${boroughColumn},
        COUNT(*) AS total_viagens
    FROM
        taxi_2023
    WHERE
        -- Mantendo a consistência: ignorando bairros não identificados
        ${boroughColumn} NOT IN ('Unknown', 'N/A')
    GROUP BY
        ${boroughColumn}
    ORDER BY
        total_viagens DESC
    `;
}

window.onload = async () => {
    const taxi = new Taxi();

    await taxi.init();
    await taxi.loadTaxi();

    const mean_earn_per_minute_pu_data = await taxi.query(generateEarnPerMinuteSQL('pu_borough'));
    console.log(mean_earn_per_minute_pu_data);

    const mean_earn_per_minute_do_data = await taxi.query(generateEarnPerMinuteSQL('do_borough'));
    console.log(mean_earn_per_minute_do_data);

    const trips_per_borough_pu_data = await taxi.query(generateTripsPerBoroughSQL('pu_borough'));
    console.log(trips_per_borough_pu_data);

    const trips_per_borough_do_data = await taxi.query(generateTripsPerBoroughSQL('do_borough'));
    console.log(trips_per_borough_do_data);

    callbacks(mean_earn_per_minute_pu_data, mean_earn_per_minute_do_data, trips_per_borough_pu_data, trips_per_borough_do_data);
};

