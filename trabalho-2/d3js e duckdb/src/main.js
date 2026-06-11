import { loadMap, clearMap, initCrime, CRIME_TYPES } from './map';

function callbacks(data) {
    const loadBtn   = document.querySelector('#loadBtn');
    const clearBtn  = document.querySelector('#clearBtn');
    const metricSelect = document.querySelector('#crimeMetric');
    const toggleGroups = document.querySelectorAll('.toggle-group');

    if (!loadBtn || !clearBtn || !metricSelect) {
        return;
    }

    CRIME_TYPES.forEach(metric => {
        const option = document.createElement('option');
        option.value = metric;
        option.textContent = metric;
        metricSelect.appendChild(option);
    });

    metricSelect.value = 'furto_celular';

    toggleGroups.forEach(group => {
        group.querySelectorAll('.toggle-btn').forEach(button => {
            button.addEventListener('click', () => {
                group.querySelectorAll('.toggle-btn').forEach(d => d.classList.remove('active'));
                button.classList.add('active');
            });
        });
    });

    loadBtn.addEventListener('click', async () => {
        await loadMap(data, metricSelect.value);
    });

    metricSelect.addEventListener('change', async () => {
        await loadMap(data, metricSelect.value);
    });

    clearBtn.addEventListener('click', async () => {
        clearMap();
    });
}

window.onload = async () => {
    const response = await fetch('RJ_Municipios_2025.geojson');
    const neighs = await response.json();

    callbacks(neighs);
    await initCrime();
};

