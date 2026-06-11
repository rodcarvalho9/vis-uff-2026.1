import { loadMap, clearMap, CRIME_TYPES, initDbs, getAvailableYears } from './map';

async function callbacks(data) {
    const loadBtn = document.querySelector('#loadBtn');
    const clearBtn = document.querySelector('#clearBtn');
    const metricSelect = document.querySelector('#crimeMetric');
    const yearSelect = document.querySelector('#yearSelect');

    if (!loadBtn || !clearBtn || !metricSelect || !yearSelect) {
        return;
    }

    CRIME_TYPES.forEach(metric => {
        const option = document.createElement('option');
        option.value = metric;
        option.textContent = metric;
        metricSelect.appendChild(option);
    });

    metricSelect.value = 'furto_celular';

    const years = await getAvailableYears();
    const defaultYear = years[years.length - 1] || new Date().getFullYear();

    yearSelect.innerHTML = '';
    years.forEach(year => {
        const option = document.createElement('option');
        option.value = String(year);
        option.textContent = String(year);
        yearSelect.appendChild(option);
    });

    yearSelect.value = String(defaultYear);

    await loadMap(data, metricSelect.value, defaultYear);

    loadBtn.addEventListener('click', async () => {
        const activeYear = yearSelect.value || defaultYear;
        await loadMap(data, metricSelect.value, activeYear);
    });

    metricSelect.addEventListener('change', async () => {
        const activeYear = yearSelect.value || defaultYear;
        await loadMap(data, metricSelect.value, activeYear);
    });

    yearSelect.addEventListener('change', async () => {
        await loadMap(data, metricSelect.value, yearSelect.value);
    });

    clearBtn.addEventListener('click', async () => {
        clearMap();
    });
}

window.onload = async () => {
    const response = await fetch('RJ_Municipios_2025.geojson');
    const neighs = await response.json();

    await initDbs();
    await callbacks(neighs);
};

