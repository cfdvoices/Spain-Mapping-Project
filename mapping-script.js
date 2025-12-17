// This script will run after the page loads and criteria are selected
// The map initialization is triggered from criteria-selector.js
var width = 450;
var height = 250;
var svg, g_map, g_autonomas, g_prov, g_labels, g_cities, s, projection, path, zoom;

// Onboarding functionality
document.getElementById('startButton').addEventListener('click', () => {
    const onboardingOverlay = document.getElementById('onboardingOverlay');
    const criteriaOverlay = document.getElementById('criteriaOverlay');

    // Fade out onboarding
    onboardingOverlay.classList.add('hidden');

    // Show criteria selector after animation
    setTimeout(() => {
        onboardingOverlay.style.display = 'none';
        criteriaOverlay.style.display = 'flex';
    }, 500);
});

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

// City data mapping - maps criterion IDs to actual GeoJSON property names
// Note: Property names have spaces, so we'll use bracket notation to access them
const cityDataAttributes = {
    'gdp': 'Test_GDP per capita',
    'population': 'Test_Population density',
    'transport': 'Test_Avg distance to bus station',
    'housing': 'Test_Monthly Cost of Rent',
    'food': 'Test_Monthly Cost of Food',
    'services': 'Test_Monthly Cost of services',
    'climate': 'Test_Temperature',
    'crime': 'Test_Criminality rate',
    'water': 'Test_Water quality',
    'recycling': 'Test_Recycling rates',
    'greenspace': 'Test_Green Space per Capita',
    'hazards': 'Test_Natural hazards risk',
    'education': 'Test_Education years',
    'jobs': 'Test_Job opportunities',
    'lifeexpectancy': 'Test_Life expectancy'
};

function initializeMap() {
    // Get the user criteria from window
    if (window.userCriteria) {
        console.log('User criteria loaded:', window.userCriteria);
        window.userCriteria.forEach(criterion => {
            userCriteriaWeights[criterion.id] = parseFloat(criterion.weight) / 100; // Normalize to 0-1
        });
        console.log('User criteria weights:', userCriteriaWeights);
    }

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
    projection = d3.geoEquirectangular()
        .scale(1)
        .translate([0, 0]);

    path = d3.geoPath().projection(projection);

    /* D3 ZOOM CONTROL */
    // Define the zoom behavior
    zoom = d3.zoom()
        .scaleExtent([0.5, 9]) // Set the zoom limits
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

    // Show controls
    document.getElementById('controls').style.display = 'block';

    // Load ALL data centrally
    loadAllMapData();
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

    // For each selected criterion, multiply its weight by the city's value
    Object.keys(userCriteriaWeights).forEach(criterionId => {
        const weight = userCriteriaWeights[criterionId];
        const attributeName = cityDataAttributes[criterionId];

        if (!attributeName) {
            console.warn(`No attribute mapping found for criterion: ${criterionId}`);
            return;
        }

        // IMPORTANT: Use bracket notation to access properties with spaces
        let value = cityProperties[attributeName];

        // Debug: log the first city's values
        if (debugInfo.length === 0) {
            debugInfo.push({
                criterion: criterionId,
                attributeName: attributeName,
                weight: weight,
                value: value,
                contribution: weight * value
            });
        }

        if (value === undefined || value === null) {
            console.warn(`Missing value for "${attributeName}" in city ${cityProperties.city}`);
            return;
        }

        // Convert to number if it's a string
        value = parseFloat(value);

        if (isNaN(value)) {
            console.warn(`Invalid number for "${attributeName}" in city ${cityProperties.city}: ${cityProperties[attributeName]}`);
            return;
        }

        // Add weighted contribution to index
        // Value is already 0-100, weight is 0-1, so result will be 0-100 range
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

    const xPos = 20;
    const yPos = height - 20;

    s.html("");
    s.append("line")
        .attr("x1", xPos).attr("y1", yPos)
        .attr("x2", xPos + dynamicScaleLength).attr("y2", yPos)
        .attr("stroke", "white").attr("stroke-width", 1);

    s.append("text")
        .attr("x", xPos + dynamicScaleLength / 2).attr("y", yPos - 6)
        .attr("text-anchor", "middle").attr("font-size", "7px")
        .attr("fill", "white")
        .text(adaptive.label);

    s.append("line").attr("x1", xPos).attr("y1", yPos - 5).attr("x2", xPos).attr("y2", yPos + 5).attr("stroke", "white");
    s.append("line").attr("x1", xPos + dynamicScaleLength).attr("y1", yPos - 5).attr("x2", xPos + dynamicScaleLength).attr("y2", yPos + 5).attr("stroke", "white");
}

// --- CENTRALIZED DATA LOADING ---
function loadAllMapData() {
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

        // 7. Load cities
        loadCities();

    }).catch(function (error) {
        console.error("Error loading map data:", error);
    });
}

