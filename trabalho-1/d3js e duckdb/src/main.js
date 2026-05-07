import { Taxi } from "./taxi";
import { loadEarnPerBoroughBarplot, loadTripsPerBoroughPieChart, loadEarnPerWeekdayLineChart, loadEarnHeatMap } from './plot';

const CHART_SELECTORS = [
    '#chart-earn-per-borough',
    '#chart-trips-per-borough',
    '#chart-earn-per-weekday',
    '#chart-earn-heatmap'
];

function callbacks(earn_per_borough_data, trips_per_borough_data, earn_per_weekday_data, earn_heatmap_data) {
    const loadBtn = document.querySelector('#loadBtn');
    const clearBtn = document.querySelector('#clearBtn');

    if (!loadBtn || !clearBtn) {
        return;
    }

    loadBtn.addEventListener('click', async () => {
        clearAll();
        await loadAll(earn_per_borough_data, trips_per_borough_data, earn_per_weekday_data, earn_heatmap_data);
    });

    clearBtn.addEventListener('click', async () => {
        clearAll();
    });
}

async function loadAll(earn_per_borough_data, trips_per_borough_data, earn_per_weekday_data, earn_heatmap_data) {
    await loadEarnPerBoroughBarplot(earn_per_borough_data, '#chart-earn-per-borough');
    await loadTripsPerBoroughPieChart(trips_per_borough_data, '#chart-trips-per-borough');
    await loadEarnPerWeekdayLineChart(earn_per_weekday_data, '#chart-earn-per-weekday');
    await loadEarnHeatMap(earn_heatmap_data, '#chart-earn-heatmap');
}

function clearAll() {
    CHART_SELECTORS.forEach((selector) => {
        const chart = document.querySelector(selector);

        if (chart) {
            chart.replaceChildren();
        }
    });
}

function generateEarnPerBoroughSQL(boroughType = 'pu_borough') {
    return `
        WITH metric AS (
        SELECT
            ${boroughType},
            (fare_amount + extra) / trip_duration_minutes AS mean_base_earn,
            tip_amount / trip_duration_minutes AS mean_tip
        FROM
            taxi_2025
    )
    SELECT
        ${boroughType},
        AVG(mean_base_earn) + AVG(mean_tip) AS mean_earn
    FROM
        metric
    GROUP BY
        ${boroughType}
    ORDER BY
        mean_earn DESC
    `;
}

function generateTripsPerBoroughSQL(boroughType = 'pu_borough') {
    return `
        SELECT
        ${boroughType},
        COUNT(*) AS total_viagens
    FROM
        taxi_2025
    GROUP BY
        ${boroughType}
    ORDER BY
        total_viagens DESC
    `;
}

function generateEarnPerWeekdaySQL(boroughType = 'pu_borough') {
    return `
WITH metric AS (
        SELECT
            ${boroughType},
            CAST(strftime(lpep_pickup_datetime, '%w') AS INTEGER) as day_num,
            (fare_amount + extra) / trip_duration_minutes AS mean_base_earn,
            tip_amount / trip_duration_minutes AS mean_tip
        FROM
            taxi_2025
    )
SELECT
    ${boroughType},
    day_num,
    AVG(mean_base_earn) + AVG(mean_tip) AS mean_earn
FROM
    metric
GROUP BY
    ${boroughType}, day_num
ORDER BY
    ${boroughType}, day_num;
    `;
}

function generateEarnHeatMapSQL() {
    return `
WITH metric AS (
        SELECT
            pu_borough, 
            do_borough,
            (fare_amount + extra) / trip_duration_minutes AS mean_base_earn,
            tip_amount / trip_duration_minutes AS mean_tip
        FROM
            taxi_2025
    )
SELECT
    pu_borough,
    do_borough,
    AVG(mean_base_earn) + COALESCE(AVG(mean_tip), 0) AS mean_earn
FROM
    metric
GROUP BY
    pu_borough, do_borough
ORDER BY
    pu_borough, do_borough
    `;
}


window.onload = async () => {
    const taxi = new Taxi();

    await taxi.init();
    await taxi.loadTaxi();

    const mean_earn_data = await taxi.query(generateEarnPerBoroughSQL());
    console.log(mean_earn_data);

    const trips_per_borough_data = await taxi.query(generateTripsPerBoroughSQL());
    console.log(trips_per_borough_data);

    const earn_per_minute_by_weekday_data = await taxi.query(generateEarnPerWeekdaySQL());
    console.log(earn_per_minute_by_weekday_data);

    const earn_heatmap_data = await taxi.query(generateEarnHeatMapSQL());
    console.log(earn_heatmap_data);

    callbacks(mean_earn_data, trips_per_borough_data, earn_per_minute_by_weekday_data, earn_heatmap_data);
};


