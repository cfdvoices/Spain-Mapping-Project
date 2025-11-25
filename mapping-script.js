// This script will run after the page loads and criteria are selected
// The map initialization is triggered from criteria-selector.js
var width = 450;
var height = 250;
var svg, g_map, g_autonomas, g_prov, g_labels, g_cities, s, projection, path, zoom;

var div = d3.select("body")
    .append("div")
    .attr("id", "tooltip")
    .attr("class", "tooltip")
    .style("opacity", 0);

// LEGEND SETUP
var legendWidth = 250
var legendHeight = 300
var legend = d3.select("#legend")
    .append("svg")
    .attr("width", legendWidth)
    .attr("height", legendHeight - 200)

var labels = ["Tilia cordata", "Acer negundo", "Pinus sylvestris"]
let legendColor = d3.scaleOrdinal()
    .domain(labels)
    .range(["DarkGreen", "GreenYellow", "Yellow"])

var rectangleWidth = 20
var rectangleHeight = 15
var symbolGap = 15
var symbolLabelGap = 35

//Properties of the legend symbols
legend.selectAll("legend-symbols")
    .data(labels)
    .enter()
    .append("rect")
    .attr("x", 0)
    .attr("y", function (d, i) {
        return i * (rectangleHeight + symbolGap) + 20
    })
    .attr("width", rectangleWidth)
    .attr("height", rectangleHeight)
    .attr("stroke", "black")
    .attr("stroke-width", 1)
    .style("fill", function (d) {
        return legendColor(d)
    })

//Properties of the legend labels
legend.selectAll("legend-labels")
    .data(labels)
    .enter()
    .append("text")
    .attr("x", symbolLabelGap + rectangleHeight)
    .attr("y", function (d, i) {
        return i * (rectangleHeight + symbolGap) + (rectangleHeight / 2) + 20
    })
    .style("fill", "black")
    .text(function (d) {
        return d
    })
    .attr("font-size", "14px")
    .attr("font-style", "italic")
    .attr("text-anchor", "left")
    .style("alignment-baseline", "middle")

// Global variable to store user criteria weights
var userCriteriaWeights = {};

