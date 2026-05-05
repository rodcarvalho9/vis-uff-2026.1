import { Taxi } from "./taxi";
import { loadMeanEarnPerMinuteBarChart, loadTripsPerBoroughPieChart, loadMeanEarnPerWeekdayLineChart } from './plot';

const CHART_SELECTORS = [
    '#chart-mean-earn-per-minute',
    '#chart-trips-per-borough',
    '#chart-earn-per-minute-by-weekday'
];

function callbacks(mean_earn_per_minute_data, trips_per_borough_data, earn_per_minute_by_weekday_data) {
    const loadBtn = document.querySelector('#loadBtn');
    const clearBtn = document.querySelector('#clearBtn');

    if (!loadBtn || !clearBtn) {
        return;
    }

    loadBtn.addEventListener('click', async () => {
        clearAll();
        await loadAll(mean_earn_per_minute_data, trips_per_borough_data, earn_per_minute_by_weekday_data);
    });

    clearBtn.addEventListener('click', async () => {
        clearAll();
    });
}

async function loadAll(mean_earn_per_minute_data, trips_per_borough_data, earn_per_minute_by_weekday_data) {
    await loadMeanEarnPerMinuteBarChart(mean_earn_per_minute_data, '#chart-mean-earn-per-minute');
    await loadTripsPerBoroughPieChart(trips_per_borough_data, '#chart-trips-per-borough');
    await loadMeanEarnPerWeekdayLineChart(earn_per_minute_by_weekday_data, '#chart-earn-per-minute-by-weekday');
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
    return `
        WITH metricas_por_viagem AS (
        SELECT
            ${boroughType},
            -- Tarifa base por minuto (calculada para todas as linhas)
            (fare_amount + extra) / trip_duration_minutes AS base_rate,
            -- Gorjeta por minuto (será NULL onde tip_amount for NULL)
            tip_amount / trip_duration_minutes AS tip_rate
        FROM
            taxi_2023
        WHERE
            ${boroughType} NOT IN ('Unknown', 'N/A')
    )
    SELECT
        ${boroughType},
        AVG(base_rate) AS avg_base_per_minute,
        AVG(tip_rate) AS avg_tip_per_minute,
        -- Soma das médias (usando COALESCE para o caso de 0 gorjetas no bairro)
        (AVG(base_rate) + COALESCE(AVG(tip_rate), 0)) AS mean_earn_per_minute
    FROM
        metricas_por_viagem
    GROUP BY
        ${boroughType}
    ORDER BY
        mean_earn_per_minute DESC
    `;
}

function generateTripsPerBoroughSQL(boroughType = 'pu_borough') {
    return `
        SELECT
        ${boroughType},
        COUNT(*) AS total_viagens
    FROM
        taxi_2023
    WHERE
        -- Mantendo a consistência: ignorando bairros não identificados
        ${boroughType} NOT IN ('Unknown', 'N/A')
    GROUP BY
        ${boroughType}
    ORDER BY
        total_viagens DESC
    `;
}

function generateEarnPerMinuteByWeekdaySQL(boroughType = 'pu_borough') {
    return `
WITH metricas_dias AS (
    SELECT
        ${boroughType},
        -- Extraindo o dia da semana (0 = Domingo, 1 = Segunda...)
        CAST(strftime(lpep_pickup_datetime, '%w') AS INTEGER) AS day_num,
        (fare_amount + extra) / trip_duration_minutes AS base_rate,
        tip_amount / trip_duration_minutes AS tip_rate
    FROM
        taxi_2023
    WHERE
       ${boroughType} NOT IN ('Unknown', 'N/A')
)
SELECT
    ${boroughType},
    day_num,
    AVG(base_rate + COALESCE(tip_rate, 0)) AS mean_earn_per_minute
FROM
    metricas_dias
GROUP BY
    ${boroughType}, day_num
ORDER BY
    ${boroughType}, day_num;
    `;
}
window.onload = async () => {
    const taxi = new Taxi();

    await taxi.init();
    await taxi.loadTaxi();

    const mean_earn_per_minute_data = await taxi.query(generateEarnPerMinuteSQL());
    console.log(mean_earn_per_minute_data);

    const trips_per_borough_data = await taxi.query(generateTripsPerBoroughSQL());
    console.log(trips_per_borough_data);

    const earn_per_minute_by_weekday_data = await taxi.query(generateEarnPerMinuteByWeekdaySQL());
    console.log(earn_per_minute_by_weekday_data);

    callbacks(mean_earn_per_minute_data, trips_per_borough_data, earn_per_minute_by_weekday_data);
};


