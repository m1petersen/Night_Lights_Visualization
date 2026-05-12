// --- 1. SETUP & CONFIGURATION ---
const mapWidth = 600, mapHeight = 400;
const chartWidth = 600, chartHeight = 400;
const margin = { top: 20, right: 30, bottom: 40, left: 50 };

const wmsLayer = "VIIRS_SNPP_DayNightBand"; 

// Setup Map SVG
const mapSvg = d3.select("#mapSvg");
const mapImage = mapSvg.append("image")
    .attr("width", mapWidth)
    .attr("height", mapHeight)
    .attr("preserveAspectRatio", "none");

// Function to update the WMS Image based on the selected date
function updateMapImage(dateString) {
    const bbox = "-125,24,-66,50"; // United States Bounding Box
    const wmsUrl = `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.1.1&LAYERS=${wmsLayer}&STYLES=&FORMAT=image/png&TRANSPARENT=TRUE&SRS=EPSG:4326&BBOX=${bbox}&WIDTH=${mapWidth}&HEIGHT=${mapHeight}&TIME=${dateString}`;
    mapImage.attr("href", wmsUrl);
}

// Setup Chart SVG
const chartSvg = d3.select("#chartSvg");
const innerWidth = chartWidth - margin.left - margin.right;
const innerHeight = chartHeight - margin.bottom - margin.top;
const chartGroup = chartSvg.append("g")
    .attr("transform", `translate(${margin.left},${margin.top})`);
const tooltip = d3.select("#tooltip");

