// This script handles the interactive map with dynamic criteria selection
var width = 550;
var height = 350;
var svg, g_map, g_autonomas, g_prov, g_labels, g_cities, s, projection, path, zoom;

var div = d3.select("body")
    .append("div")
    .attr("id", "tooltip")
    .attr("class", "tooltip")
    .style("opacity", 0)
    .style("position", "absolute")
    .style("pointer-events", "none")
    .style("background", "white")
    .style("border", "2px solid #333")
    .style("border-radius", "8px")
    .style("padding", "10px")
    .style("box-shadow", "0 4px 12px rgba(0, 0, 0, 0.3)")
    .style("z-index", "10000");

// Global variable to store user criteria weights
var userCriteriaWeights = {};
var selectedCriteria = [];
const MAX_CRITERIA = 5;

// Global variable for user type (tourist or migrant)
var userType = 'migrant'; // Default

// Global variable for selected season (for tourists)
var selectedSeason = 'summer'; // Default season

// Criteria allowed for tourists (subset of all criteria)
// Using actual criterion IDs from the criteria array
const TOURIST_ALLOWED_CRITERIA = [
    'transport',     // Stop Remoteness
    'housing',       // Housing Cost
    'food',          // Food Cost
    'climate',       // Climate Quality
    'crime',         // Criminality Rate
    'water',         // Water Quality
    'greenspace'     // Green Space
];

// Global variable to store all cities for search
var allCitiesData = null;

// Tourism type to emoji mapping
const tourismEmojis = {
    'apartment': '🏢',
    'aquarium': '🐠',
    'artwork': '🎨',
    'attraction': '⭐',
    'camp_site': '⛺',
    'caravan_site': '🚐',
    'chalet': '🏔️',
    'gallery': '🖼️',
    'guest_house': '🏠',
    'hostel': '🛏️',
    'hotel': '🏨',
    'hunting_lodge': '🦌',
    'information': 'ℹ️',
    'memorial': '🗿',
    'motel': '🛣️',
    'museum': '🏛️',
    'picnic_site': '🧺',
    'picnic_table': '🪑',
    'podiatrist': '👣',
    'spa_resort': '💆',
    'tours': '🚌',
    'viewpoint': '👁️',
    'zoo': '🦁'
};

// Helper function to parse European-formatted numbers (comma as decimal separator)
function parseEuropeanFloat(value) {
    if (value === undefined || value === null) return 0;
    // Convert to string, remove currency symbols and other non-numeric chars (except comma, dot, minus)
    const stringValue = String(value)
        .replace(/[€$£¥]/g, '') // Remove currency symbols
        .replace(/\s/g, '') // Remove spaces
        .replace(',', '.') // Replace comma with dot for decimal
        .trim();
    const parsed = parseFloat(stringValue);
    return isNaN(parsed) ? 0 : parsed;
}

// Criteria data with icons
const criteria = [
    { id: 'gdp', name: 'Income potential', icon: '💰' },
    { id: 'population', name: 'Population Density', icon: '👥' },
    { id: 'transport', name: 'Stop Remoteness', icon: '🚇' },
    { id: 'housing', name: 'Housing Cost', icon: '🏠' },
    { id: 'food', name: 'Food Cost', icon: '🍽️' },
    { id: 'services', name: 'Service Cost', icon: '🛍️' },
    { id: 'climate', name: 'Climate Quality', icon: '☀️' },
    { id: 'crime', name: 'Criminality Rate', icon: '🛡️' },
    { id: 'water', name: 'Water Quality', icon: '💧' },
    { id: 'recycling', name: 'City Cleanliness', icon: '♻️' },
    { id: 'greenspace', name: 'Green Space', icon: '🌳' },
    { id: 'hazards', name: 'Natural Safety', icon: '⛰️' },
    { id: 'education', name: 'Education Level', icon: '🎓' },
    { id: 'jobs', name: 'Job Opportunities', icon: '💼' },
    { id: 'lifeexpectancy', name: 'Life Expectancy', icon: '❤️' }
];

// City data mapping - maps criterion IDs to actual GeoJSON property names
// Each criterion has both normalized (for calculations) and real (for display) values
// inverse: true means higher real values = lower scores (e.g., costs, crime)
// Function to get city data attributes dynamically based on user type and season
function getCityDataAttributes(userType = 'migrant', season = 'general') {
    // Determine housing cost attributes based on user type
    const housingNorm = userType === 'tourist' ? 'norm_Rent_cost_tourists' : 'norm_Rent_cost_migrants';
    const housingReal = userType === 'tourist' ? 'real_Rent_cost_tourists' : 'real_Rent_cost_migrants';
    
    // Determine weather attributes based on user type and season
    let weatherNorm, weatherReal;
    if (userType === 'migrant') {
        weatherNorm = 'norm_Weather_general';
        weatherReal = 'real_Weather_general';
    } else {
        // Tourist - use seasonal data
        const seasonMap = {
            'spring': { norm: 'norm_Weather_spring', real: 'real_Weather_spring' },
            'summer': { norm: 'norm_Weather_summer', real: 'real_Weather_summer' },
            'fall': { norm: 'norm_Weather_fall', real: 'real_Weather_fall' },
            'winter': { norm: 'norm_Weather_winter', real: 'real_Weather_winter' }
        };
        weatherNorm = seasonMap[season]?.norm || 'norm_Weather_general';
        weatherReal = seasonMap[season]?.real || 'real_Weather_general';
    }
    
    return {
        'gdp': {
            normalized: 'norm_GDP_percapita',
            real: 'real_GDP_percapita',
            unit: '€',
            label: 'GDP per Capita',
            inverse: false
        },
        'population': {
            normalized: 'norm_Population_density',
            real: 'real_Population_density',
            unit: ' people/km²',
            label: 'Population Density',
            inverse: false
        },
        'transport': {
            normalized: 'norm_Avg_Closest_station',
            real: 'real_Avg_Closest_station',
            unit: ' km',
            label: 'Stop Remoteness',
            inverse: true
        },
        'housing': {
            normalized: housingNorm,
            real: housingReal,
            unit: '€',
            label: 'Housing Cost',
            inverse: true
        },
        'food': {
            normalized: 'norm_Food_cost',
            real: 'real_Food_cost',
            unit: '€',
            label: 'Food Cost',
            inverse: true
        },
        'services': {
            normalized: 'norm_Services_cost',
            real: 'real_Services_cost',
            unit: '€',
            label: 'Service Cost',
            inverse: true
        },
        'climate': {
            normalized: weatherNorm,
            real: weatherReal,
            unit: '',
            label: 'Climate Quality',
            inverse: false
        },
        'crime': {
            normalized: 'norm_Criminality_rate',
            real: 'real_Criminality_rate',
            unit: '',
            label: 'Criminality Rate',
            inverse: true
        },
        'water': {
            normalized: 'norm_Water_quality',
            real: 'real_Water_quality',
            unit: '',
            label: 'Water Quality',
            inverse: false
        },
        'recycling': {
            normalized: 'norm_Recycling_rate',
            real: 'real_Recycling_rate',
            unit: '%',
            label: 'Recycling Rate',
            inverse: false
        },
        'greenspace': {
            normalized: 'norm_Green_space_per_capita',
            real: 'real_Green_space_per_capita',
            unit: ' m²',
            label: 'Green Space',
            inverse: false
        },
        'hazards': {
            normalized: 'norm_Natural_risks',
            real: 'real_Natural_risks',
            unit: '',
            label: 'Natural Safety',
            inverse: true
        },
        'education': {
            normalized: 'norm_Education_years',
            real: 'real_Education_years',
            unit: ' years',
            label: 'Education Level',
            inverse: false
        },
        'jobs': {
            normalized: 'norm_Job_offers',
            real: 'real_Job_offers',
            unit: '',
            label: 'Job Opportunities',
            inverse: false
        },
        'lifeexpectancy': {
            normalized: 'norm_Life_expectancy',
            real: 'real_Life_expectancy',
            unit: ' years',
            label: 'Life Expectancy',
            inverse: false
        }
    };
}

// Keep backward compatibility - default cityDataAttributes
const cityDataAttributes = getCityDataAttributes('migrant', 'general');

// Initialize the application when page loads
// Initialize the application when page loads
document.addEventListener('DOMContentLoaded', function () {
    // Don't initialize map automatically - wait for call interaction
    // Only setup button handlers that don't depend on map being visible

    // Setup methodology modal (can be done in background)
    setupMethodologyModal();

    // Setup back button for city detail view
    const backBtn = document.getElementById('backToMapBtn');
    if (backBtn) {
        backBtn.addEventListener('click', hideCityDetailView);
    }

    console.log('Page loaded. Waiting for call interaction...');
});

// Setup user type filter (tourist/migrant)
const userTypeRadios = document.querySelectorAll('input[name="userType"]');
const seasonSelector = document.getElementById('seasonSelector');
const seasonSelect = document.getElementById('seasonSelect');

userTypeRadios.forEach(radio => {
    radio.addEventListener('change', function () {
        const previousUserType = userType;
        userType = this.value;
        console.log('User type changed from', previousUserType, 'to:', userType);

        // Reset map and criteria if there was a previous selection
        if (selectedCriteria.length > 0) {
            resetMapAndCriteria();
        } else {
            // Just refresh criteria panel to show appropriate criteria
            initializeCriteriaPanel();
        }

        // Update season selector visibility (considers both user type and climate selection)
        updateSeasonSelectorVisibility();

        // Update cursor style for all city markers
        updateCityCursorStyle();
    });
});

// Setup season selector change handler
if (seasonSelect) {
    seasonSelect.addEventListener('change', function() {
        const previousSeason = selectedSeason;
        selectedSeason = this.value;
        console.log('Season changed from', previousSeason, 'to:', selectedSeason);
        
        // If criteria are selected and user is tourist, update the map
        if (userType === 'tourist' && selectedCriteria.length > 0) {
            // Recalculate and update cities with new season data
            updateMap();
        }
    });
}

// Setup city search functionality
initializeCitySearch();

// Setup methodology modal
setupMethodologyModal();

