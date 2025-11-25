// This script will run after the page loads and criteria are selected
// The map initialization is triggered from criteria-selector.js

var width = 450;
var height = 250;
var svg, g_map, g_prov, g_labels, g_cities, s, projection, path, zoom;

var div = d3.select("body")
    .append("div")
    .attr("id", "tooltip")
    .attr("class", "tooltip")
    .style("opacity", 0);

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
        .attr("title", "Which Spain is calling you?");

    // Define SVG Groups for layered drawing (Order matters: first appended is bottom layer)
    g_map = svg.append("g").attr("class", "layer-regions");   // Regions (Background)
    g_prov = svg.append("g").attr("class", "layer-provinces"); // Provinces (Middle)
    g_labels = svg.append("g").attr("class", "layer-labels"); // Text
    g_cities = svg.append("g").attr("class", "layer-cities"); // Cities (Top)
    s = svg.append("g").attr("class", "scale-bar");

    // Define Projection and Path Generator
    projection = d3.geoEquirectangular()
        .scale(1)
        .translate([0, 0]);

    path = d3.geoPath().projection(projection);

    // --- D3 ZOOM CONTROL ---
    zoom = d3.zoom()
        .scaleExtent([0.5, 8])
        .on("zoom", zoomed);

    svg.call(zoom);

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
    g_prov.attr("transform", event.transform); // Make sure to transform provinces
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
        .attr("stroke", "black").attr("stroke-width", 1);
    
    s.append("text")
        .attr("x", xPos + dynamicScaleLength / 2).attr("y", yPos - 8)
        .attr("text-anchor", "middle").attr("font-size", "8px")
        .text(adaptive.label);

    s.append("line").attr("x1", xPos).attr("y1", yPos - 5).attr("x2", xPos).attr("y2", yPos + 5).attr("stroke", "black");
    s.append("line").attr("x1", xPos + dynamicScaleLength).attr("y1", yPos - 5).attr("x2", xPos + dynamicScaleLength).attr("y2", yPos + 5).attr("stroke", "black");
}

