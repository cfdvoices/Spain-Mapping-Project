// This script handles the interactive map with dynamic criteria selection
var width = 450;
var height = 250;
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

// Criteria data with icons
const criteria = [
  { id: 'gdp', name: 'Income potential', icon: '💰' },
  { id: 'population', name: 'Population Density', icon: '👥' },
  { id: 'transport', name: 'Stop Remoteness', icon: '🚇' },
  { id: 'housing', name: 'Housing Cost', icon: '🏠' },
  { id: 'food', name: 'Food Cost', icon: '🍽️' },
  { id: 'services', name: 'Service Cost', icon: '🛍️' },
  { id: 'climate', name: 'Climate Quality', icon: '☀️' },
  { id: 'crime', name: 'Safety Level', icon: '🛡️' },
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
const cityDataAttributes = {
    'gdp': {
        normalized: 'norm_GDP_percapita',
        real: 'real_GDP_percapita',
        unit: '€',
        label: 'GDP per Capita',
        inverse: false // Higher is better
    },
    'population': {
        normalized: 'norm_Population_density',
        real: 'real_Population_density',
        unit: ' people/km²',
        label: 'Population Density',
        inverse: false // Context dependent, treating as neutral
    },
    'transport': {
        normalized: 'norm_Avg_Closest_station',
        real: 'real_Avg_Closest_station',
        unit: ' km',
        label: 'Transport Access',
        inverse: true // Lower distance is better
    },
    'housing': {
        normalized: 'norm_Rent_cost',
        real: 'real_Rent_cost',
        unit: '€',
        label: 'Housing Cost',
        inverse: true // Lower cost is better
    },
    'food': {
        normalized: 'norm_Food_cost',
        real: 'real_Food_cost',
        unit: '€',
        label: 'Food Cost',
        inverse: true // Lower cost is better
    },
    'services': {
        normalized: 'norm_Services_cost',
        real: 'real_Services_cost',
        unit: '€',
        label: 'Service Cost',
        inverse: true // Lower cost is better
    },
    'climate': {
        normalized: 'norm_Weather',
        real: 'real_Weather',
        unit: '',
        label: 'Climate Quality',
        inverse: false // Higher is better
    },
    'crime': {
        normalized: 'norm_Criminality_rate',
        real: 'real_Criminality_rate',
        unit: '',
        label: 'Safety Level',
        inverse: true // Lower crime is better
    },
    'water': {
        normalized: 'norm_Water_quality',
        real: 'real_Water_quality',
        unit: '',
        label: 'Water Quality',
        inverse: false // Higher is better
    },
    'recycling': {
        normalized: 'norm_Recycling_rate',
        real: 'real_Recycling_rate',
        unit: '%',
        label: 'Recycling Rate',
        inverse: false // Higher is better
    },
    'greenspace': {
        normalized: 'norm_Green_space_per_capita',
        real: 'real_Green_space_per_capita',
        unit: ' m²',
        label: 'Green Space',
        inverse: false // Higher is better
    },
    'hazards': {
        normalized: 'norm_Natural_risks',
        real: 'real_Natural_risks',
        unit: '',
        label: 'Natural Safety',
        inverse: true // Lower risk is better
    },
    'education': {
        normalized: 'norm_Education_years',
        real: 'real_Education_years',
        unit: ' years',
        label: 'Education Level',
        inverse: false // Higher is better
    },
    'jobs': {
        normalized: 'norm_Job_offers',
        real: 'real_Job_offers',
        unit: '',
        label: 'Job Opportunities',
        inverse: false // Higher is better
    },
    'lifeexpectancy': {
        normalized: 'norm_Life_expectancy',
        real: 'real_Life_expectancy',
        unit: ' years',
        label: 'Life Expectancy',
        inverse: false // Higher is better
    }
};

// Initialize the application when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeCriteriaPanel();
    // Initialize the map structure (SVG, base layers) without cities
    initializeMapStructure();
});