function initializeMap() {
    // Get the user criteria from window
    if (window.userCriteria) {
        console.log('User criteria loaded:', window.userCriteria);
        window.userCriteria.forEach(criterion => {
            userCriteriaWeights[criterion.id] = parseFloat(criterion.weight);
        });
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

    // Load ALL data centrally
    loadAllMapData();
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

        // 3. Draw the Comunidades Autónomas - Middle Layer with interactivity
        g_autonomas.selectAll("path")
            .data(autonomasData.features)
            .enter()
            .append("path")
            .attr("d", path)
            .attr("fill", function (d) {
                // You can add color coding based on user criteria here
                return "#d4d4d4"; // Light gray fill
            })
            .attr("stroke", "#555555")
            .attr("stroke-width", 1.2)
            .attr("class", "autonoma-boundary")
            .style("cursor", "pointer")
            .style("fill-opacity", 0.3)
            .on("mouseover", function (event, d) {
                // Highlight on hover
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr("fill", "#a8d5ba")
                    .style("fill-opacity", 0.6)
                    .attr("stroke-width", 2);

                // Show tooltip
                div.transition()
                    .duration(50)
                    .style("opacity", 0.9);

                const container = document.getElementById("mapContainer");
                const box = container.getBoundingClientRect();
                const x = event.pageX - box.left - window.scrollX;
                const y = event.pageY - box.top - window.scrollY;

                // Build tooltip content based on available properties
                let tooltipContent = "<table>";

                // Try to get the name from various possible property names
                const name = d.properties.name || d.properties.NAME ||
                    d.properties.comunidad || d.properties.COMUNIDAD ||
                    d.properties.ccaa || "Comunidad Autónoma";

                tooltipContent += "<tr><th colspan='2' style='background-color: #a8d5ba;'>" + name + "</th></tr>";
                tooltipContent += "<tr><td colspan='2' style='font-size: 11px; font-style: italic;'>Comunidad Autónoma</td></tr>";

                // Add any other relevant properties
                if (d.properties.codigo || d.properties.CODIGO) {
                    tooltipContent += "<tr><td><strong>Código:</strong></td><td>" +
                        (d.properties.codigo || d.properties.CODIGO) + "</td></tr>";
                }

                tooltipContent += "</table>";

                div.html(tooltipContent)
                    .style("left", (x + 20) + "px")
                    .style("top", (y - 20) + "px")
                    .style("position", "absolute");
            })
            .on("mouseout", function () {
                // Remove highlight
                d3.select(this)
                    .transition()
                    .duration(300)
                    .attr("fill", "#d4d4d4")
                    .style("fill-opacity", 0.3)
                    .attr("stroke-width", 1.2);

                // Hide tooltip
                div.transition()
                    .duration(300)
                    .style("opacity", 0);
            })
            .on("click", function (event, d) {
                // Handle click events - you can add navigation or details here
                const name = d.properties.name || d.properties.NAME ||
                    d.properties.comunidad || d.properties.COMUNIDAD ||
                    "esta comunidad";
                console.log("Clicked on Comunidad:", name);
            });

        // 4. Draw the Provinces - Detail Layer on top
        // Filter out the exterior polygon that covers everything outside Spain
        const validProvinces = provinceData.features.filter(function (d) {
            // Filter out features that might be the exterior/inverse polygon
            // These typically have very large areas or specific properties
            const area = d3.geoArea(d);
            return area < 1; // Remove extremely large polygons (exterior ring)
        });

        g_prov.selectAll("path")
            .data(validProvinces)
            .enter()
            .append("path")
            .attr("d", path)
            .attr("fill", function (d) {
                let provColor = d3.scaleLinear()
                    .domain([1, 53]) // Set stops on the scale, e.g., ending years of the century
                    .range(["cyan", "purple"]) // Set colour values
                return provColor(d.properties.prov_code)
            })
            .attr("stroke", "#333333")
            .attr("stroke-width", 0.3)
            .attr("class", "province-boundary")
            .style("cursor", "pointer")
            .style("pointer-events", "all")
            .on("mouseover", function (event, d) {
                // Subtle highlight on hover
                d3.select(this)
                    .transition()
                    .duration(200)
                    .style("fill-opacity", 0.5)
                    .attr("stroke-width", 0.8);

                // Show tooltip
                div.transition()
                    .duration(50)
                    .style("opacity", 0.9);

                const container = document.getElementById("mapContainer");
                const box = container.getBoundingClientRect();
                const x = event.pageX - box.left - window.scrollX;
                const y = event.pageY - box.top - window.scrollY;

                // Build tooltip content
                let tooltipContent = "<table>";

                const name = d.properties.prov_name

                tooltipContent += "<tr><th colspan='2' style='background-color: #ffd699;'>" + name + "</th></tr>";
                tooltipContent += "<tr><td colspan='2' style='font-size: 11px; font-style: italic;'>Provincia</td></tr>";

                tooltipContent += "</table>";

                div.html(tooltipContent)
                    .style("left", (x + 20) + "px")
                    .style("top", (y - 20) + "px")
                    .style("position", "absolute");
            })
            .on("mouseout", function () {
                d3.select(this)
                    .transition()
                    .duration(300)
                    .style("fill-opacity", 1)
                    .attr("stroke-width", 0.3);

                div.transition()
                    .duration(300)
                    .style("opacity", 0);
            })
            .on("click", function (event, d) {
                const name = d.properties.provincia || d.properties.PROVINCIA ||
                    d.properties.name || d.properties.NAME || "provincia";
                console.log("Clicked on Provincia:", name);
            });

        // 5. Draw Labels (you can choose whether to label autonomas or provinces)
        // Labeling Autonomous Communities
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
            .attr('font-size', '7px')
            .attr("text-anchor", "middle")
            .attr("fill", "#2c5f2d")
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
                    let smallestCity = d3.min(cities.features, function (d) {
                        return d.properties.population;
                    })
                    let biggestCity = d3.max(cities.features, function (d) {
                        return d.properties.population;
                    })
                    let radiusSize = d3.scaleLinear()
                        .domain([smallestCity, biggestCity])
                        .range([1, 5])
                    return radiusSize(d.properties.population)
                })
                .attr("fill", "red")
                .attr("stroke", "white")
                .attr("stroke-width", 0.5)
                .style("cursor", "pointer");

            // City tooltip (mouseover)
            cityCircles.on("mouseover", function (event, d) {
                d3.select(this)
                    .raise()
                    .transition()
                    .duration(200)
                    .attr("stroke", "red")
                    .attr("fill", "orange");

                div.transition()
                    .duration(50)
                    .style("opacity", 0.9);

                const container = document.getElementById("mapContainer");
                const box = container.getBoundingClientRect();
                const x = event.pageX - box.left - window.scrollX;
                const y = event.pageY - box.top - window.scrollY;

                div.html(
                    "<table>" +
                    "<tr><th colspan='2' style='background-color: orange;'>" + d.properties.city + "</th></tr>" +
                    "<tr><td colspan='2' style='font-size: 11px; font-style: italic;'>Ciudad</td></tr>" +
                    "<tr><td><strong>Population:</strong></td><td>" + d.properties.population.toLocaleString() + "</td></tr>" +
                    "<tr><td><strong>Latitude:</strong></td><td>" + d.geometry.coordinates[1].toFixed(4) + "</td></tr>" +
                    "<tr><td><strong>Longitude:</strong></td><td>" + d.geometry.coordinates[0].toFixed(4) + "</td></tr>" +
                    "</table>"
                )
                    .style("left", (x + 20) + "px")
                    .style("top", (y - 20) + "px")
                    .style("position", "absolute");
            });

            // City tooltip out (mouseout)
            cityCircles.on("mouseout", function () {
                d3.select(this)
                    .transition()
                    .duration(300)
                    .attr("fill", "red");

                div.transition()
                    .duration(300)
                    .style("opacity", 0);
            });

        })
        .catch(function (error) {
            console.error("Error loading cities:", error);
        });
}