// ui.js - petits helpers UI
function switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.view-section').forEach(view => view.classList.remove('active'));
    try {
        if (event && event.currentTarget) event.currentTarget.classList.add('active');
    } catch (e) {}
    const view = document.getElementById('view-' + tabId) || document.getElementById('view-' + tabId.replace(/boutique/, 'boutique'));
    if (view) view.classList.add('active');
    if (tabId === 'inventaire') updateInventoryUI();
    if (tabId === 'depot') renderSavedRames();
    if (tabId === 'carte') {
        initMap();
        populateRameSelect();
        populateStationSelect();
        renderActiveRoutes();
        refreshRouteMapLayers();
        updateTrainMarkers();
        setTimeout(() => map && map.invalidateSize(), 150);
    }
}

function supprimerRame(id) {
    // wrapper francophone vers disassembleRame
    disassembleRame(id);
}