function loadCities() {
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

            // Create radius scale based on index of choice
            const radiusScale = d3.scaleSqrt()
                .domain([minIndex, maxIndex])
                .range([2, 10]); // Adjusted range for better visibility

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

                tooltipHTML += '<tr><td colspan="2" style="font-size: 12px; font-style: italic; padding: 6px; text-align: center; color: #666;">Ciudad</td></tr>';

                tooltipHTML += '<tr style="border-top: 1px solid #eee;"><td style="padding: 6px; font-weight: bold;">Population:</td><td style="padding: 6px; text-align: right;">' + d.properties.population.toLocaleString() + '</td></tr>';

                tooltipHTML += '<tr style="border-top: 1px solid #eee;"><td style="padding: 6px; font-weight: bold;">Index of Choice:</td><td style="padding: 6px; text-align: right; font-weight: bold; color: ' + bgColor + ';">' + d.properties.indexOfChoice.toFixed(2) + '</td></tr>';

                // Show which criteria contributed with bar charts
                if (window.userCriteria && window.userCriteria.length > 0) {
                    tooltipHTML += '<tr><td colspan="2" style="padding: 8px 6px 6px 6px; font-weight: bold; font-size: 12px; border-top: 2px solid #ccc;">Your priorities:</td></tr>';

                    window.userCriteria.forEach(criterion => {
                        const attributeName = cityDataAttributes[criterion.id];
                        const rawValue = d.properties[attributeName];
                        const scoreValue = (rawValue !== undefined && rawValue !== null) ? parseFloat(rawValue) : 0;
                        // Convert 1-10 scale to percentage (0-100) for bar width
                        const scorePercent = Math.min(100, Math.max(0, (scoreValue / 10) * 100));

                        // Determine bar color based on score (1-10 scale)
                        let barColor = '#ff4444'; // Red for low scores
                        if (scoreValue >= 7) {
                            barColor = '#2ca25f'; // Green for high scores (7-10)
                        } else if (scoreValue >= 4) {
                            barColor = '#99d8c9'; // Teal for medium scores (4-7)
                        }

                        // Display original raw value without rounding
                        const displayValue = (rawValue !== undefined && rawValue !== null) ? rawValue : 'N/A';

                        tooltipHTML += '<tr><td colspan="2" style="padding: 6px;">';
                        tooltipHTML += '<div style="display: flex; align-items: center; gap: 8px;">';
                        tooltipHTML += '<span style="font-size: 14px;">' + criterion.icon + '</span>';
                        tooltipHTML += '<div style="flex: 1;">';
                        tooltipHTML += '<div style="font-size: 10px; font-weight: 600; margin-bottom: 2px;">' + criterion.name + ' <span style="color: #999;">(weight: ' + criterion.weight + '%)</span></div>';
                        tooltipHTML += '<div style="background: #e9ecef; height: 18px; border-radius: 4px; overflow: hidden; position: relative;">';
                        tooltipHTML += '<div style="background: ' + barColor + '; height: 100%; width: ' + scorePercent + '%; transition: width 0.3s ease;"></div>';
                        tooltipHTML += '<span style="position: absolute; right: 4px; top: 50%; transform: translateY(-50%); font-size: 10px; font-weight: bold; color: #333;">' + displayValue + '</span>';
                        tooltipHTML += '</div>';
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

        })
        .catch(function (error) {
            console.error("Error loading cities:", error);
        });
}