// --- 2. LOAD YOUR CSV DATA ---
d3.csv("nightlight_metrics.csv").then(function(data) {
    
    // Parse the data from strings into JS Numbers and Date objects
    const parseTime = d3.timeParse("%Y-%m-%d");
    
    data.forEach(d => {
        d.parsedDate = parseTime(d.date);
        d.intensity = +d.mean_brightness; // Pulls from your CSV column
        d.dateStr = d.date; // Keeps the string for the NASA URL
    });

    const movingAverageData = [];
    const windowSize = 12; // 12 months = 1 year

    for (let i = 0; i < data.length; i++) {
        let sum = 0;
        // Find out how many months we can actually look back.
        // If we are at index 3, we can only look back 4 items max.
        let currentWindow = Math.min(i + 1, windowSize); 
        
        for (let j = 0; j < currentWindow; j++) {
            sum += data[i - j].intensity;
        }
        
        movingAverageData.push({
            parsedDate: data[i].parsedDate,
            intensity: sum / currentWindow
        });
    }

    // Configure Slider based on the length of your CSV
    const slider = d3.select("#timeSlider");
    slider.attr("max", data.length - 1);
    slider.property("value", 0);
    
    // Load the very first date on page load
    d3.select("#dateLabel").text(data[0].dateStr);
    updateMapImage(data[0].dateStr);

    // --- 3. BUILD THE SCALES & AXES ---
    const xScale = d3.scaleTime()
        .domain(d3.extent(data, d => d.parsedDate))
        .range([0, innerWidth]);

    const yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.intensity) + 0.1])
        .range([innerHeight, 0]);

    // Draw X and Y Axes
    chartGroup.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale));

    chartGroup.append("g")
        .call(d3.axisLeft(yScale));

    // Add Y-Axis Title
    chartGroup.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", 0 - margin.left + 5)
        .attr("x", 0 - (innerHeight / 2))
        .attr("dy", "1em")
        .style("text-anchor", "middle")
        .style("fill", "#aaa")
        .text("Light Intensity (Mean Brightness)");

    // Add faint X gridlines
    chartGroup.append("g")
        .attr("transform", `translate(0,${innerHeight})`)
        .call(d3.axisBottom(xScale).tickSize(-innerHeight).tickFormat(""))
        .selectAll("line")
        .attr("stroke", "#333")
        .attr("stroke-dasharray", "2,2");

    // Add faint Y gridlines
    chartGroup.append("g")
        .call(d3.axisLeft(yScale).tickSize(-innerWidth).tickFormat(""))
        .selectAll("line")
        .attr("stroke", "#333")
        .attr("stroke-dasharray", "2,2");

    // --- 4. DRAW THE LINE CHART ---

    // 1. Draw the raw noisy data first (make it semi-transparent so it's in the background)
    const rawLine = d3.line()
        .x(d => xScale(d.parsedDate))
        .y(d => yScale(d.intensity))
        .curve(d3.curveMonotoneX);

    chartGroup.append("path")
        .datum(data)
        .attr("fill", "none")
        .attr("stroke", "#f5cf6c")
        .attr("stroke-width", 1.5)
        .attr("opacity", 0.4) // Fade it into the background!
        .attr("d", rawLine);

    // 2. Draw the Smooth Trendline on top
    const trendLine = d3.line()
        .x(d => xScale(d.parsedDate))
        .y(d => yScale(d.intensity))
        .curve(d3.curveBasis); // curveBasis makes it extra smooth

    chartGroup.append("path")
        .datum(movingAverageData)
        .attr("fill", "none")
        .attr("stroke", "#ff5722") // A bold contrasting color like deep orange/red
        .attr("stroke-width", 3.5)
        .attr("d", trendLine);

    // Draw Interactive Nodes (Dots)
    chartGroup.selectAll("circle")
        .data(data)
        .enter()
        .append("circle")
        .attr("cx", d => xScale(d.parsedDate))
        .attr("cy", d => yScale(d.intensity))
        .attr("r", 3) // Small dots so they don't overlap too much
        .attr("fill", "#ff9800")
        .style("cursor", "pointer")
        .on("mouseover", function(event, d) {
            d3.select(this).attr("r", 6).attr("fill", "#fff");
            tooltip.style("opacity", 1)
                .html(`<strong>Date:</strong> ${d.dateStr}<br><strong>Brightness:</strong> ${d.intensity.toFixed(4)}`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
        })
        .on("mouseout", function() {
            d3.select(this).attr("r", 3).attr("fill", "#ff9800");
            tooltip.style("opacity", 0);
        });

    // Draw Vertical Time Indicator Line
    const timeIndicator = chartGroup.append("line")
        .attr("x1", xScale(data[0].parsedDate))
        .attr("x2", xScale(data[0].parsedDate))
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", "red")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "4");

    // --- 5. LINK SLIDER TO CHART AND MAP ---
    slider.on("input", function() {
        const index = this.value; // Read index 0 to 167
        const selectedData = data[index];
        
        // 1. Update text label
        d3.select("#dateLabel").text(selectedData.dateStr);
        
        // 2. Fetch the new NASA image using the date string
        updateMapImage(selectedData.dateStr);
        
        // 3. Move the red line on the chart
        timeIndicator
            .attr("x1", xScale(selectedData.parsedDate))
            .attr("x2", xScale(selectedData.parsedDate));
    });

    // --- 6. PLAY / PAUSE ANIMATION ---
    let playing = false;
    let timer;

    d3.select("#playBtn").on("click", function() {
        playing = !playing; // Toggle state
        d3.select(this).text(playing ? "Pause Animation" : "Play Animation");

        if (playing) {
            // Start a timer that ticks every 1500 milliseconds (1.5 seconds)
            timer = setInterval(() => {
                let currentVal = +slider.property("value");
                // If we reach the end, loop back to the beginning
                if (currentVal >= data.length - 1) {
                    currentVal = -1;
                }
                // Update slider value and trigger the 'input' event to update map/chart
                slider.property("value", currentVal + 1).dispatch("input");
            }, 1500); // <--- CHANGED THIS FROM 400 TO 1500
        } else {
            clearInterval(timer); // Stop the timer
        }
    });

    // --- 7. NARRATIVE ANNOTATION (COVID-19) ---
    const covidDate = parseTime("2020-04-15");
    const covidX = xScale(covidDate);
    
    // Draw a vertical boundary line
    chartGroup.append("line")
        .attr("x1", covidX)
        .attr("x2", covidX)
        .attr("y1", 0)
        .attr("y2", innerHeight)
        .attr("stroke", "#888")
        .attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "5,5");

    // Add text label
    chartGroup.append("text")
        .attr("x", covidX + 5)
        .attr("y", 20)
        .style("fill", "#bbb") // Lighter gray so it shows up on dark mode
        .style("font-size", "12px")
        .style("font-weight", "bold")
        .text("COVID-19 Lockdowns");

}).catch(function(error) {
    console.error("Error loading the CSV file: ", error);
});