// Initialize the criteria selection panel
function initializeCriteriaPanel() {
    const checkboxList = document.getElementById('criteriaCheckboxList');
    
    criteria.forEach(criterion => {
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
        checkbox.addEventListener('change', function() {
            handleCriterionSelection(criterion, this.checked);
        });
        
        // Make the whole item clickable
        item.addEventListener('click', function(e) {
            if (e.target.tagName !== 'INPUT') {
                checkbox.click();
            }
        });
        
        checkboxList.appendChild(item);
    });
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
        slider.addEventListener('input', function() {
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
document.getElementById('updateMapBtn').addEventListener('click', function() {
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
    projection = d3.geoConicEqualArea()
        .scale(1)
        .translate([0, 0]);

    path = d3.geoPath().projection(projection);

    /* D3 ZOOM CONTROL */
    // Define the zoom behavior with tighter limits
    zoom = d3.zoom()
        .scaleExtent([0.85, 3]) // Restricted zoom: slightly out to moderately in
        .translateExtent([
            [-width * 0.2, -height * 0.2],  // Top-left limit (20% beyond)
            [width * 1.2, height * 1.2]      // Bottom-right limit (20% beyond)
        ])
        .on("zoom", zoomed); // Specify the function to call on zoom events

    // Apply the zoom behavior to the SVG element
    svg.call(zoom);

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

    // Create container for pie chart in top-left
    const pieContainer = d3.select("#mapContainer")
        .append("div")
        .attr("id", "pieChartContainer")
        .style("position", "absolute")
        .style("top", "10px")
        .style("left", "10px")
        .style("background", "white")
        .style("border-radius", "12px")
        .style("padding", "15px")
        .style("box-shadow", "0 4px 12px rgba(0,0,0,0.15)")
        .style("z-index", "1000")
        .style("pointer-events", "all");

    // Add title
    pieContainer.append("div")
        .style("font-size", "14px")
        .style("font-weight", "bold")
        .style("margin-bottom", "10px")
        .style("text-align", "center")
        .style("color", "#333")
        .text("Your Priorities");

    // Create SVG for pie chart
    const pieWidth = 180;
    const pieHeight = 180;
    const radius = Math.min(pieWidth, pieHeight) / 2 - 10;

    const pieSvg = pieContainer.append("svg")
        .attr("width", pieWidth)
        .attr("height", pieHeight)
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
        .attr("stroke-width", 2)
        .style("opacity", 0.85)
        .on("mouseover", function(event, d) {
            d3.select(this)
                .style("opacity", 1)
                .style("cursor", "pointer");
            
            // Show tooltip
            div.html(`
                <div style="font-family: Arial, sans-serif; padding: 5px;">
                    <div style="font-size: 16px; margin-bottom: 5px;">${d.data.icon} ${d.data.name}</div>
                    <div style="font-size: 14px; font-weight: bold; color: ${colorScale(d.data.id)};">Weight: ${d.data.weight}%</div>
                </div>
            `)
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 15) + "px")
            .style("opacity", 0.98)
            .style("display", "block");
        })
        .on("mouseout", function() {
            d3.select(this)
                .style("opacity", 0.85);
            div.style("opacity", 0).style("display", "none");
        });

    // Add legend below pie chart
    const legend = pieContainer.append("div")
        .style("margin-top", "10px")
        .style("max-height", "120px")
        .style("overflow-y", "auto");

    window.userCriteria.forEach((criterion, i) => {
        const legendItem = legend.append("div")
            .style("display", "flex")
            .style("align-items", "center")
            .style("margin-bottom", "5px")
            .style("font-size", "11px");

        legendItem.append("div")
            .style("width", "12px")
            .style("height", "12px")
            .style("background", colorScale(criterion.id))
            .style("border-radius", "2px")
            .style("margin-right", "6px")
            .style("flex-shrink", "0");

        legendItem.append("div")
            .style("flex", "1")
            .style("color", "#333")
            .html(`${criterion.icon} ${criterion.name}: <strong>${criterion.weight}%</strong>`);
    });
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

    // For each selected criterion, multiply its weight by the city's NORMALIZED value
    Object.keys(userCriteriaWeights).forEach(criterionId => {
        const weight = userCriteriaWeights[criterionId];
        const attributeInfo = cityDataAttributes[criterionId];

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
                contribution: weight * value
            });
        }

        if (value === undefined || value === null) {
            console.warn(`Missing normalized value for "${normalizedAttrName}" in city ${cityProperties.city}`);
            return;
        }

        // Convert to number if it's a string
        value = parseFloat(value);

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

// --- ADAPTIVE SCALE BAR HELPER ---
function getAdaptiveScaleDistance(pixelLengthPerMeter) {
    const targetPixelLength = 120;
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

    let label;
    if (bestDistance >= 1000) {
        label = (bestDistance / 1000) + ' km';
    } else {
        label = bestDistance + ' m';
    }
    return { distance: bestDistance, label: label };
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
    if (!svg) return;
    
    // Add legend group to SVG (fixed position, doesn't move with zoom)
    proportionalLegendGroup = svg.append("g")
        .attr("class", "proportional-legend");
    
    // Add semi-transparent background (will be sized dynamically)
    proportionalLegendGroup.append("rect")
        .attr("class", "legend-background")
        .attr("fill", "rgba(255, 255, 255, 0.9)")
        .attr("rx", 6)
        .attr("ry", 6)
        .attr("stroke", "#ccc")
        .attr("stroke-width", 0.5);
    
    // Add title
    proportionalLegendGroup.append("text")
        .attr("class", "legend-title")
        .attr("font-size", "6px")
        .attr("font-weight", "600")
        .attr("fill", "#333")
        .text("Match Score");
}

function updateProportionalLegend(zoomLevel) {
    if (!proportionalLegendGroup || !window.currentRadiusScale) return;
    
    // Sample values for legend (low, medium, high)
    const legendValues = [
        { label: "High", value: 0.8 },
        { label: "Medium", value: 0.5 },
        { label: "Low", value: 0.2 }
    ];
    
    // Get current min/max from the radius scale domain
    const domain = window.currentRadiusScale.domain();
    const minIndex = domain[0];
    const maxIndex = domain[1];
    
    // Calculate actual index values for legend
    const legendIndices = legendValues.map(v => 
        minIndex + (maxIndex - minIndex) * v.value
    );
    
    // Get actual radii as they appear on the map (scaled by zoom)
    const legendRadii = legendIndices.map(idx => 
        window.currentRadiusScale(idx) * zoomLevel
    );
    
    // Calculate layout dimensions
    const maxRadius = Math.max(...legendRadii);
    const padding = 8;
    const titleHeight = 15;
    const startY = titleHeight + padding;
    const labelOffset = 35;
    
    // Calculate total height needed
    let totalHeight = startY + padding;
    legendRadii.forEach(r => {
        totalHeight += r * 2 + 8; // Add space for each circle plus gap
    });
    
    // Calculate background dimensions
    const bgWidth = labelOffset + 40;
    const bgHeight = totalHeight;
    const legendX = width - bgWidth - 15;
    const legendY = height - bgHeight - 120; // Adjusted to be closer to scale bar (was -140)
    
    // Update background position and size
    proportionalLegendGroup.select(".legend-background")
        .attr("x", legendX)
        .attr("y", legendY)
        .attr("width", bgWidth)
        .attr("height", bgHeight);
    
    // Update title position
    proportionalLegendGroup.select(".legend-title")
        .attr("x", legendX + bgWidth / 2)
        .attr("y", legendY + 10)
        .attr("text-anchor", "middle");
    
    // Remove old circles, labels, and lines
    proportionalLegendGroup.selectAll(".legend-circle").remove();
    proportionalLegendGroup.selectAll(".legend-label").remove();
    proportionalLegendGroup.selectAll(".legend-line").remove();
    
    // Draw circles from largest to smallest (top to bottom)
    let currentY = legendY + startY;
    
    legendValues.forEach((item, i) => {
        const radius = legendRadii[i];
        const circleY = currentY + radius;
        const circleX = legendX + padding + maxRadius;
        
        // Draw circle
        proportionalLegendGroup.append("circle")
            .attr("class", "legend-circle")
            .attr("cx", circleX)
            .attr("cy", circleY)
            .attr("r", radius)
            .attr("fill", "rgba(102, 126, 234, 0.25)")
            .attr("stroke", "#667eea")
            .attr("stroke-width", 0.8);
        
        // Draw line from circle edge to label
        proportionalLegendGroup.append("line")
            .attr("class", "legend-line")
            .attr("x1", circleX + radius)
            .attr("y1", circleY)
            .attr("x2", legendX + labelOffset - 2)
            .attr("y2", circleY)
            .attr("stroke", "#999")
            .attr("stroke-width", 0.3)
            .attr("stroke-dasharray", "1,1");
        
        // Add label
        proportionalLegendGroup.append("text")
            .attr("class", "legend-label")
            .attr("x", legendX + labelOffset)
            .attr("y", circleY + 2.5)
            .attr("font-size", "5px")
            .attr("fill", "#333")
            .text(item.label);
        
        // Move down for next circle
        currentY += radius * 2 + 8;
    });
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

    // Position in bottom-right corner at the very bottom
    const xPos = width - dynamicScaleLength - 20;
    const yPos = height + 15; // Moved to very bottom (was -20)

    s.html("");
    
    // Add background rectangle for better visibility
    s.append("rect")
        .attr("x", xPos - 6)
        .attr("y", yPos - 14)
        .attr("width", dynamicScaleLength + 12)
        .attr("height", 20)
        .attr("fill", "rgba(255, 255, 255, 0.85)")
        .attr("rx", 4)
        .attr("ry", 4);
    
    // Main scale line
    s.append("line")
        .attr("x1", xPos)
        .attr("y1", yPos)
        .attr("x2", xPos + dynamicScaleLength)
        .attr("y2", yPos)
        .attr("stroke", "#333")
        .attr("stroke-width", 0.8);

    // Scale text
    s.append("text")
        .attr("x", xPos + dynamicScaleLength / 2)
        .attr("y", yPos - 5)
        .attr("text-anchor", "middle")
        .attr("font-size", "6px")
        .attr("font-weight", "500")
        .attr("fill", "#333")
        .text(adaptive.label);

    // Left end tick
    s.append("line")
        .attr("x1", xPos)
        .attr("y1", yPos - 3)
        .attr("x2", xPos)
        .attr("y2", yPos + 3)
        .attr("stroke", "#333")
        .attr("stroke-width", 1);
    
    // Right end tick
    s.append("line")
        .attr("x1", xPos + dynamicScaleLength)
        .attr("y1", yPos - 3)
        .attr("x2", xPos + dynamicScaleLength)
        .attr("y2", yPos + 3)
        .attr("stroke", "#333")
        .attr("stroke-width", 1);
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
            .attr("fill", "#d4d4d4")
            .attr("stroke", "#8c8c8cff")
            .attr("stroke-width", 0.5)
            .attr("class", "autonoma-boundary")
            .style("fill-opacity", 0.3)
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

        // 5. Draw Labels
        g_labels.selectAll(".autonoma-label")
            .data(autonomasData.features)
            .enter()
            .append("text")
            .attr("class", "autonoma-label")
            .attr('x', function (d) {
                const centroid = d3.geoCentroid(d);
                return projection(centroid)[0];
            })
            .attr('y', function (d) {
                const centroid = d3.geoCentroid(d);
                return projection(centroid)[1];
            })
            .text(function (d) {
                return d.properties.code || d.properties.CODE ||
                    d.properties.name || d.properties.NAME || "";
            })
            .attr('font-size', '6px')
            .attr("text-anchor", "middle")
            .attr("fill", "#c7e8c7ff")
            .attr("font-weight", "bold")
            .attr("opacity", 0.7)
            .style("pointer-events", "none");

        // 6. Initialize Scale Bar
        updateScaleBar(d3.zoomIdentity);

        console.log('Base map layers loaded successfully');

    }).catch(function (error) {
        console.error("Error loading map data:", error);
    });
}