// Function to reset map and criteria when user type changes
function resetMapAndCriteria() {
    console.log('Resetting map and criteria...');

    // Clear selected criteria
    selectedCriteria = [];
    userCriteriaWeights = {};

    // Hide weights section
    const weightsSection = document.getElementById('weightsSection');
    if (weightsSection) {
        weightsSection.style.display = 'none';
    }

    // Clear weights list
    const weightsList = document.getElementById('criteriaWeightsList');
    if (weightsList) {
        weightsList.innerHTML = '';
    }

    // Remove pie chart if it exists
    const pieChartContainer = document.getElementById('criteriaWeightsList');
    if (pieChartContainer) {
        const pieChartSvg = pieChartContainer.querySelector('svg');
        if (pieChartSvg) {
            pieChartSvg.remove();
        }
    }

    // Also remove any standalone pie chart SVG
    if (typeof d3 !== 'undefined') {
        d3.select('#criteriaWeightsList').selectAll('svg').remove();
    }

    // Reinitialize criteria panel with new criteria filter
    initializeCriteriaPanel();

    // Clear city circles (results)
    if (typeof g_cities !== 'undefined') {
        g_cities.selectAll(".city-point").remove();
    }

    // Clear city labels
    if (typeof g_labels !== 'undefined') {
        g_labels.selectAll("text").remove();
    }

    // Remove proportional legend completely and reset the variable
    if (typeof proportionalLegendGroup !== 'undefined' && proportionalLegendGroup) {
        proportionalLegendGroup.remove(); // Remove the entire group
        proportionalLegendGroup = null; // Reset to null so it can be recreated
    }

    // Reset currentRadiusScale
    if (typeof window !== 'undefined') {
        window.currentRadiusScale = null;
    }

    // Reload initial city markers
    if (typeof loadInitialCityMarkers === 'function') {
        loadInitialCityMarkers();
    }

    console.log('Map and criteria reset complete');
}

// ===== CITY SEARCH FUNCTIONALITY =====

function initializeCitySearch() {
    const searchInput = document.getElementById('citySearchInput');
    const searchResults = document.getElementById('citySearchResults');

    if (!searchInput || !searchResults) return;

    // Load cities data for search
    d3.json("https://raw.githubusercontent.com/cfdvoices/Spain-Mapping-Project/main/cities.geojson")
        .then(function (data) {
            allCitiesData = data.features;
            console.log('Cities data loaded for search:', allCitiesData.length);
        });

    // Search input event
    searchInput.addEventListener('input', function () {
        const query = this.value.trim().toLowerCase();

        if (query.length < 2) {
            searchResults.classList.remove('active');
            return;
        }

        if (!allCitiesData) {
            searchResults.innerHTML = '<div class="search-result-item">Loading cities...</div>';
            searchResults.classList.add('active');
            return;
        }

        // Filter cities
        const matches = allCitiesData.filter(d => {
            const cityName = (d.properties.city || "").toLowerCase();
            return cityName.includes(query);
        }).slice(0, 10); // Limit to 10 results

        if (matches.length === 0) {
            searchResults.innerHTML = '<div class="search-result-item">No cities found</div>';
            searchResults.classList.add('active');
            return;
        }

        // Display results
        searchResults.innerHTML = matches.map(d =>
            `<div class="search-result-item" data-city="${d.properties.city}">${d.properties.city}</div>`
        ).join('');

        searchResults.classList.add('active');

        // Add click handlers to results
        searchResults.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', function () {
                const cityName = this.getAttribute('data-city');
                if (cityName) {
                    highlightCity(cityName);
                    searchInput.value = cityName;
                    searchResults.classList.remove('active');
                }
            });
        });
    });

    // Close search results when clicking outside
    document.addEventListener('click', function (e) {
        if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.classList.remove('active');
        }
    });
}

function highlightCity(cityName) {
    console.log('Highlighting city:', cityName);

    // Find the city in the data
    const cityFeature = allCitiesData.find(d => d.properties.city === cityName);
    if (!cityFeature) {
        console.error('City not found:', cityName);
        return;
    }

    // Get city coordinates
    const coords = projection(cityFeature.geometry.coordinates);
    if (!coords) return;

    // Highlight the city marker temporarily
    const marker = g_cities.selectAll('.city-point, .initial-city-marker')
        .filter(d => d.properties.city === cityName);

    if (marker.empty()) {
        console.log('City marker not found on map');
        return;
    }

    // Pulse animation
    marker.each(function () {
        const originalStroke = d3.select(this).attr('stroke');
        const originalStrokeWidth = d3.select(this).attr('stroke-width');

        d3.select(this)
            .attr('stroke', '#FFD700')
            .attr('stroke-width', 3)
            .transition()
            .duration(500)
            .attr('stroke-width', 5)
            .transition()
            .duration(500)
            .attr('stroke-width', 3)
            .transition()
            .duration(500)
            .attr('stroke-width', 5)
            .transition()
            .duration(500)
            .attr('stroke', originalStroke)
            .attr('stroke-width', originalStrokeWidth);
    });

    // Show tooltip if criteria have been selected
    if (selectedCriteria.length > 0) {
        // Trigger tooltip display
        marker.dispatch('mouseover');

        // Keep tooltip visible for 5 seconds
        setTimeout(() => {
            marker.dispatch('mouseout');
        }, 5000);
    }
}

// Function to update cursor style based on user type
function updateCityCursorStyle() {
    const cursorStyle = userType === 'tourist' ? 'pointer' : 'default';
    // Update initial city markers
    g_cities.selectAll(".initial-city-marker").style("cursor", cursorStyle);
    // Update city points (after criteria selection)
    g_cities.selectAll(".city-point").style("cursor", cursorStyle);
}



// Initialize the criteria selection panel
function initializeCriteriaPanel() {
    const checkboxList = document.getElementById('criteriaCheckboxList');
    checkboxList.innerHTML = ''; // Clear existing items

    // Filter criteria based on user type
    const availableCriteria = userType === 'tourist'
        ? criteria.filter(c => TOURIST_ALLOWED_CRITERIA.includes(c.id))
        : criteria;

    availableCriteria.forEach(criterion => {
        const item = document.createElement('div');
        item.className = 'criterion-checkbox-item';
        item.dataset.criterionId = criterion.id;

        item.innerHTML = `
            <input type="checkbox" id="cb_${criterion.id}" value="${criterion.id}">
            <label class="criterion-checkbox-label" for="cb_${criterion.id}">
                <span class="criterion-checkbox-icon">${criterion.icon}</span>
                <span>${criterion.name}</span>
            </label>
        `;

        const checkbox = item.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', function () {
            handleCriterionSelection(criterion, this.checked);
        });

        // Make the whole item clickable
        item.addEventListener('click', function (e) {
            if (e.target.tagName !== 'INPUT') {
                checkbox.click();
            }
        });

        checkboxList.appendChild(item);
    });
    
    // Setup toggle panel button functionality
    setupTogglePanelButton();
}

// Setup toggle panel button to show/hide criteria panel
function setupTogglePanelButton() {
    const toggleBtn = document.getElementById('togglePanelBtn');
    const criteriaPanel = document.getElementById('criteriaPanel');
    const panelContent = document.getElementById('panelContent');
    const toggleIcon = document.getElementById('toggleIcon');
    
    if (!toggleBtn || !criteriaPanel) return;
    
    // Function to update icon based on screen size and state
    function updateToggleIcon() {
        const isMobile = window.innerWidth <= 768;
        const isMinimized = criteriaPanel.classList.contains('minimized');
        
        if (toggleIcon) {
            if (isMobile) {
                // Mobile: vertical toggle
                toggleIcon.textContent = isMinimized ? '▼' : '▲';
            } else {
                // Desktop: horizontal toggle
                toggleIcon.textContent = isMinimized ? '◀' : '▶';
            }
        }
    }
    
    // Remove any existing listeners
    const newToggleBtn = toggleBtn.cloneNode(true);
    toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);
    
    // Add click listener
    newToggleBtn.addEventListener('click', function() {
        criteriaPanel.classList.toggle('minimized');
        
        if (criteriaPanel.classList.contains('minimized')) {
            // Panel is minimized
            if (panelContent) panelContent.style.display = 'none';
        } else {
            // Panel is expanded
            if (panelContent) panelContent.style.display = 'block';
        }
        
        // Update icon after toggle
        updateToggleIcon();
    });
    
    // Set initial icon
    updateToggleIcon();
    
    // Update icon on window resize (orientation change, etc.)
    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(updateToggleIcon, 100);
    });
    
    console.log('Toggle panel button initialized');
}

// Handle criterion selection/deselection
function handleCriterionSelection(criterion, isSelected) {
    if (isSelected) {
        // Check if max criteria reached
        if (selectedCriteria.length >= MAX_CRITERIA) {
            // Uncheck the checkbox
            document.getElementById('cb_' + criterion.id).checked = false;
            alert(`Maximum ${MAX_CRITERIA} criteria allowed. Please deselect one to add another.`);
            return;
        }

        // Add to selected criteria with default equal weight
        selectedCriteria.push({
            ...criterion,
            weight: (100 / (selectedCriteria.length + 1)).toFixed(2)
        });

        // Recalculate weights to be equal
        redistributeWeights();

        // Update UI
        document.querySelector(`[data-criterion-id="${criterion.id}"]`).classList.add('selected');
    } else {
        // Remove from selected criteria
        const index = selectedCriteria.findIndex(c => c.id === criterion.id);
        if (index > -1) {
            selectedCriteria.splice(index, 1);
            redistributeWeights();
        }

        // Update UI
        document.querySelector(`[data-criterion-id="${criterion.id}"]`).classList.remove('selected');
    }

    // Update the weights section
    updateWeightsSection();

    // Enable/disable checkboxes based on max criteria
    updateCheckboxStates();
    
    // Update season selector visibility (only show for tourists with climate selected)
    updateSeasonSelectorVisibility();
}

// Update season selector visibility based on user type and climate selection
function updateSeasonSelectorVisibility() {
    const seasonSelector = document.getElementById('seasonSelector');
    if (!seasonSelector) return;
    
    // Check if climate is in selected criteria
    const isClimateSelected = selectedCriteria.some(c => c.id === 'climate');
    
    // Show season selector only if: tourist mode AND climate is selected
    if (userType === 'tourist' && isClimateSelected) {
        seasonSelector.style.display = 'flex';
    } else {
        seasonSelector.style.display = 'none';
    }
}

// Redistribute weights equally
function redistributeWeights() {
    if (selectedCriteria.length === 0) return;

    const equalWeight = (100 / selectedCriteria.length).toFixed(2);
    selectedCriteria.forEach(c => {
        c.weight = equalWeight;
    });
}

// Update checkbox states (disable if max reached)
function updateCheckboxStates() {
    const allItems = document.querySelectorAll('.criterion-checkbox-item');
    allItems.forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (!checkbox.checked && selectedCriteria.length >= MAX_CRITERIA) {
            item.classList.add('disabled');
            checkbox.disabled = true;
        } else {
            item.classList.remove('disabled');
            checkbox.disabled = false;
        }
    });
}

// Update the weights section
function updateWeightsSection() {
    const weightsSection = document.getElementById('weightsSection');
    const weightsList = document.getElementById('criteriaWeightsList');

    if (selectedCriteria.length === 0) {
        weightsSection.style.display = 'none';
        return;
    }

    weightsSection.style.display = 'block';
    weightsList.innerHTML = '';

    selectedCriteria.forEach(criterion => {
        const item = document.createElement('div');
        item.className = 'weight-slider-item';

        item.innerHTML = `
            <div class="weight-slider-header">
                <span class="weight-slider-icon">${criterion.icon}</span>
                <span class="weight-slider-name">${criterion.name}</span>
                <span class="weight-slider-value" id="weight_${criterion.id}">${criterion.weight}%</span>
            </div>
            <input type="range" min="1" max="100" value="${criterion.weight}" 
                   class="weight-slider" id="slider_${criterion.id}">
        `;

        const slider = item.querySelector('input[type="range"]');
        slider.addEventListener('input', function () {
            handleWeightChange(criterion.id, parseFloat(this.value));
        });

        weightsList.appendChild(item);
    });
}

