var width = 1024;
var height = 768;
var svg = d3.select("#mapContainer") /* Select the #mapContainer element within the HTML file */
    .append("svg") /* Add the <svg> element to this container */
    .attr("preserveAspectRatio", "xMidYMid") /* Preserve the aspect ratio of the <svg> element */
    .attr("viewBox", [0, 0, width, height]) /* Set the position and dimension, in user space, of an SVG
viewport - setting for the responsive design */
    .attr("title", "Trees in Vienna"); /* Add the title of the <svg> element */

var g = svg.append("g"); // Add the group element to the SVG element for streets
var l = svg.append("g"); // Add the group element to the SVG element for trees

var projection = d3.geoEquirectangular();
/* Cylindrical projection - standard GeoJSON WGS84 that uses planar equirectangular coordinates */

var path = d3.geoPath()
    .projection(projection); //the projection we defined previously

// Load and draw streets
d3.json("./data/Spain.geojson")"
    /* Display data if file can be found and parsed */
    .then(function(streets) {
        projection.fitSize([width, height], streets); // Fit streets extent to the map container extent
        g.selectAll("path") // Take the "path" selector and return a selection of all such elements
            .data(streets.features) // Set the data entries
            .enter() // Bind data to the selection
            .append("path") // Append path element for each data entry
            .attr("d", path) // Define how to draw path element for each data entry
            .attr("fill", "none") // Set the street fill color to "none"
            .attr("stroke", "#708090") // Set street stroke color with HEX code
            .attr("stroke-width", 0.25) // Set stroke width
            .attr("stroke-opacity", 1); // Set opacity (transparency) of the stroke to 90%
    })
    .catch(function(error) {
        alert("There are some problems with the polygon dataset");
    });

// Define the radius scale for trees
let radiusSize = d3.scaleLinear()
    .domain([0, 300, 600]) // Set three stops on the scale, e.g., tree trunk diameter
    .range([1, 5, 10]); // Set three display values, e.g., radius sizes

// Load and draw trees
d3.json("https://raw.githubusercontent.com/AndreasDiv/D3js-Files/main/trees-oldtown.geojson")
    .then(function(trees) {
        l.selectAll("text") // Changed from "rect" to "text" to match what you're appending
            .data(trees.features)
            .enter() // Bind data to the selection
            .append("text") // Append text element for each data entry
            .attr('x', function(d) { return projection(d.geometry.coordinates)[0] })
            .attr('y', function(d) { return projection(d.geometry.coordinates)[1] })
            .text(function(d) { return d.properties.TrunkSize }) // Fixed typo: "TrunkSuze" → "TrunkSize"
            .attr('font-size', 10)
            .attr("fill", "#6b9023") // Changed from "font-color" to "fill" (correct SVG attribute)
            .attr("opacity", 1);
    })
    .catch(function(error) { // Display message if any data errors occur
        alert("There are some mistakes in the code with the trees dataset");
    });