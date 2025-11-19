var width = 450;
var height = 250;

// Create the main SVG container
var svg = d3.select("#mapContainer") 
    .append("svg") 
    .attr("preserveAspectRatio", "xMidYMid meet")
    .attr("viewBox", [0, 0, width, height])
    .attr("title", "Which Spain is calling you?");

// Define SVG Groups for layered drawing
var g_map = svg.append("g").attr("class", "map-features");
var g_labels = svg.append("g").attr("class", "map-labels");
var g_cities = svg.append("g").attr("class", "map-cities"); 
var s = svg.append("g").attr("class", "scale-bar"); 

// Define Projection and Path Generator
var projection = d3.geoEquirectangular()
    .scale(1)
    .translate([0, 0]);

var path = d3.geoPath()
    .projection(projection);

// --- D3 ZOOM CONTROL ---
var zoom = d3.zoom()
  .scaleExtent([0.5, 8])
  .on("zoom", zoomed);

// Apply the zoom behavior to the SVG element
svg.call(zoom);

// --- ADAPTIVE SCALE BAR HELPER ---
/**
 * Calculates the appropriate, round distance (e.g., 50m, 1km) for the scale bar.
 * @param {number} pixelLengthPerMeter - The number of pixels one meter currently occupies on the screen.
 * @returns {object} An object containing the round distance in meters and the formatted label.
 */
function getAdaptiveScaleDistance(pixelLengthPerMeter) {
    // Target pixel length for the scale bar (e.g., 100-150 pixels)
    const targetPixelLength = 120;
    
    // Calculate the distance in meters that would give the target pixel length
    let idealDistanceMeters = targetPixelLength / pixelLengthPerMeter;
    
    // Find the nearest power of 10 base (e.g., 100, 1000, 10000)
    let powerOfTen = Math.pow(10, Math.floor(Math.log10(idealDistanceMeters)));
    
    // Define preferred round numbers (multiples of 1, 2, 5)
    let roundFactors = [1, 2, 5];
    let bestDistance = powerOfTen;

    // Find the closest round distance
    for (const factor of roundFactors) {
        let candidate = factor * powerOfTen;
        if (candidate <= idealDistanceMeters * 1.5) { // Ensure we don't jump too high
            bestDistance = candidate;
        }
    }
    
    let label;
    if (bestDistance >= 1000) {
        // Format as kilometers
        label = (bestDistance / 1000) + ' km';
    } else {
        // Format as meters
        label = bestDistance + ' m';
    }

    return { distance: bestDistance, label: label };
}

// --- ZOOM FUNCTION ---
function zoomed(event) {
  // Apply transformation to all feature groups
  g_map.attr("transform", event.transform);
  g_labels.attr("transform", event.transform);
  g_cities.attr("transform", event.transform); 

  // Update the scale bar with the current transform
  updateScaleBar(event.transform);
}

// --- SCALE BAR FUNCTION (ADAPTIVE) ---
function updateScaleBar(transform) {
    // Spain's rough center coordinates (approx. 40.4° N, 3.7° W - Madrid)
    const centerLngLat = [-3.7, 40.4]; 
    const latitude = centerLngLat[1];
    
    // 1. Calculate the base pixel length for a reference distance (e.g., 1 meter)
    const referenceDistanceMeters = 1;

    // Distance in meters that corresponds to 1 degree of longitude at this latitude
    const distPerDegreeLng = 111320 * Math.cos(latitude * Math.PI / 180);

    // Degrees of longitude (dLng) that correspond to 1 meter
    const dLng = referenceDistanceMeters / distPerDegreeLng;

    // Project the point 1m East
    const projectedCenter = projection(centerLngLat);
    const point1mEast = projection([centerLngLat[0] + dLng, latitude]);
    
    // Base pixel length for 1 meter (before zoom)
    const basePixelLengthPerMeter = point1mEast[0] - projectedCenter[0];

    // Current pixel length for 1 meter (after zoom)
    const currentPixelLengthPerMeter = basePixelLengthPerMeter * transform.k;

    // 2. Determine the adaptive distance and label
    const adaptive = getAdaptiveScaleDistance(currentPixelLengthPerMeter);

    // 3. Calculate the new length in pixels for the adaptive distance
    const dynamicScaleLength = adaptive.distance * currentPixelLengthPerMeter;

    // 4. Draw the Scale Bar
    
    // Position of the scale bar (e.g., bottom left corner)
    const xPos = 20;
    const yPos = height - 20;

    s.html(""); // Clear previous scale bar elements

    // Draw the scale line
    s.append("line")
        .attr("x1", xPos)
        .attr("y1", yPos)
        .attr("x2", xPos + dynamicScaleLength)
        .attr("y2", yPos)
        .attr("stroke", "black")
        .attr("stroke-width", 1 ); // Slightly thicker line

    // Add the scale text
    s.append("text")
        .attr("x", xPos + dynamicScaleLength / 2)
        .attr("y", yPos - 8)
        .attr("text-anchor", "middle")
        .attr("font-size", "8px")
        .text(adaptive.label); // Use the adaptive label

    // Add the boundary tick marks
    s.append("line").attr("x1", xPos).attr("y1", yPos - 5).attr("x2", xPos).attr("y2", yPos + 5).attr("stroke", "black");
    s.append("line").attr("x1", xPos + dynamicScaleLength).attr("y1", yPos - 5).attr("x2", xPos + dynamicScaleLength).attr("y2", yPos + 5).attr("stroke", "black");
}

// --- DATA LOADING (remains unchanged) ---
// --- 1. Load and Draw Spain Boundaries and Labels (Spain.geojson: Polygons) ---
d3.json("https://raw.githubusercontent.com/cfdvoices/Spain-Mapping-Project/main/Spain.geojson") 
    .then(function (features) {
        projection.fitSize([width, height], features);
        
        g_map.selectAll("path")
            .data(features.features)
            .enter()
            .append("path")
            .attr("d", path)
            .attr("fill", "#cccccc")
            .attr("stroke", "#333333")
            .attr("stroke-width", 0.1);

        g_labels.selectAll("text")
            .data(features.features)
            .enter()
            .append("text")
            .attr('x', function (d) { return projection(d3.geoCentroid(d))[0]; })
            .attr('y', function (d) { return projection(d3.geoCentroid(d))[1]; })
            .text(function (d) { return d.properties.TrunkSize; })
            .attr('font-size', '10px')
            .attr("fill", "#6b9023")
            .attr("opacity", 1);

        // Initialize scale bar after projection is set
        updateScaleBar(d3.zoomIdentity); 
    })
    .catch(function (error) {
        console.error("Error loading or processing Spain.geojson:", error);
        alert("There was a problem loading the Spain.geojson dataset. Check the console for details.");
    });

// --- 2. Load and Draw Cities (cities.geojson: Points) ---
d3.json("https://raw.githubusercontent.com/cfdvoices/Spain-Mapping-Project/main/cities.geojson") 
    .then(function (cities) {
        g_cities.selectAll("circle")
            .data(cities.features)
            .enter()
            .append("circle")
            .attr('cx', function (d) { return projection(d.geometry.coordinates)[0]; })
            .attr('cy', function (d) { return projection(d.geometry.coordinates)[1]; })
            .attr("r", 1)
            .attr("fill", "blue")
            .attr("stroke", "white")
            .attr("stroke-width", 0.25);
    })
    .catch(function (error) {
        console.error("Error loading or processing cities.geojson:", error);
        alert("There are some problems with the cities dataset. Check the console for details.");
    });