// Handle weight slider changes
function handleWeightChange(criterionId, newWeight) {
    // Update the specific criterion weight
    const criterion = selectedCriteria.find(c => c.id === criterionId);
    if (criterion) {
        criterion.weight = newWeight.toFixed(2);
    }

    // Normalize weights to sum to 100
    normalizeWeights();

    // Update all displays
    selectedCriteria.forEach(c => {
        const valueDisplay = document.getElementById('weight_' + c.id);
        const slider = document.getElementById('slider_' + c.id);
        if (valueDisplay) valueDisplay.textContent = c.weight + '%';
        if (slider) slider.value = c.weight;
    });
}

// Normalize weights to sum to 100%
function normalizeWeights() {
    const total = selectedCriteria.reduce((sum, c) => sum + parseFloat(c.weight), 0);
    if (total > 0) {
        selectedCriteria.forEach(c => {
            c.weight = ((parseFloat(c.weight) / total) * 100).toFixed(2);
        });
    }
}

// Update map button handler
document.getElementById('updateMapBtn').addEventListener('click', function () {
    if (selectedCriteria.length === 0) {
        alert('Please select at least one criterion');
        return;
    }

    // Normalize weights one final time
    normalizeWeights();

    // Convert to user criteria format expected by map
    window.userCriteria = selectedCriteria.map((c, index) => ({
        ...c,
        rank: index + 1
    }));

    // Update user criteria weights for calculation
    userCriteriaWeights = {};
    window.userCriteria.forEach(criterion => {
        userCriteriaWeights[criterion.id] = parseFloat(criterion.weight) / 100;
    });

    console.log('Updating map with criteria:', window.userCriteria);

    // If map already exists, update it; otherwise initialize
    if (window.mapInitialized) {
        updateMap();
    } else {
        initializeMap();
        window.mapInitialized = true;
    }
});

// Initialize map structure (SVG and base layers) without cities
function initializeMapStructure() {
    // Create the main SVG container
    svg = d3.select("#mapContainer")
        .append("svg")
        .attr("preserveAspectRatio", "xMidYMid meet")
        .attr("viewBox", [0, 0, width, height])
        .attr("title", "Which Spain is calling you? 🇪🇸");

    // Define SVG Groups for layered drawing (Order matters: first appended is bottom layer)
    g_map = svg.append("g").attr("class", "layer-regions");   // Base map (Background)
    g_autonomas = svg.append("g").attr("class", "layer-autonomas"); // Autonomous Communities
    g_prov = svg.append("g").attr("class", "layer-provinces"); // Provinces (on top of autonomas)
    g_labels = svg.append("g").attr("class", "layer-labels"); // Text labels
    g_cities = svg.append("g").attr("class", "layer-cities"); // Cities (Top)
    s = svg.append("g").attr("class", "scale-bar");

    // Define Projection and Path Generator
    projection = d3.geoAzimuthalEqualArea()
        .scale(1)
        .translate([0, 0]);

    path = d3.geoPath().projection(projection);

    /* D3 ZOOM CONTROL */
    // Define the zoom behavior with tighter limits
    zoom = d3.zoom()
        .scaleExtent([0.75, 3.5]) // Restricted zoom: slightly out to moderately in
        .translateExtent([
            [-width * 0.25, -height * 0.25],  // Top-left limit (20% beyond)
            [width * 1.25, height * 1.25]      // Bottom-right limit (20% beyond)
        ])
        .on("zoom", zoomed); // Specify the function to call on zoom events

    // Apply the zoom behavior to the SVG element
    svg.call(zoom);

    // Disable double-click zoom (we use double-click for city selection in tourist mode)
    svg.on("dblclick.zoom", null);

    // Export zoom controls to the window scope so buttons can access them
    window.zoomIn = function () {
        svg.transition()
            .duration(750)
            .call(zoom.scaleBy, 2);
    }

    window.zoomOut = function () {
        svg.transition()
            .duration(750)
            .call(zoom.scaleBy, 0.5);
    }

    window.zoomReset = function () {
        svg.transition()
            .duration(750)
            .call(zoom.transform, d3.zoomIdentity);
    }

    // Setup zoom control button event listeners
    const zoomInBtn = document.getElementById('zoomInBtn');
    const zoomOutBtn = document.getElementById('zoomOutBtn');
    const zoomResetBtn = document.getElementById('zoomResetBtn');

    if (zoomInBtn) zoomInBtn.addEventListener('click', window.zoomIn);
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', window.zoomOut);
    if (zoomResetBtn) zoomResetBtn.addEventListener('click', window.zoomReset);

    // Load base map layers (without cities)
    loadBaseMapLayers();
}

function initializeMap() {
    console.log('Initializing map with criteria:', window.userCriteria);

    // If structure not yet created, create it
    if (!svg) {
        initializeMapStructure();
    }

    // Load cities with current criteria
    loadCities();

    // Create pie chart
    if (window.userCriteria && window.userCriteria.length > 0) {
        createCriteriaPieChart();
    }
}

// Function to update map with new criteria
function updateMap() {
    console.log('Updating map with new criteria:', window.userCriteria);

    // Remove existing pie chart if it exists
    d3.select("#pieChartContainer").remove();

    // Recreate pie chart with new criteria
    createCriteriaPieChart();

    // Reload cities with new calculations
    loadCities();
}

