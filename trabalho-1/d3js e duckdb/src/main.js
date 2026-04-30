import { Taxi } from "./taxi";
import { loadMeanFarePerMinuteBarChart, loadMeanFarePerMileBarChart, clearChart } from './plot';

function callbacks(mean_fare_per_minute_data, mean_fare_per_mile_data) {
    const loadBtn  = document.querySelector('#loadBtn');
    const clearBtn = document.querySelector('#clearBtn');

    if (!loadBtn || !clearBtn) {
        return;
    }

    loadBtn.addEventListener('click', async () => {
        clearAll();
        await loadAll(mean_fare_per_minute_data, mean_fare_per_mile_data);
    });

    clearBtn.addEventListener('click', async () => {
        clearAll();
    });
}

async function loadAll(mean_fare_per_minute_data, mean_fare_per_mile_data) {
    await loadMeanFarePerMinuteBarChart(mean_fare_per_minute_data, '#chart-mean-fare-per-minute');
    await loadMeanFarePerMileBarChart(mean_fare_per_mile_data, '#chart-mean-fare-per-mile');
}

function clearAll() {
    const chartIds = ['#chart-mean-fare-per-minute', '#chart-mean-fare-per-mile'];
    
    for (const chartId of chartIds) {
        clearChart(chartId);
    }
}

window.onload = async () => {
    const taxi = new Taxi();

    await taxi.init();
    await taxi.loadTaxi();

    const mean_fare_per_minute_sql = `
        SELECT
            pu_borough,
            AVG(fare_per_minute) AS fare_per_minute_mean
        FROM
            taxi_2023
        WHERE
            pu_borough NOT IN ('Unknown', 'N/A', 'EWR')
        GROUP BY
            pu_borough
    `;

    const mean_fare_per_minute_data = await taxi.query(mean_fare_per_minute_sql);
    console.log(mean_fare_per_minute_data);

    const mean_fare_per_mile_sql = `
        SELECT
            pu_borough,
            AVG(fare_per_mile) AS fare_per_mile_mean
        FROM
            taxi_2023
        WHERE
            pu_borough NOT IN ('Unknown', 'N/A', 'EWR')
        GROUP BY
            pu_borough
    `;

    const mean_fare_per_mile_data = await taxi.query(mean_fare_per_mile_sql);
    console.log(mean_fare_per_mile_data);

    callbacks(mean_fare_per_minute_data, mean_fare_per_mile_data);
};