// --- CENTRALIZED DATA LOADING ---
function loadAllMapData() {
    // We use Promise.all to wait for BOTH files to arrive before doing any drawing
    Promise.all([
        d3.json("https://raw.githubusercontent.com/cfdvoices/Spain-Mapping-Project/main/Spain.geojson"),
        d3.json("https://raw.githubusercontent.com/cfdvoices/Spain-Mapping-Project/main/spainprovinces.geojson")
    ]).then(function([regionData, provinceData]) {
        
        // 1. CRITICAL: Set the projection using the main country shape (Spain.geojson)
        // This ensures the math is ready before we draw any paths
        projection.fitSize([width, height], regionData);

        // 2. Draw the Regions (Spain.geojson) - Background Layer
        g_map.selectAll("path")
            .data(regionData.features)
            .enter()
            .append("path")
            .attr("d", path)
            .attr("fill", "#e0e0e0") // Lighter gray for background
            .attr("stroke", "none"); 

        // 3. Draw the Provinces (spainprovinces.geojson) - Detail Layer
        g_prov.selectAll("path")
            .data(provinceData.features)
            .enter()
            .append("path")
            .attr("d", path)
            .attr("fill", "none")      // Transparent fill so we see regions behind (or set a color)
            .attr("stroke", "#333333") // Dark lines for borders
            .attr("stroke-width", 0.2) // Thinner lines for detail
            .attr("class", "province-boundary");

        // 4. Draw Region Labels (from Spain.geojson)
        g_labels.selectAll("text")
            .data(regionData.features)
            .enter()
            .append("text")
            .attr('x', function (d) { return projection(d3.geoCentroid(d))[0]; })
            .attr('y', function (d) { return projection(d3.geoCentroid(d))[1]; })
            .text(function (d) { return d.properties.TrunkSize; }) // Ensure 'TrunkSize' exists in your properties!
            .attr('font-size', '8px')
            .attr("text-anchor", "middle")
            .attr("fill", "#6b9023")
            .attr("opacity", 1);

        // 5. Initialize Scale Bar
        updateScaleBar(d3.zoomIdentity);

        // 6. Finally, load cities (now that projection is set)
        loadCities();

    }).catch(function(error) {
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
                .attr("r", 2)
                .attr("fill", "red")
                .attr("stroke", "white")
                .attr("stroke-width", 0.5)
                .style("cursor", "pointer");


            /* ------------------------------
               CITY TOOLTIP (mouseover)
            --------------------------------*/
            cityCircles.on("mouseover", function (event, d) {

                d3.select(this)
                    .raise()
                    .transition()
                    .duration(200)
                    .attr("r", 4)
                    .attr("fill", "orange");

                // Tooltip fade-in
                div.transition()
                    .duration(50)
                    .style("opacity", 0.9);

                // Compute correct mouse position inside container
                const container = document.getElementById("mapContainer");
                const box = container.getBoundingClientRect();
                const x = event.pageX - box.left - window.scrollX;
                const y = event.pageY - box.top - window.scrollY;

                // Tooltip content using d.properties.city
                div.html(
                    "<table>" +
                    "<tr><th colspan='2'>" + d.properties.city + "</th></tr>" +
                    "<tr><td><strong>Latitude:</strong></td><td>" + d.geometry.coordinates[1] + "</td></tr>" +
                    "<tr><td><strong>Longitude:</strong></td><td>" + d.geometry.coordinates[0] + "</td></tr>" +
                    "</table>"
                )
                .style("left", (x + 20) + "px")
                .style("top", (y - 20) + "px")
                .style("position", "absolute");
            });


            /* ------------------------------
               CITY TOOLTIP OUT (mouseout)
            --------------------------------*/
            cityCircles.on("mouseout", function () {

                d3.select(this)
                    .transition()
                    .duration(300)
                    .attr("r", 2)
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

        // TREE HOVER ANIMATION WITH TOOLTIP (mouseover)
    treeCircles.on("mouseover", function (event, d) {
      d3.select(this)
        .raise()
        .transition()
        .duration(200)
        .attr("r", 2.5)
        .style("fill", "cyan") // Changed to style for consistency
        .attr("stroke-width", 0.3)
        .attr("fill-opacity", 0.9);

      // TOOLTIP ANIMATION
      div.transition()
        .duration(10)
        .style("opacity", .9);

      // Display the data-driven text in the tooltip
      const mapContainer = document.getElementById('mapContainer');
      if (mapContainer) {
        const containerRect = mapContainer.getBoundingClientRect();
        const relativeX = event.pageX - containerRect.left - window.scrollX;
        const relativeY = event.pageY - containerRect.top - window.scrollY;

        div.html(
          "<table>" +
          "<tr>" +
          "<th>Attribute</th>" +
          "<th>Individual " + d.properties.TreeID + "</th>" +
          "</tr>" +
          "<tr>" +
          "<td>Species: </td>" +
          "<td>" + d.properties.TreeType + "</td>" +
          "</tr>" +
          "<td>Planting Year: </td>" +
          "<td>" + d.properties.PlantingYear + "</td>" +
          "</table>"
        )
          .style("left", (relativeX + 25) + "px")
          .style("right", "auto")
          .style("top", (relativeY - 30) + "px")
          .style("bottom", "auto")
          .style("position", "absolute");
      }
    });

    // TREE HOVER ANIMATION (mouseout)
    treeCircles.on("mouseout", function (event, d) {
      d3.select(this)
        .transition()
        .duration(500)
        .attr("r", 2)
        .style("fill", function () {
          if (d.properties.PlantingYear == 2019) { return t1.url() }
          else if (d.properties.PlantingYear == 2020) { return t2.url() }
          else if (d.properties.PlantingYear == 2021) { return t3.url() }
          else { return "gray" }
        })
        .attr("stroke-width", 0.5)
        .attr("fill-opacity", 0.75);

      // HIDE TOOLTIP
      div.transition()
        .duration(500)
        .style("opacity", 0);
    });