// Function to create a pie chart showing criteria weights
function createCriteriaPieChart() {
    if (!window.userCriteria || window.userCriteria.length === 0) {
        return;
    }

    // Remove any existing pie chart container
    d3.select("#pieChartContainer").remove();

    // Detect if mobile
    const isMobile = window.innerWidth <= 768;

    // Create combined container for pie chart and proportional legend
    // Mobile calculation: 80px pie + 12px padding each side = 104px minimum, use 180px for comfort
    const combinedContainer = d3.select("#mapContainer")
        .append("div")
        .attr("id", "pieChartContainer")
        .attr("class", isMobile ? "pie-container-mobile" : "pie-container-desktop")
        .style("position", "absolute")
        .style("top", isMobile ? "5px" : "10px")
        .style("left", isMobile ? "5px" : "20px")
        .style("background", "white")
        .style("border-radius", isMobile ? "12px" : "12px")
        .style("padding", isMobile ? "12px" : "12px")
        .style("box-shadow", "0 4px 12px rgba(0,0,0,0.15)")
        .style("z-index", "1000")
        .style("pointer-events", "all")
        .style("max-width", isMobile ? "180px" : "200px")
        .style("min-width", isMobile ? "180px" : "200px")
        .style("width", isMobile ? "180px" : "200px");

    // Add title for pie chart - larger and on two lines for mobile
    const titleContainer = combinedContainer.append("div")
        .style("font-size", isMobile ? "15px" : "1.2em")
        .style("font-weight", "bold")
        .style("margin-bottom", isMobile ? "8px" : "6px")
        .style("text-align", "center")
        .style("color", "#333")
        .style("line-height", isMobile ? "1.4" : "1.3")
        .style("padding", isMobile ? "0 5px" : "0");
    
    // Add title text with line break for mobile
    if (isMobile) {
        titleContainer.html("Selected<br>Priorities");
    } else {
        titleContainer.text("Selected Priorities");
    }

    // Create SVG for pie chart - 80x80px on mobile, fully centered
    const pieWidth = isMobile ? 80 : 120;
    const pieHeight = isMobile ? 80 : 120;
    const radius = Math.min(pieWidth, pieHeight) / 2 - (isMobile ? 6 : 10);

    const pieSvg = combinedContainer.append("svg")
        .attr("width", pieWidth)
        .attr("height", pieHeight)
        .style("display", "block")
        .style("margin", "0 auto")
        .append("g")
        .attr("transform", `translate(${pieWidth / 2}, ${pieHeight / 2})`);

    // Create color scale
    const colorScale = d3.scaleOrdinal()
        .domain(window.userCriteria.map(c => c.id))
        .range(['#667eea', '#764ba2', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#fee140', '#30cfd0']);

    // Create pie layout
    const pie = d3.pie()
        .value(d => parseFloat(d.weight))
        .sort(null);

    // Create arc generator
    const arc = d3.arc()
        .innerRadius(0)
        .outerRadius(radius);

    // Create arcs
    const arcs = pieSvg.selectAll("arc")
        .data(pie(window.userCriteria))
        .enter()
        .append("g")
        .attr("class", "arc");

    // Draw pie slices
    arcs.append("path")
        .attr("d", arc)
        .attr("fill", d => colorScale(d.data.id))
        .attr("stroke", "white")
        .attr("stroke-width", isMobile ? 0.5 : 2)
        .style("opacity", 0.85)
        .on("mouseover", function (event, d) {
            d3.select(this)
                .style("opacity", 1)
                .style("cursor", "pointer");

            // Show tooltip - responsive sizing
            const isMobileTooltip = window.innerWidth <= 768;
            div.html(`
                <div style="font-family: Arial, sans-serif; padding: ${isMobileTooltip ? '3px' : '5px'};">
                    <div style="font-size: ${isMobileTooltip ? '8px' : '16px'}; margin-bottom: ${isMobileTooltip ? '2px' : '5px'};">${d.data.icon} ${d.data.name}</div>
                    <div style="font-size: ${isMobileTooltip ? '7px' : '14px'}; font-weight: bold; color: ${colorScale(d.data.id)};">Weight: ${d.data.weight}%</div>
                </div>
            `)
                .style("left", (event.pageX + 5) + "px")
                .style("top", (event.pageY - 5) + "px")
                .style("opacity", 0.98)
                .style("display", "block");
        })
        .on("mouseout", function () {
            d3.select(this)
                .style("opacity", 0.85);
            div.style("opacity", 0).style("display", "none");
        })
        .on("touchstart", function (event, d) {
            // Mobile touch support - 50% smaller
            d3.select(this).style("opacity", 1);
            div.html(`
                <div style="font-family: Arial, sans-serif; padding: 3px;">
                    <div style="font-size: 8px; margin-bottom: 2px;">${d.data.icon} ${d.data.name}</div>
                    <div style="font-size: 7px; font-weight: bold; color: ${colorScale(d.data.id)};">Weight: ${d.data.weight}%</div>
                </div>
            `)
                .style("left", (event.touches[0].pageX + 5) + "px")
                .style("top", (event.touches[0].pageY - 5) + "px")
                .style("opacity", 0.98)
                .style("display", "block");
        });

    // Add separator line
    combinedContainer.append("div")
        .style("border-top", "1px solid #ddd")
        .style("margin", isMobile ? "6px 0" : "10px 0");

    // Add "Index of Choice" title - slightly larger on mobile
    combinedContainer.append("div")
        .style("font-size", isMobile ? "10px" : "13px")
        .style("font-weight", "bold")
        .style("text-align", "center")
        .style("color", "#00a04b")
        .style("margin-bottom", isMobile ? "5px" : "8px")
        .style("line-height", "1.3")
        .text(isMobile ? "Index" : "Index of Choice");

    // Add proportional legend circles container
    const legendCirclesContainer = combinedContainer.append("div")
        .attr("id", "proportionalLegendInContainer")
        .style("display", "flex")
        .style("flex-direction", "column")
        .style("align-items", "center")
        .style("gap", isMobile ? "4px" : "6px")
        .style("padding", isMobile ? "0 5px" : "0");

    // Create legend items with circles - larger and more readable on mobile
    const legendValues = isMobile ? [
        { label: "High", size: 15, color: "#3dde83" },
        { label: "Mid", size: 12, color: "#2e8d57" },
        { label: "Low", size: 9, color: "#044613" }
    ] : [
        { label: "High", size: 20, color: "#3dde83" },
        { label: "Mid", size: 14, color: "#2e8d57" },
        { label: "Low", size: 9, color: "#044613" }
    ];

    legendValues.forEach(item => {
        const legendItem = legendCirclesContainer.append("div")
            .style("display", "flex")
            .style("align-items", "center")
            .style("gap", isMobile ? "6px" : "8px")
            .style("width", "100%")
            .style("justify-content", "flex-start");

        // Circle
        legendItem.append("div")
            .style("width", item.size + "px")
            .style("height", item.size + "px")
            .style("background", item.color)
            .style("border-radius", "50%")
            .style("border", isMobile ? "1px solid #000" : "1px solid #000")
            .style("flex-shrink", "0");

        // Label - more readable font size on mobile
        legendItem.append("div")
            .style("font-size", isMobile ? "10px" : "12px")
            .style("color", "#333")
            .style("font-weight", "500")
            .style("line-height", "1.3")
            .text(item.label);
    });

    console.log("Combined pie chart and proportional legend created for", isMobile ? "mobile" : "desktop");
}

// Calculate index of choice for a city based on user criteria
// Data is already normalized in the GeoJSON (0-100 scale)
function calculateIndexOfChoice(cityProperties) {
    let index = 0;
    let debugInfo = [];

    // If no criteria selected, return population-based default
    if (Object.keys(userCriteriaWeights).length === 0) {
        return cityProperties.population || 100000;
    }

    // Get the correct attributes based on user type and season
    const currentAttributes = getCityDataAttributes(userType, selectedSeason);

    // For each selected criterion, multiply its weight by the city's NORMALIZED value
    Object.keys(userCriteriaWeights).forEach(criterionId => {
        const weight = userCriteriaWeights[criterionId];
        const attributeInfo = currentAttributes[criterionId];

        if (!attributeInfo) {
            console.warn(`No attribute mapping found for criterion: ${criterionId}`);
            return;
        }

        // Use NORMALIZED value for calculation
        const normalizedAttrName = attributeInfo.normalized;
        let value = cityProperties[normalizedAttrName];

        // Debug: log the first city's values
        if (debugInfo.length === 0) {
            debugInfo.push({
                criterion: criterionId,
                normalizedAttribute: normalizedAttrName,
                weight: weight,
                value: value,
                contribution: weight * parseEuropeanFloat(value)
            });
        }

        if (value === undefined || value === null) {
            console.warn(`Missing normalized value for "${normalizedAttrName}" in city ${cityProperties.city}`);
            return;
        }

        // Parse European-formatted number (comma as decimal separator)
        value = parseEuropeanFloat(value);

        if (isNaN(value)) {
            console.warn(`Invalid number for "${normalizedAttrName}" in city ${cityProperties.city}: ${cityProperties[normalizedAttrName]}`);
            return;
        }

        // Add weighted contribution to index
        // Normalized value should be 0-10 or 0-1, weight is 0-1
        const contribution = weight * value;
        index += contribution;
    });

    // Log debug info for first calculation
    if (debugInfo.length > 0 && !window.debugLogged) {
        console.log('Sample calculation for city:', cityProperties.city);
        console.log('Contributions:', debugInfo);
        console.log('Total index:', index);
        window.debugLogged = true;
    }

    return index;
}
    // Check if mobile device
    const isMobile = window.innerWidth <= 768;

// --- ADAPTIVE SCALE BAR HELPER ---
function getAdaptiveScaleDistance(pixelLengthPerMeter) {
    const targetPixelLength = isMobile ? 180 : 70; //CHANGE HERE TO FIND OUT IF THERE IS AVAILABLE INFORMATION AND TO DETECT THE ACCURATE SCALE BAR SIZE
    let idealDistanceMeters = targetPixelLength / pixelLengthPerMeter;
    let powerOfTen = Math.pow(10, Math.floor(Math.log10(idealDistanceMeters)));
    let roundFactors = [1, 2, 5];
    let bestDistance = powerOfTen;

    for (const factor of roundFactors) {
        let candidate = factor * powerOfTen;
        if (candidate <= idealDistanceMeters * 1.5) {
            bestDistance = candidate;
        }
    }

    let label, unit;
    if (bestDistance >= 1000) {
        label = (bestDistance / 1000) + ' km';
        unit = 'km';
    } else {
        label = bestDistance + ' m';
        unit = 'm';
    }
    return { distance: bestDistance, label: label, unit: unit };
}

// --- ZOOM FUNCTION ---
function zoomed(event) {
    g_map.attr("transform", event.transform);
    g_autonomas.attr("transform", event.transform);
    g_prov.attr("transform", event.transform);
    g_labels.attr("transform", event.transform);
    g_cities.attr("transform", event.transform);
    updateScaleBar(event.transform);
    updateProportionalLegend(event.transform.k);
}

// --- PROPORTIONAL SYMBOL LEGEND ---
let proportionalLegendGroup = null;

function initializeProportionalLegend() {
    // This function is now deprecated - proportional legend is included in the pie chart container
    // Kept for compatibility but does nothing
    console.log("Proportional legend now integrated with pie chart container");
    return;
}

function updateProportionalLegend(zoomLevel) {
    // This function is now deprecated - proportional legend is static in the pie chart container
    // Kept for compatibility but does nothing
    return;
}

// --- SCALE BAR FUNCTION ---
function updateScaleBar(transform) {
    const centerLngLat = [-3.7, 40.4];
    const latitude = centerLngLat[1];
    const referenceDistanceMeters = 1;
    const distPerDegreeLng = 111320 * Math.cos(latitude * Math.PI / 180);
    const dLng = referenceDistanceMeters / distPerDegreeLng;

    const projectedCenter = projection(centerLngLat);
    const point1mEast = projection([centerLngLat[0] + dLng, latitude]);

    // Check if projection is ready to avoid NaN errors
    if (!projectedCenter || !point1mEast) return;

    const basePixelLengthPerMeter = point1mEast[0] - projectedCenter[0];
    const currentPixelLengthPerMeter = basePixelLengthPerMeter * transform.k;
    const adaptive = getAdaptiveScaleDistance(currentPixelLengthPerMeter);
    const dynamicScaleLength = adaptive.distance * currentPixelLengthPerMeter;

    // Check if mobile device
    const isMobile = window.innerWidth <= 768;

    // FIXED POSITIONS: Independent of right panel state
    // Desktop: Fixed at 120px from left, aligned with zoom controls (bottom: 20px)
    // Mobile: Centered, higher to avoid zoom controls
    const xPos = isMobile ?
        (width - dynamicScaleLength) / 2 : // Center on mobile
        120; // Fixed left position on desktop (independent of panel)
    const yPos = isMobile ?
        (height + 200) : // Higher on mobile to avoid zoom controls
        (height - 20); // Desktop: same height as zoom controls (bottom: 20px)

    // Calculate segment widths for the scale bar divisions (0, 1/3, 2/3, 1)
    const segment = dynamicScaleLength / 4;

    s.html("");

    // Add background rectangle for better visibility
    const bgPadding = isMobile ? 12 : 8;
    const bgHeight = isMobile ? 30 : 18;
    s.append("rect")
        .attr("x", xPos - bgPadding)
        .attr("y", yPos - (isMobile ? 10 : 7))
        .attr("width", dynamicScaleLength + (bgPadding * 2))
        .attr("height", bgHeight)
        .attr("fill", "rgba(255, 255, 255, 0.98)")
        .attr("rx", isMobile ? 10 : 6)
        .attr("ry", isMobile ? 10 : 6)
        .attr("opacity",0.7)
        .attr("rx", isMobile ? 10 : 6)
        .attr("ry", isMobile ? 10 : 6)
        .attr("opacity",0.7)

    // Main scale line
    const lineWeight = isMobile ? 0.5 : 0.5;
    s.append("line")
        .attr("x1", xPos)
        .attr("y1", yPos + 2)
        .attr("x2", xPos + dynamicScaleLength)
        .attr("y2", yPos + 2)
        .attr("stroke", "#333")
        .attr("stroke-width", lineWeight);

    // Add intermediate tick marks and labels
    const divisions = [0, 1 / 4, 2 / 4, 3 / 4, 1];

    // Calculate distance values and convert to appropriate units
    const distanceValues = divisions.map(d => {
        const distanceInMeters = adaptive.distance * d;
        if (adaptive.unit === 'km') {
            // Convert to kilometers
            const distanceInKm = distanceInMeters / 1000;
            return distanceInKm.toFixed(distanceInKm >= 10 ? 0 : 1);
        } else {
            // Keep as meters
            return distanceInMeters.toFixed(distanceInMeters >= 100 ? 0 : 1);
        }
    });

    divisions.forEach((division, index) => {
        const x = xPos + (dynamicScaleLength * division);

        // Tick mark
        const tickHeight = isMobile ? 9 : 5;
        const tickWeight = isMobile ? 0.5 : 0.5;
        s.append("line")
            .attr("x1", x)
            .attr("y1", yPos + 2)
            .attr("x2", x)
            .attr("y2", yPos + tickHeight)
            .attr("stroke", "#333")
            .attr("stroke-width", index === 0 || index === divisions.length - 1 ? tickWeight : tickWeight);

        // Label below tick
        if (index < divisions.length) {
            const fontSize = isMobile ? "11px" : "4.5px";
            const labelYOffset = isMobile ? 14 : 9;
            s.append("text")
                .attr("x", x)
                .attr("y", yPos + labelYOffset)
                .attr("text-anchor", "middle")
                .attr("font-size", fontSize)
                .attr("font-weight", "700")
                .attr("fill", "#222")
                .text(distanceValues[index]);
        }
    });

    // Unit label at the top center
    const titleFontSize = isMobile ? "9px" : "5px";
    const titleYOffset = isMobile ? -2 : 0;
    s.append("text")
        .attr("x", xPos + dynamicScaleLength / 2)
        .attr("y", yPos + titleYOffset)
        .attr("text-anchor", "middle")
        .attr("font-size", titleFontSize)
        .attr("font-weight", "700")
        .attr("fill", "#000000")
        .text(adaptive.unit || 'km');
}

// --- CENTRALIZED BASE MAP LOADING (without cities) ---
function loadBaseMapLayers() {
    Promise.all([
        d3.json("https://raw.githubusercontent.com/cfdvoices/Spain-Mapping-Project/main/Spain.geojson"),
        d3.json("https://raw.githubusercontent.com/cfdvoices/Spain-Mapping-Project/main/ID_autonomous_communities_all.geojson"),
        d3.json("https://raw.githubusercontent.com/cfdvoices/Spain-Mapping-Project/main/spainprovinces.geojson")
    ]).then(function ([regionData, autonomasData, provinceData]) {

        // 1. Set the projection using the main country shape
        projection.fitSize([width, height], regionData);

        // 2. Draw the Base Regions (Spain.geojson) - Background Layer
        g_map.selectAll("path")
            .data(regionData.features)
            .enter()
            .append("path")
            .attr("d", path)
            .attr("fill", "#e0e0e0")
            .attr("stroke", "none");

        // 3. Draw the Comunidades Autónomas - Middle Layer (no interactivity)
        g_autonomas.selectAll("path")
            .data(autonomasData.features)
            .enter()
            .append("path")
            .attr("d", path)
            .attr("fill", "#4d4d4d76")
            .attr("stroke", "rgb(230, 230, 230)")
            .attr("stroke-width", 0.2)
            .attr("class", "autonoma-boundary")
            .style("fill-opacity", 1)
            .style("pointer-events", "none"); // Disable autonoma interactivity

        // 4. Draw the Provinces - Detail Layer on top
        const validProvinces = provinceData.features.filter(function (d) {
            const area = d3.geoArea(d);
            return area < 1;
        });

        g_prov.selectAll("path")
            .data(validProvinces)
            .enter()
            .append("path")
            .attr("d", path)
            .attr("fill", "#ffffffff")
            .attr("stroke", "#d8d8d8ff")
            .attr("stroke-width", 0.2)
            .attr("class", "province-boundary")
            .style("pointer-events", "none"); // Disable province interactivity

        // 6. Initialize Scale Bar
        updateScaleBar(d3.zoomIdentity);

        // 7. Load initial city markers and labels (before criteria selection)
        loadInitialCityMarkers();

        console.log('Base map layers loaded successfully');

    }).catch(function (error) {
        console.error("Error loading map data:", error);
    });
}

// Load initial city markers and labels (shown before user selects criteria)
function loadInitialCityMarkers() {
    d3.json("https://raw.githubusercontent.com/cfdvoices/Spain-Mapping-Project/main/cities.geojson")
        .then(function (cities) {
            // Draw simple dots for cities
            const initialMarkers = g_cities.selectAll(".initial-city-marker")
                .data(cities.features)
                .enter()
                .append("circle")
                .attr("class", "initial-city-marker")
                .attr("cx", d => projection(d.geometry.coordinates)[0])
                .attr("cy", d => projection(d.geometry.coordinates)[1])
                .attr("r", 1.5)
                .attr("fill", "#667eea")
                .attr("stroke", "white")
                .attr("stroke-width", 0.3)
                .attr("opacity", 0.8)
                .style("cursor", userType === 'tourist' ? 'pointer' : 'default')
                .on("dblclick", function (event, d) {
                    if (userType === 'tourist') {
                        const cityName = d.properties.city || "";
                        if (cityName) {
                            showCityDetailView(cityName);
                        }
                    }
                });

            // Draw labels for cities
            const initialLabels = g_labels.selectAll(".initial-city-label")
                .data(cities.features)
                .enter()
                .append("text")
                .attr("class", "initial-city-label")
                .attr("x", d => projection(d.geometry.coordinates)[0])
                .attr("y", d => projection(d.geometry.coordinates)[1] - 3)
                .text(d => d.properties.city || "")
                .attr("font-size", "2px")
                .attr("text-anchor", "middle")
                .attr("fill", "#333")
                .attr("font-weight", "800")
                .attr("opacity", 0.9)
                .style("pointer-events", "none");

            console.log('Initial city markers loaded');
        })
        .catch(function (error) {
            console.error("Error loading initial city markers:", error);
        });
}

function loadCities(currentTransform = null) {
    // Remove initial city markers and labels when loading actual cities
    g_cities.selectAll(".initial-city-marker").remove();
    g_labels.selectAll(".initial-city-label").remove();

    // Clear existing cities
    g_cities.selectAll("*").remove();

    d3.json("https://raw.githubusercontent.com/cfdvoices/Spain-Mapping-Project/main/cities.geojson")
        .then(function (cities) {

            // Debug: Log first city's properties to see actual column names
            if (cities.features.length > 0) {
                console.log('First city properties:', cities.features[0].properties);
                console.log('Property keys:', Object.keys(cities.features[0].properties));
            }

            // Calculate index of choice for each city
            // Data is already normalized in the GeoJSON
            cities.features.forEach(feature => {
                feature.properties.indexOfChoice = calculateIndexOfChoice(feature.properties);
            });

            // Find min and max index values for scaling
            const indexValues = cities.features.map(d => d.properties.indexOfChoice);
            const minIndex = d3.min(indexValues);
            const maxIndex = d3.max(indexValues);

            console.log('Index of Choice range:', minIndex.toFixed(2), 'to', maxIndex.toFixed(2));
            console.log('All index values:', indexValues.map(v => v.toFixed(2)));

            // Create radius scale based on index of choice (reduced max size)
            const radiusScale = d3.scaleSqrt()
                .domain([minIndex, maxIndex])
                .range([1, 5]); // Reduced from [2, 10] to [1, 5]

            // Store globally for legend
            window.currentRadiusScale = radiusScale;

            // Creation of the color scale for the circles representation
            const colorScale = d3.scaleLinear()
                .domain([minIndex, (minIndex + maxIndex) / 2, maxIndex])
                .range(['#044613ff', '#2e8d57ff', '#3dde83ff']);

            const cityCircles = g_cities.selectAll("circle")
                .data(cities.features)
                .enter()
                .append("circle")
                .attr("class", "city-point")
                .attr('cx', function (d) {
                    const coords = projection(d.geometry.coordinates);
                    return coords ? coords[0] : 0;
                })
                .attr('cy', function (d) {
                    const coords = projection(d.geometry.coordinates);
                    return coords ? coords[1] : 0;
                })
                .attr("r", function (d) {
                    return radiusScale(d.properties.indexOfChoice);
                })
                .attr("fill", function (d) {
                    return colorScale(d.properties.indexOfChoice);
                })
                .attr("stroke", "black")
                .attr("stroke-width", 0.2)
                .style("cursor", userType === 'tourist' ? 'pointer' : 'default')
                .style("opacity", 0.8)
                .style("pointer-events", "all"); // Ensure cities are interactive

            // City tooltip (mouseover)
            cityCircles.on("mouseover", function (event, d) {
                // Instant highlight without transition
                d3.select(this)
                    .raise()
                    .attr("stroke", "#FFD700")
                    .attr("stroke-width", 0.5)
                    .style("opacity", 1);

                const x = event.pageX;
                const y = event.pageY;

                // Detect mobile for responsive tooltip sizing
                const isMobileTooltip = window.innerWidth <= 768;
                
                // Responsive sizing variables (50% smaller on mobile)
                const sizes = isMobileTooltip ? {
                    minWidth: '125px',
                    headerPadding: '5px',
                    headerFont: '8px',
                    subtitleFont: '8px',
                    subtitlePadding: '3px',
                    cellPadding: '3px',
                    cellFont: '8px',
                    prioritiesFont: '8px',
                    prioritiesPadding: '4px 3px 3px 3px',
                    iconFont: '10px',
                    nameFont: '8px',
                    barHeight: '9px',
                    barRadius: '2px',
                    valueFont: '6px',
                    valuePadding: '1px',
                    indicatorFont: '5px',
                    gap: '4px'
                } : {
                    minWidth: '250px',
                    headerPadding: '10px',
                    headerFont: '16px',
                    subtitleFont: '16px',
                    subtitlePadding: '6px',
                    cellPadding: '6px',
                    cellFont: '16px',
                    prioritiesFont: '16px',
                    prioritiesPadding: '8px 6px 6px 6px',
                    iconFont: '20px',
                    nameFont: '16px',
                    barHeight: '18px',
                    barRadius: '4px',
                    valueFont: '12px',
                    valuePadding: '2px',
                    indicatorFont: '10px',
                    gap: '8px'
                };

                // Build detailed tooltip with inline styles
                let tooltipHTML = '<div style="font-family: Arial, sans-serif;">';
                tooltipHTML += '<table style="border-collapse: collapse; min-width: ' + sizes.minWidth + '; background: white;">';

                const bgColor = colorScale(d.properties.indexOfChoice);
                tooltipHTML += '<tr><th colspan="2" style="background-color: ' + bgColor + '; color: white; padding: ' + sizes.headerPadding + '; text-align: center; font-size: ' + sizes.headerFont + '; font-weight: bold;">' + d.properties.city + '</th></tr>';

                tooltipHTML += '<tr><td colspan="2" style="font-size: ' + sizes.subtitleFont + '; font-style: italic; padding: ' + sizes.subtitlePadding + '; text-align: center; color: #666;">Ciudad</td></tr>';

                tooltipHTML += '<tr style="border-top: 1px solid #eee;"><td style="padding: ' + sizes.cellPadding + '; font-weight: bold; font-size: ' + sizes.cellFont + ';">Population:</td><td style="padding: ' + sizes.cellPadding + '; text-align: right; font-size: ' + sizes.cellFont + ';">' + d.properties.population.toLocaleString() + '</td></tr>';

                tooltipHTML += '<tr style="border-top: 1px solid #eee;"><td style="padding: ' + sizes.cellPadding + '; font-weight: bold; font-size: ' + sizes.cellFont + ';">Index of Choice:</td><td style="padding: ' + sizes.cellPadding + '; text-align: right; font-weight: bold; color: ' + bgColor + '; font-size: ' + sizes.cellFont + ';">' + d.properties.indexOfChoice.toFixed(1) + '</td></tr>';

                // Show which criteria contributed with bar charts
                if (window.userCriteria && window.userCriteria.length > 0) {
                    tooltipHTML += '<tr><td colspan="2" style="padding: ' + sizes.prioritiesPadding + '; font-weight: bold; font-size: ' + sizes.prioritiesFont + '; border-top: 2px solid #ccc;">Your priorities:</td></tr>';

                    // Get current attributes based on user type and season
                    const currentAttributes = getCityDataAttributes(userType, selectedSeason);

                    window.userCriteria.forEach(criterion => {
                        const attributeInfo = currentAttributes[criterion.id];

                        // Get NORMALIZED value for bar chart (0-10 scale typically)
                        const normalizedValue = d.properties[attributeInfo.normalized];
                        const scoreValue = parseEuropeanFloat(normalizedValue);
                        // Convert to percentage (0-100) for bar width, assuming 0-10 scale
                        const scorePercent = Math.min(100, Math.max(0, (scoreValue / 10) * 100));

                        // Get REAL value for display
                        const realValue = d.properties[attributeInfo.real];
                        
                        // Check if realValue exists and is not an empty string
                        let displayValue;
                        if (realValue === undefined || realValue === null || realValue === '') {
                            displayValue = 'N/A';
                        } else {
                            const realValueParsed = parseEuropeanFloat(realValue);
                            
                            // Determine unit based on criterion and user type
                            let unit = attributeInfo.unit;
                            if (criterion.id === 'housing') {
                                // Housing costs: €/month for migrants, €/night for tourists
                                unit = userType === 'tourist' ? '€/night' : '€/month';
                            }
                            
                            displayValue = realValueParsed.toLocaleString(undefined, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 2
                            }) + unit;
                        }

                        // Determine bar color based on normalized score (0-10 scale)
                        let barColor = '#ff4444'; // Red for low scores
                        if (scoreValue >= 7) {
                            barColor = '#2ca25f'; // Green for high scores (7-10)
                        } else if (scoreValue >= 4) {
                            barColor = '#99d8c9'; // Teal for medium scores (4-7)
                        }

                        // Prepare bar content - show relationship indicator
                        let barContent = '';
                        if (attributeInfo.inverse) {
                            barContent = '<span style="position: absolute; left: 2px; top: 50%; transform: translateY(-50%); font-size: ' + sizes.indicatorFont + '; font-weight: bold; color: #333;">⚠ lower is better</span>';
                        } else {
                            barContent = '<span style="position: absolute; left: 2px; top: 50%; transform: translateY(-50%); font-size: ' + sizes.indicatorFont + '; font-weight: bold; color: #333;">✓ higher is better</span>';
                        }

                        // Always show normalized score on the right side
                        const normalizedScoreText = scoreValue.toFixed(1) + '/10';

                        tooltipHTML += '<tr><td colspan="2" style="padding: ' + sizes.cellPadding + ';">';
                        tooltipHTML += '<div style="display: flex; align-items: center; gap: ' + sizes.gap + ';">';
                        tooltipHTML += '<span style="font-size: ' + sizes.iconFont + ';">' + criterion.icon + '</span>';
                        tooltipHTML += '<div style="flex: 1;">';
                        tooltipHTML += '<div style="font-size: ' + sizes.nameFont + '; font-weight: 600; margin-bottom: 1px;">' + criterion.name + '</div>';
                        tooltipHTML += '<div style="background: #e9ecef; height: ' + sizes.barHeight + '; border-radius: ' + sizes.barRadius + '; overflow: hidden; position: relative;">';
                        tooltipHTML += '<div style="background: ' + barColor + '; height: 100%; width: ' + scorePercent + '%; transition: width 0.3s ease;"></div>';
                        tooltipHTML += barContent;
                        tooltipHTML += '</div>';
                        tooltipHTML += '<div style="font-size: ' + sizes.valueFont + '; color: #666; margin-top: ' + sizes.valuePadding + '; display: flex; justify-content: space-between;">';
                        tooltipHTML += '<span>Value: ' + displayValue + '</span>';
                        tooltipHTML += '<span style="color: #667eea; font-weight: 600;">' + normalizedScoreText + '</span>';
                        tooltipHTML += '</div>';
                        tooltipHTML += '</div>';
                        tooltipHTML += '</div>';
                        tooltipHTML += '</td></tr>';
                    });
                }

                tooltipHTML += '</table>';
                tooltipHTML += '</div>';

                // Instant tooltip display
                // Smart tooltip positioning - keep it always visible on screen
                div.html(tooltipHTML)
                    .style("display", "block")
                    .style("opacity", 0); // Make invisible first to measure size

                // Get tooltip dimensions
                const tooltipNode = div.node();
                const tooltipRect = tooltipNode.getBoundingClientRect();
                const tooltipWidth = tooltipRect.width;
                const tooltipHeight = tooltipRect.height;

                // Get viewport dimensions
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;

                // Calculate initial position (offset from cursor)
                let left = x + 15;
                let top = y - 15;

                // Adjust horizontal position if tooltip goes off right edge
                if (left + tooltipWidth > viewportWidth) {
                    left = x - tooltipWidth - 15; // Show on left side of cursor
                }

                // Adjust horizontal position if tooltip goes off left edge
                if (left < 0) {
                    left = 10; // Pin to left edge with padding
                }

                // Adjust vertical position if tooltip goes off bottom edge
                if (top + tooltipHeight > viewportHeight) {
                    top = viewportHeight - tooltipHeight - 10; // Pin above bottom
                }

                // Adjust vertical position if tooltip goes off top edge
                if (top < 0) {
                    top = 10; // Pin below top with padding
                }

                // Apply final position and make visible
                div.style("left", left + "px")
                    .style("top", top + "px")
                    .style("opacity", 0.98);
            });

            // City tooltip out (mouseout)
            cityCircles.on("mouseout", function () {
                // Instant hide without transition
                d3.select(this)
                    .attr("stroke", "black")
                    .attr("stroke-width", 0.2)
                    .style("opacity", 0.8);

                // Instant hide tooltip
                div.style("opacity", 0)
                    .style("display", "none");
            });

            // Double-click handler for tourist mode (opens city detail view)
            cityCircles.on("dblclick", function (event, d) {
                if (userType === 'tourist') {
                    const cityName = d.properties.city || "";
                    if (cityName) {
                        showCityDetailView(cityName);
                    }
                }
            });

            // Initialize proportional symbol legend
            if (!proportionalLegendGroup) {
                initializeProportionalLegend();
            }
            // Update legend with current zoom level
            updateProportionalLegend(1); // Start at zoom level 1

        })
        .catch(function (error) {
            console.error("Error loading cities:", error);
        });
}
// ===== CITY DETAIL VIEW FUNCTIONS =====

function showCityDetailView(cityName) {
    console.log('Opening city detail view for:', cityName);

    // Hide main map and UI elements
    document.getElementById('mapContainer').style.display = 'none';
    document.getElementById('legend').style.display = 'none';
    document.getElementById('zoomControls').style.display = 'none';

    // Hide criteria panel
    const criteriaPanel = document.getElementById('criteriaPanel');
    if (criteriaPanel) {
        criteriaPanel.style.display = 'none';
    }

    // Show city detail view
    const cityDetailView = document.getElementById('cityDetailView');
    cityDetailView.style.display = 'block';

    // Set city title
    document.getElementById('cityDetailTitle').textContent = cityName;

    // Load city detail map
    loadCityDetailMap(cityName);
}

function hideCityDetailView() {
    console.log('Returning to Spain map');

    // Show main map and UI elements
    document.getElementById('mapContainer').style.display = 'block';
    document.getElementById('legend').style.display = 'block';
    document.getElementById('zoomControls').style.display = 'flex';

    // Show criteria panel
    const criteriaPanel = document.getElementById('criteriaPanel');
    if (criteriaPanel) {
        criteriaPanel.style.display = 'block';
    }

    // Hide city detail view
    document.getElementById('cityDetailView').style.display = 'none';

    // Clear city detail map
    const container = document.getElementById('cityDetailMapContainer');
    container.innerHTML = '';

    // Remove tourism legend if exists
    const existingLegend = document.querySelector('.tourism-legend');
    if (existingLegend) {
        existingLegend.remove();
    }
}

function loadCityDetailMap(cityName) {
    const container = document.getElementById('cityDetailMapContainer');
    container.innerHTML = ''; // Clear previous content

    console.log('Loading city detail map for:', cityName);
    console.log('Container dimensions:', container.clientWidth, 'x', container.clientHeight);

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // Create SVG for city detail map (completely independent from main map)
    const citySvg = d3.select("#cityDetailMapContainer")
        .append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .attr("viewBox", [0, 0, width, height])
        .attr("preserveAspectRatio", "xMidYMid meet")
        .style("background", "radial-gradient(circle, rgba(89, 142, 255, 1) 0%, rgba(111, 166, 237, 1) 50%, rgba(89, 142, 255, 1) 100%)");

    // Create groups for layers (only border and tourism)
    const g_border = citySvg.append("g").attr("class", "city-border-layer");
    const g_tourism = citySvg.append("g").attr("class", "city-tourism-layer");

    // Create projection (independent from main map)
    const cityProjection = d3.geoMercator();
    const cityPath = d3.geoPath().projection(cityProjection);

    console.log('Loading city data from GitHub...');

    // Load city borders and tourism data
    Promise.all([
        d3.json("https://raw.githubusercontent.com/cfdvoices/Spain-Mapping-Project/main/cities_borders.geojson"),
        d3.json("https://raw.githubusercontent.com/cfdvoices/Spain-Mapping-Project/main/cities_tourism.geojson")
    ]).then(function ([bordersData, tourismData]) {

        console.log('Data loaded successfully');
        console.log('Total borders:', bordersData.features.length);
        console.log('Total tourism points:', tourismData.features.length);

        // Log first border properties to see structure
        if (bordersData.features.length > 0) {
            console.log('First border properties:', Object.keys(bordersData.features[0].properties));
            console.log('First border sample:', bordersData.features[0].properties);
        }

        // Filter for the specific city - try ALL property values
        const cityBorder = bordersData.features.filter(d => {
            // Get ALL property values and check if any matches the city name
            const props = d.properties;
            for (let key in props) {
                const value = String(props[key] || "");
                if (value.toLowerCase() === cityName.toLowerCase()) {
                    console.log(`Match found! Property "${key}" = "${value}"`);
                    return true;
                }
            }
            return false;
        });

        console.log('Matching city borders found:', cityBorder.length);

        if (cityBorder.length === 0) {
            console.error(`No border found for city: ${cityName}`);

            // Log all unique city-like property values
            const allCityValues = new Set();
            bordersData.features.forEach(d => {
                Object.values(d.properties).forEach(val => {
                    if (val && typeof val === 'string') {
                        allCityValues.add(val);
                    }
                });
            });
            console.log('All unique values in borders (first 20):', Array.from(allCityValues).slice(0, 20));

            // Show error message with better info
            citySvg.append("text")
                .attr("x", width / 2)
                .attr("y", height / 2 - 20)
                .attr("text-anchor", "middle")
                .attr("fill", "#667eea")
                .attr("font-size", "18px")
                .attr("font-weight", "bold")
                .text(`City border not found: ${cityName}`);

            citySvg.append("text")
                .attr("x", width / 2)
                .attr("y", height / 2 + 10)
                .attr("text-anchor", "middle")
                .attr("fill", "#666")
                .attr("font-size", "14px")
                .text('Check console for available cities');

            return;
        }

        // Log first tourism point properties to see structure
        if (tourismData.features.length > 0) {
            console.log('First tourism point properties:', Object.keys(tourismData.features[0].properties));
            console.log('First tourism point sample:', tourismData.features[0].properties);
        }

        // Filter tourism points for THIS CITY ONLY using the "layer" attribute
        const cityTourism = tourismData.features.filter(d => {
            const props = d.properties;

            // PRIMARY STRATEGY: Check the "layer" attribute
            // It has format "Tourism_CityName", so we strip "Tourism_" prefix
            if (props.layer) {
                const layerValue = String(props.layer);
                // Remove "Tourism_" prefix (case-insensitive)
                const layerCity = layerValue.replace(/^Tourism_/i, '');

                if (layerCity.toLowerCase() === cityName.toLowerCase()) {
                    return true;
                }
            }

            // FALLBACK STRATEGY: Check all other properties for city name match
            for (let key in props) {
                if (key === 'layer') continue; // Already checked above

                const value = String(props[key] || "");
                if (value.toLowerCase() === cityName.toLowerCase()) {
                    return true;
                }
            }

            return false; // Don't include points that don't match this city
        });

        console.log('Tourism points found for city:', cityTourism.length);
        console.log('Sample tourism types:', cityTourism.slice(0, 5).map(d =>
            d.properties.tourism_ty || d.properties.tourism_type || d.properties.type
        ));

        // Fit projection to TOURISM POINTS extent instead of city border
        if (cityTourism.length > 0) {
            // Create a FeatureCollection from tourism points for fitting
            const tourismCollection = {
                type: "FeatureCollection",
                features: cityTourism
            };
            cityProjection.fitSize([width, height], tourismCollection);
            console.log('Projection fitted to tourism points extent');
        } else {
            // Fallback: fit to city border if no tourism points
            cityProjection.fitSize([width, height], cityBorder[0]);
            console.log('Projection fitted to city border (no tourism points found)');
        }

        // Draw city border (will be shown in background)
        g_border.selectAll("path")
            .data(cityBorder)
            .enter()
            .append("path")
            .attr("d", cityPath)
            .attr("fill", "rgba(200, 200, 200, 0.3)")
            .attr("stroke", "#667eea")
            .attr("stroke-width", 2)
            .attr("stroke-dasharray", "5,5");

        console.log('City border drawn');

        // Store current zoom level for symbol scaling
        let currentCityZoom = 1;

        // Function to calculate symbol size based on zoom (10x smaller than before)
        function getSymbolSize(zoomLevel) {
            // Base size 1.6px at zoom 1, scales up to 3.2px at zoom 8
            // This makes symbols about 10 times smaller
            return Math.max(1.6, Math.min(3.2, 1.6 * Math.sqrt(zoomLevel)));
        }

        // Draw tourism points with dynamic sizing
        const tourismPoints = g_tourism.selectAll("text")
            .data(cityTourism)
            .enter()
            .append("text")
            .attr("class", "tourism-point")
            .attr("x", d => {
                const coords = cityProjection(d.geometry.coordinates);
                return coords ? coords[0] : 0;
            })
            .attr("y", d => {
                const coords = cityProjection(d.geometry.coordinates);
                return coords ? coords[1] : 0;
            })
            .text(d => {
                const type = d.properties.tourism_ty || d.properties.tourism_type ||
                    d.properties.type || d.properties.tourism || '';
                const emoji = tourismEmojis[type] || tourismEmojis[type.toLowerCase()] || '📍';
                return emoji;
            })
            .attr("font-size", getSymbolSize(1) + "px")
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .attr("cursor", "pointer")
            .style("filter", "drop-shadow(0px 2px 3px rgba(0,0,0,0.4))")
            .style("pointer-events", "all")
            .on("mouseover", function (event, d) {
                const type = d.properties.tourism_ty || d.properties.tourism_type ||
                    d.properties.type || d.properties.tourism || 'Unknown';
                const name = d.properties.name || d.properties.NAME || d.properties.Name || 'Unnamed';

                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr("font-size", (getSymbolSize(currentCityZoom) * 2.5) + "px");

                // Show simple tooltip
                const tooltip = d3.select("body").append("div")
                    .attr("class", "city-tourism-tooltip")
                    .style("position", "absolute")
                    .style("background", "white")
                    .style("padding", "10px 14px")
                    .style("border", "2px solid #667eea")
                    .style("border-radius", "8px")
                    .style("pointer-events", "none")
                    .style("z-index", "10000")
                    .style("font-size", "14px")
                    .style("box-shadow", "0 4px 12px rgba(0,0,0,0.2)")
                    .html(`<strong>${name}</strong><br><em>${type}</em>`)
                    .style("left", (event.pageX + 15) + "px")
                    .style("top", (event.pageY - 10) + "px")
                    .style("opacity", 0);

                tooltip.transition().duration(200).style("opacity", 1);
            })
            .on("mouseout", function () {
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr("font-size", getSymbolSize(currentCityZoom) + "px");

                d3.selectAll(".city-tourism-tooltip").remove();
            });

        console.log('Tourism points drawn:', tourismPoints.size());

        // Create tourism legend
        createTourismLegend(cityTourism);

        // Setup zoom for city detail map with dynamic symbol scaling
        const cityZoom = d3.zoom()
            .scaleExtent([1, 8])
            .on("zoom", function (event) {
                g_border.attr("transform", event.transform);
                g_tourism.attr("transform", event.transform);

                // Update current zoom level and symbol sizes
                currentCityZoom = event.transform.k;
                const newSize = getSymbolSize(currentCityZoom);

                g_tourism.selectAll(".tourism-point")
                    .attr("font-size", newSize + "px");
            });

        citySvg.call(cityZoom);
        citySvg.on("dblclick.zoom", null); // Disable double-click zoom

        // Setup city zoom button controls
        const cityZoomInBtn = document.getElementById('cityZoomInBtn');
        const cityZoomOutBtn = document.getElementById('cityZoomOutBtn');
        const cityZoomResetBtn = document.getElementById('cityZoomResetBtn');

        if (cityZoomInBtn) {
            cityZoomInBtn.onclick = function () {
                citySvg.transition().duration(750).call(cityZoom.scaleBy, 1.5);
            };
        }
        if (cityZoomOutBtn) {
            cityZoomOutBtn.onclick = function () {
                citySvg.transition().duration(750).call(cityZoom.scaleBy, 0.67);
            };
        }
        if (cityZoomResetBtn) {
            cityZoomResetBtn.onclick = function () {
                citySvg.transition().duration(750).call(cityZoom.transform, d3.zoomIdentity);
            };
        }

        console.log('City detail map fully loaded');

    }).catch(function (error) {
        console.error("Error loading city detail data:", error);

        // Show error message on map
        citySvg.append("text")
            .attr("x", width / 2)
            .attr("y", height / 2)
            .attr("text-anchor", "middle")
            .attr("fill", "red")
            .attr("font-size", "16px")
            .text(`Error loading city data: ${error.message}`);
    });
}

function createTourismLegend(tourismData) {
    // Get unique tourism types
    const types = new Set();
    tourismData.forEach(d => {
        const type = d.properties.tourism_ty || d.properties.tourism_type ||
            d.properties.type || '';
        if (type) types.add(type);
    });

    // Create legend HTML
    let legendHTML = '<div class="tourism-legend"><h3>Tourism Sites</h3>';

    const sortedTypes = Array.from(types).sort();
    sortedTypes.forEach(type => {
        const emoji = tourismEmojis[type] || '📍';
        const label = type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        legendHTML += `
            <div class="tourism-legend-item">
                <span class="tourism-emoji">${emoji}</span>
                <span>${label}</span>
            </div>
        `;
    });

    legendHTML += '</div>';

    // Add legend to city detail view
    const cityDetailView = document.getElementById('cityDetailView');
    const existingLegend = cityDetailView.querySelector('.tourism-legend');
    if (existingLegend) {
        existingLegend.remove();
    }
    cityDetailView.insertAdjacentHTML('beforeend', legendHTML);
}

// Setup back button
document.addEventListener('DOMContentLoaded', function () {
    const backBtn = document.getElementById('backToMapBtn');
    if (backBtn) {
        backBtn.addEventListener('click', hideCityDetailView);
    }
});

// ===== METHODOLOGY MODAL FUNCTIONALITY =====

const methodologyData = [
    {
        link: "https://es.wikipedia.org/wiki/Anexo:Provincias_de_Espa%C3%B1a_por_PIB",
        code: "real_GDP_percapita",
        name: "GDP per capita",
        source: "Wikipedia",
        methodology: "1) Acess the Province level data for all the selected provinces from our cities.\n2) Collect the data in a table"
    },
    {
        link: "https://www.ine.es/jaxiT3/Tabla.htm?t=30687&L=0",
        code: "real_Life_expectancy",
        name: "Life expectancy",
        source: "National Institute of Statistics Spain",
        methodology: "1) Compile all the data of each city's newborns life expectancies from the original source (no adjustments required)"
    },
    {
        link: "https://www.elconfidencial.com/espana/2023-03-26/el-mapa-de-la-educacion-en-espana-descubre-el-nivel-de-estudios-de-tus-vecinos-calle-a-calle_3598890/",
        code: "real_Education_years",
        name: "Education years",
        source: "El Confidencial",
        methodology: "1) Compile all the data of average education years from the original source (no adjustments required)"
    },
    {
        link: "https://atlasau.mitma.gob.es/#bbox=-847794,5370217,1810191,995874&c=indicator&i=pobevo.densidad&s=2022&view=map4",
        code: "real_Population_density",
        name: "Population density",
        source: "Ministry of Housing and Urban Agenda Spain",
        methodology: "1) Acess the Digital Atlas of Urban Areas of Spain\n2) Collect population density values for the corresponding Municipalities / Cities during 2022"
    },
    {
        link: "https://centrodedescargas.cnig.es/CentroDescargas/redes-transporte",
        code: "real_Avg_Closest_station",
        name: "Station Remoteness",
        source: "Open Street Maps and Public Opendatasoft Data",
        methodology: "1) Download OSM data for each city, as well as the train/tram stops (using the OSM Downloader extension within QGIS)\n2) Download the administrative borders of all Municipalities within Spain\n3) Filter and export relevant features from the OSM main layer (general points and polygons layer) using QGIS and export them in geographic coordinates WGS 84\n4) Create a new model within Model Builder from ArcGIS\n5) Preprocess all features: Reproject all of them to ETRS 1989 LAEA (European Standard, equal area projection). Repair geometry for all polygon feeatures. Filter out the specific points features from OSM contained within the municipality polygon\n3) Filter \"stop_position\" within the \"other tags\" attribute for the points features, to extract only public transport stops. Repeat to filter out only buildings from the polygons layer\n4) Create random points inside each Municipality according to their area and a density of 0,0001 points per square meter. Calculate the distance to the closest neighbour inside the bus stops layer, for each feature\n5) Calculate aggregate statistics in order to get the average distance to get to the closest stop."
    },
    {
        link: "https://console.apify.com/actors/REcGj6dyoIJ9Z7aE6/input",
        code: "real_Rent_cost",
        name: "Cost of housing",
        source: "Idealista Scraper (Apify) and Inside Airbnb Data",
        methodology: "1) Scrape housing rent prices for one bedroom on each city inside Idealista, one of the largest Proptechs in Spain, (at least 300 places per city)\n2) Calculate the average price per city - specify that it corresponds to only one single bedroom per city\n3) Repeat the same process but instead of using Airbnb or Booking.com, data which will be used solely for touristic purposes."
    },
    {
        link: "https://www.ine.es/jaxiT3/Tabla.htm?t=76092",
        code: "real_Food_cost",
        name: "Cost of food",
        source: "National Institute of Statistics Spain / Numbeo",
        methodology: "1) Access each city cost of food in numbeo and calculate a average for every city.\n2) Compile the data for each city in a separate table."
    },
    {
        link: "https://www.numbeo.com/cost-of-living/",
        code: "real_Services_cost",
        name: "Cost of basic services (utilities)",
        source: "Numbeo",
        methodology: "1) Access the average of utilities under \"Utilities (Monthly)\" for each city\n2) Collect all of the data for each city"
    },
    {
        link: "https://www.kaggle.com/datasets/alexgczs/monthly-temperature-in-spain-1996-2023",
        code: "real_Weather",
        name: "Climate (T/H/P)",
        source: "Kaggle",
        methodology: "1) Collect the values of all main variables for all"
    },
    {
        link: "https://apify.com/bebity/linkedin-jobs-scraper",
        code: "real_Job_offers",
        name: "Job opportunities",
        source: "LinkedIn Jobs Scraper (Apify)",
        methodology: "1) Scrape the max possible number of LinkedIn job offers using Apify free credits for each city\n2) Divide the amount of job offers for each city by the population of each city."
    },
    {
        link: "https://estadisticasdecriminalidad.ses.mir.es/publico/portalestadistico/datos.html?type=jaxi&title=Hechos%20conocidos&path=/Datos1/",
        code: "real_Criminality_rate",
        name: "Criminality rates",
        source: "Ministry of Interior Spain",
        methodology: "1) Download the official data of census population from the National Institute From Statistics\n2) Compile the crimes count of 2022, from the Ministry of the Interior, only considering the categories against people, sexual liberty and \n3) Dissagregate crimes data per Municipality using the Urban Scale Law proportionally to the Population inside each City for each Province. The power used is the 1.15, according to bibliography and the thesis that most populated areas attarct the most criminal activities"
    },
    {
        link: "https://sinac.sanidad.gob.es/CiudadanoWeb/ciudadano/informacionAbastecimientoActionEntrada.do",
        code: "real_Water_quality",
        name: "Water quality",
        source: "Ministry of Health Spain",
        methodology: "1) Access the Ministry of Health portal to get each city data for the specified criteria (fecal coliforms, conductivity, pH, turbidity and chlorine)\n2) Copy the data into the proper format\n3) Calculate the indexes using the permitted values and the"
    },
    {
        link: "https://www.miteco.gob.es/content/dam/miteco/es/calidad-y-evaluacion-ambiental/sgecocir/residuos-municipales/Memoria%20anual%20de%20generaci%C3%B3n%20y%20gesti%C3%B3n%20de%20residuos%202022.pdf",
        code: "real_Recycling_rate",
        name: "Recycling rates",
        source: "Ministry For Ecological Transition And The Demographic Challenge",
        methodology: "1) Collect the recycling rate, measured as the quantity of waste separated at source before collection, divided by the overall solid waste collected, per autonomous community\n2) Apply the same rate that exist on a broader Autonomous Community level to the Municipality"
    },
    {
        link: "https://atlasau.mitma.gob.es/#bbox=-661621,5096106,559723,401808&c=indicator&i=sueocup.ocupa024&s=2016&view=map5",
        code: "real_Green_space_per_capita",
        name: "Green Space per Capita",
        source: "Ministry of Housing and Urban Agenda Spain",
        methodology: "1) We uploaded your custom administrative boundaries (municipalities) to Google Earth Engine Assets as a Shapefile, after cleaning the geometry and attributes (specifically creating the Official_4 column for city names) to avoid upload errors.\n2) Instead of raw satellite imagery, we loaded the Dynamic World V1 dataset for the year 2022, which provides high-resolution (10m) land cover probabilities derived from Sentinel-2 data.\n3) We created a \"Mode Composite\" to determine the most frequent land cover class for each pixel in 2022 and defined a \"Green Mask\" by isolating pixels classified as Trees (Class 1) or Grass (Class 2).\n4) We applied a spatial reducer (reduceRegions) to sum the area of the masked green pixels within each city boundary, using the EPSG:3035 (European Equal Area) projection and a high tileScale to ensure accuracy and prevent processing timeouts.\n5) Finally, we formatted the output to include only the relevant city names and calculated green areas (in square meters) and exported the results as a clean CSV file to Google Drive for further analysis.\n6) We finalized the analysis checking if the results made sense, by dividing the overall green cover by the total area of each municipality, and then after checking that all values made sense, the green area in square metes was divided by the overall population of each area from 2022."
    },
    {
        link: "https://www.ign.es/web/resources/sismologia/www/dir_images_terremotos/mapas_sismicidad/peligrosidadaceleracion.jpg",
        code: "real_Natural_risks",
        name: "Natural hazard risks",
        source: "Geographic Institute Spain",
        methodology: "1) Open the latest sismic and flooding risks maps provided by the official Spanish institutions (updated to 2015)\n2) Use the available data and points in order to get the latest information about the sismic and flooding risk for each city."
    }
];

function setupMethodologyModal() {
    const methodologyBtn = document.getElementById('methodologyBtn');
    const modal = document.getElementById('methodologyModal');
    const closeBtn = document.getElementById('closeMethodologyBtn');

    if (!methodologyBtn || !modal || !closeBtn) return;

    // Open modal
    methodologyBtn.addEventListener('click', function () {
        modal.style.display = 'flex';
        loadMethodologyContent();
    });

    // Close modal
    closeBtn.addEventListener('click', function () {
        modal.style.display = 'none';
    });

    // Close on outside click
    modal.addEventListener('click', function (e) {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Close on escape key
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    });
}

function loadMethodologyContent() {
    const container = document.getElementById('methodologyContent');
    if (!container) return;

    container.innerHTML = methodologyData.map(item => `
        <div class="methodology-card">
            <div class="methodology-card-header">
                <div class="methodology-card-title">
                    <h3>${item.name}</h3>
                    <span class="criteria-code">${item.code}</span>
                </div>
            </div>
            <div class="source-name">📚 ${item.source}</div>
            <div class="methodology-text">${item.methodology}</div>
            <a href="${item.link}" target="_blank" class="source-link">
                🔗 View Source
            </a>
        </div>
    `).join('');
}

// ===== INCOMING CALL & INTRO MODAL LOGIC =====

const startExperienceOverlay = document.getElementById("startExperienceOverlay");
const startExperienceBtn = document.getElementById("startExperienceBtn");
const callOverlay = document.getElementById("callOverlay");
const introModal = document.getElementById("introModal");
const mapSection = document.getElementById("mapSection");
const zoomControls = document.getElementById("zoomControls");

const answerBtn = document.getElementById("answerCall");
const declineBtn = document.getElementById("declineCall");
const closeIntroBtn = document.getElementById("closeIntro");
const closeCallBtn = document.getElementById("closeCallOverlay");

// Create audio element for ringtone
const ringtone = new Audio(
    "https://raw.githubusercontent.com/cfdvoices/Spain-Mapping-Project/main/nokia-ringtone.mp3"
);
ringtone.loop = true;
ringtone.preload = "auto";
ringtone.volume = 1.0;

// Track ringtone playback state
let ringtoneHasPlayed = false;
let audioUnlocked = false;
let experienceStarted = false;

// Wait for audio to be loaded
ringtone.addEventListener('canplaythrough', () => {
    console.log("Audio loaded and ready");
}, { once: true });

// Force load the audio
ringtone.load();

// START EXPERIENCE BUTTON - This is the key to unlocking audio
startExperienceBtn.addEventListener("click", async () => {
    console.log("Start Experience button clicked - unlocking audio");
    
    // Hide start overlay with fade out
    startExperienceOverlay.style.transition = "opacity 0.5s ease";
    startExperienceOverlay.style.opacity = "0";
    
    setTimeout(() => {
        startExperienceOverlay.style.display = "none";
    }, 500);
    
    // Mark experience as started
    experienceStarted = true;
    
    // Unlock and play audio immediately after user click
    try {
        ringtone.currentTime = 0;
        await ringtone.play();
        audioUnlocked = true;
        console.log("✓ Audio unlocked and playing!");
        
        // Show call overlay after a short delay
        setTimeout(() => {
            callOverlay.style.display = "flex";
        }, 800);
        
    } catch (error) {
        console.log("Audio playback error:", error);
        // Even if audio fails, show the call overlay
        setTimeout(() => {
            callOverlay.style.display = "flex";
            // Try playing again
            ringtone.currentTime = 0;
            ringtone.play().catch(e => console.log("Second play attempt failed:", e));
        }, 800);
    }
});

// Function to stop ringtone
function stopRingtone() {
    ringtone.pause();
    ringtone.currentTime = 0;
    ringtoneHasPlayed = true;
    console.log("Ringtone stopped and reset");
}

// Show call overlay after page loads
// Show start experience overlay when page loads
window.addEventListener('load', () => {
    console.log("Page loaded - showing start experience overlay");
    // Start experience overlay is already visible by default
    // User must click the button to begin
});

// Answer button - show intro modal
answerBtn.addEventListener("click", () => {
    stopRingtone();
    callOverlay.style.display = "none";
    introModal.style.display = "flex";
});

// Decline button - go directly to map
declineBtn.addEventListener("click", () => {
    stopRingtone();
    callOverlay.style.display = "none";
    showMapSection();
});

// Close call overlay button - go directly to map
closeCallBtn.addEventListener("click", () => {
    stopRingtone();
    callOverlay.style.display = "none";
    showMapSection();
});

// Close intro button - show map
closeIntroBtn.addEventListener("click", () => {
    introModal.style.display = "none";
    showMapSection();
});

// Function to show map section
function showMapSection() {
    // Map section is always visible now (no map-hidden class removal needed)
    // Just make sure it's displayed
    mapSection.style.display = "block";
    if (zoomControls) {
        zoomControls.style.display = "flex";
    }

    // Initialize the map if not already initialized
    if (!window.mapInitialized) {
        console.log("Initializing map after user interaction");
        initializeCriteriaPanel();
        initializeMapStructure();
        window.mapInitialized = true;
    }
}

// Close intro modal by clicking outside
introModal.addEventListener("click", function (e) {
    if (e.target === introModal) {
        introModal.style.display = "none";
        showMapSection();
    }
});

// Close intro modal with Escape key
document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
        if (introModal.style.display === "flex") {
            introModal.style.display = "none";
            showMapSection();
        }
        if (callOverlay.style.display === "flex") {
            stopRingtone();
            callOverlay.style.display = "none";
            showMapSection();
        }
    }
});

// Ensure ringtone stops if user navigates away
window.addEventListener('beforeunload', () => {
    stopRingtone();
});