function loadCities() {
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
                .range(['#e5f5f9', '#99d8c9', '#2ca25f']);

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
                .attr("stroke", "white")
                .attr("stroke-width", 0.5)
                .style("cursor", "pointer")
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

                // Build detailed tooltip with inline styles
                let tooltipHTML = '<div style="font-family: Arial, sans-serif;">';
                tooltipHTML += '<table style="border-collapse: collapse; min-width: 250px; background: white;">';

                const bgColor = colorScale(d.properties.indexOfChoice);
                tooltipHTML += '<tr><th colspan="2" style="background-color: ' + bgColor + '; color: white; padding: 10px; text-align: center; font-size: 16px; font-weight: bold;">' + d.properties.city + '</th></tr>';

                tooltipHTML += '<tr><td colspan="2" style="font-size: 16px; font-style: italic; padding: 6px; text-align: center; color: #666;">Ciudad</td></tr>';

                tooltipHTML += '<tr style="border-top: 1px solid #eee;"><td style="padding: 6px; font-weight: bold; font-size: 16px;">Population:</td><td style="padding: 6px; text-align: right; font-size: 16px;">' + d.properties.population.toLocaleString() + '</td></tr>';

                tooltipHTML += '<tr style="border-top: 1px solid #eee;"><td style="padding: 6px; font-weight: bold; font-size: 16px;">Index of Choice:</td><td style="padding: 6px; text-align: right; font-weight: bold; color: ' + bgColor + '; font-size: 16px;">' + d.properties.indexOfChoice.toFixed(1) + '</td></tr>';

                // Show which criteria contributed with bar charts
                if (window.userCriteria && window.userCriteria.length > 0) {
                    tooltipHTML += '<tr><td colspan="2" style="padding: 8px 6px 6px 6px; font-weight: bold; font-size: 16px; border-top: 2px solid #ccc;">Your priorities:</td></tr>';

                    window.userCriteria.forEach(criterion => {
                        const attributeInfo = cityDataAttributes[criterion.id];
                        
                        // Get NORMALIZED value for bar chart (0-10 scale typically)
                        const normalizedValue = d.properties[attributeInfo.normalized];
                        const scoreValue = (normalizedValue !== undefined && normalizedValue !== null) ? parseFloat(normalizedValue) : 0;
                        // Convert to percentage (0-100) for bar width, assuming 0-10 scale
                        const scorePercent = Math.min(100, Math.max(0, (scoreValue / 10) * 100));

                        // Get REAL value for display
                        const realValue = d.properties[attributeInfo.real];
                        const displayValue = (realValue !== undefined && realValue !== null) ? 
                            parseFloat(realValue).toLocaleString(undefined, {maximumFractionDigits: 2}) + attributeInfo.unit : 
                            'N/A';

                        // Determine bar color based on normalized score (0-10 scale)
                        let barColor = '#ff4444'; // Red for low scores
                        if (scoreValue >= 7) {
                            barColor = '#2ca25f'; // Green for high scores (7-10)
                        } else if (scoreValue >= 4) {
                            barColor = '#99d8c9'; // Teal for medium scores (4-7)
                        }

                        // Add inverse indicator
                        const inverseIndicator = attributeInfo.inverse ? 
                            ' <span style="color: #ff6b6b; font-size: 14px;">⚠ lower is better</span>' : '';

                        tooltipHTML += '<tr><td colspan="2" style="padding: 6px;">';
                        tooltipHTML += '<div style="display: flex; align-items: center; gap: 8px;">';
                        tooltipHTML += '<span style="font-size: 20px;">' + criterion.icon + '</span>';
                        tooltipHTML += '<div style="flex: 1;">';
                        tooltipHTML += '<div style="font-size: 16px; font-weight: 600; margin-bottom: 2px;">' + criterion.name + ' <span style="color: #999;">(weight: ' + criterion.weight + '%)</span></div>';
                        tooltipHTML += '<div style="background: #e9ecef; height: 18px; border-radius: 4px; overflow: hidden; position: relative;">';
                        tooltipHTML += '<div style="background: ' + barColor + '; height: 100%; width: ' + scorePercent + '%; transition: width 0.3s ease;"></div>';
                        // Display normalized score inside the bar
                        tooltipHTML += '<span style="position: absolute; left: 4px; top: 50%; transform: translateY(-50%); font-size: 11px; font-weight: bold; color: #333;">' + scoreValue.toFixed(1) + '/10</span>';
                        tooltipHTML += '</div>';
                        tooltipHTML += '<div style="font-size: 16px; color: #666; margin-top: 2px;">Value: ' + displayValue + inverseIndicator + '</div>';
                        tooltipHTML += '</div>';
                        tooltipHTML += '</div>';
                        tooltipHTML += '</td></tr>';
                    });
                }

                tooltipHTML += '</table>';
                tooltipHTML += '</div>';

                // Instant tooltip display
                div.html(tooltipHTML)
                    .style("left", (x + 15) + "px")
                    .style("top", (y - 15) + "px")
                    .style("opacity", 0.98)
                    .style("display", "block");
            });

            // City tooltip out (mouseout)
            cityCircles.on("mouseout", function () {
                // Instant hide without transition
                d3.select(this)
                    .attr("stroke", "white")
                    .attr("stroke-width", 0.5)
                    .style("opacity", 0.8);

                // Instant hide tooltip
                div.style("opacity", 0)
                    .style("display", "none");
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