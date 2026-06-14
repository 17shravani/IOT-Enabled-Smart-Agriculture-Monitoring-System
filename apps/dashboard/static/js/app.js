// ==========================================================================
// AgriNexus UI Controller & Chart Integrator
// ==========================================================================

document.addEventListener("DOMContentLoaded", () => {
    // DOM Elements
    const connectionDot = document.getElementById("connection-dot");
    const connectionLabel = document.getElementById("connection-label");
    const systemTimeEl = document.getElementById("system-time");
    
    // Live Value Labels
    const valMoisture = document.getElementById("val-moisture");
    const valTemperature = document.getElementById("val-temperature");
    const valHumidity = document.getElementById("val-humidity");
    const valLight = document.getElementById("val-light");
    const valWater = document.getElementById("val-water");

    // Gauge Fills
    const fillMoisture = document.getElementById("fill-moisture");
    const fillTemperature = document.getElementById("fill-temperature");
    const fillHumidity = document.getElementById("fill-humidity");
    const fillLight = document.getElementById("fill-light");
    const fillWater = document.getElementById("fill-water");

    // Gauge Cards
    const gaugeMoistureCard = document.getElementById("gauge-moisture");
    const gaugeWaterCard = document.getElementById("gauge-water");

    // Dashboard Info Elements
    const pumpIndicator = document.getElementById("pump-indicator");
    const pumpStatusLabel = document.getElementById("pump-status-label");
    const telemetryTime = document.getElementById("telemetry-time");
    const consoleLogs = document.getElementById("console-logs");
    const btnClearLogs = document.getElementById("btn-clear-logs");

    // Control Settings Elements
    const inputSoilThreshold = document.getElementById("input-soil-threshold");
    const lblSoilThreshold = document.getElementById("lbl-soil-threshold");
    const inputWaterThreshold = document.getElementById("input-water-threshold");
    const lblWaterThreshold = document.getElementById("lbl-water-threshold");
    const btnSaveThresholds = document.getElementById("btn-save-thresholds");

    const toggleAuto = document.getElementById("toggle-auto");
    const togglePump = document.getElementById("toggle-pump");

    // Simulator Elements
    const simSoil = document.getElementById("sim-soil");
    const lblSimSoil = document.getElementById("lbl-sim-soil");
    const simTemp = document.getElementById("sim-temp");
    const lblSimTemp = document.getElementById("lbl-sim-temp");
    const simWater = document.getElementById("sim-water");
    const lblSimWater = document.getElementById("lbl-sim-water");
    const simLight = document.getElementById("sim-light");
    const lblSimLight = document.getElementById("lbl-sim-light");

    // Audio elements
    const audioAlarm = document.getElementById("audio-alarm");
    const audioClick = document.getElementById("audio-click");

    // Chart.js Configuration
    const ctx = document.getElementById("telemetryChart").getContext("2d");
    const chartLabels = [];
    const moistureData = [];
    const temperatureData = [];
    const waterLevelData = [];

    const telemetryChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [
                {
                    label: 'Soil Moisture (%)',
                    data: moistureData,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true,
                    yAxisID: 'y'
                },
                {
                    label: 'Temperature (°C)',
                    data: temperatureData,
                    borderColor: '#f59e0b',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    tension: 0.3,
                    yAxisID: 'y1'
                },
                {
                    label: 'Water Reservoir (%)',
                    data: waterLevelData,
                    borderColor: '#06b6d4',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 5],
                    tension: 0.3,
                    yAxisID: 'y'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#f3f4f6', font: { family: 'Inter', size: 11 } }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.03)' },
                    ticks: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 10 } }
                },
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    min: 0,
                    max: 100,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#9ca3af', font: { family: 'Inter' } },
                    title: { display: true, text: 'Percentage (%)', color: '#f3f4f6' }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    min: 0,
                    max: 50,
                    grid: { drawOnChartArea: false },
                    ticks: { color: '#9ca3af', font: { family: 'Inter' } },
                    title: { display: true, text: 'Temperature (°C)', color: '#f3f4f6' }
                }
            }
        }
    });

    // 1. Clock Display Ticker
    setInterval(() => {
        const now = new Date();
        systemTimeEl.innerText = now.toTimeString().split(' ')[0];
    }, 1000);

    // 2. Logging Interface
    function logEvent(tag, message, severity = "info") {
        const timestamp = new Date().toTimeString().split(' ')[0];
        const line = document.createElement("div");
        line.className = "console-line";
        
        let tagClass = "tag-info";
        if (severity === "warn") tagClass = "tag-warn";
        if (severity === "crit") tagClass = "tag-crit";
        if (severity === "system") tagClass = "tag-system";

        line.innerHTML = `
            <span class="line-time">${timestamp}</span>
            <span class="tag ${tagClass}">${tag}</span>
            <span class="line-msg">${message}</span>
        `;
        
        consoleLogs.appendChild(line);
        consoleLogs.scrollTop = consoleLogs.scrollHeight;

        // Play alert audio alerts
        if (severity === "crit") {
            audioAlarm.play().catch(e => {});
        } else {
            audioClick.play().catch(e => {});
        }
    }

    btnClearLogs.addEventListener("click", () => {
        consoleLogs.innerHTML = "";
        logEvent("CONSOLE", "Screen buffer cleared.", "system");
    });

    // 3. Environment Check & Gateway Sync
    const isOfflineDemo = (window.location.protocol === "file:" || window.location.hostname === "");
    let ws;
    
    // Local state for offline demonstration
    let localState = {
        soil_moisture: 45.0,
        temperature: 24.5,
        humidity: 60.0,
        light: 500.0,
        water_level: 80.0,
        pump_on: false,
        auto_mode: true,
        soil_threshold: 30.0,
        water_threshold: 15.0,
        last_updated: ""
    };

    function connectWS() {
        if (isOfflineDemo) {
            connectionDot.className = "status-dot online";
            connectionLabel.innerText = "Offline Demo Mode";
            logEvent("SYSTEM", "Loaded via local file system. Launching offline simulation engine...", "system");
            
            // Sync initial slider positions to labels
            lblSimSoil.innerText = simSoil.value;
            lblSimTemp.innerText = parseFloat(simTemp.value).toFixed(1);
            lblSimWater.innerText = simWater.value;
            lblSimLight.innerText = simLight.value;

            // Run JS-based loop to emulate IoT node physics
            setInterval(() => {
                // 1. Simulate environmental changes
                if (localState.pump_on) {
                    localState.soil_moisture = Math.min(100.0, localState.soil_moisture + 2.5);
                    localState.water_level = Math.max(0.0, localState.water_level - 1.2);
                    
                    // Sync the interactive simulator sliders to match physical changes
                    simSoil.value = Math.round(localState.soil_moisture);
                    lblSimSoil.innerText = simSoil.value;
                    simWater.value = Math.round(localState.water_level);
                    lblSimWater.innerText = simWater.value;
                } else {
                    localState.soil_moisture = Math.max(0.0, localState.soil_moisture - 0.15);
                    localState.water_level = Math.min(100.0, localState.water_level + 0.03);
                    
                    simSoil.value = Math.round(localState.soil_moisture);
                    lblSimSoil.innerText = simSoil.value;
                    simWater.value = Math.round(localState.water_level);
                    lblSimWater.innerText = simWater.value;
                }

                // Random walks
                localState.temperature = Math.max(10.0, Math.min(45.0, localState.temperature + (Math.random() - 0.5) * 0.1));
                localState.humidity = Math.max(20.0, Math.min(95.0, localState.humidity + (Math.random() - 0.5) * 0.2));
                
                simTemp.value = localState.temperature;
                lblSimTemp.innerText = localState.temperature.toFixed(1);

                // 2. Closed-loop control logic
                if (localState.auto_mode) {
                    if (localState.water_level < localState.water_threshold) {
                        if (localState.pump_on) {
                            localState.pump_on = false;
                            logEvent("CRITICAL_ALARM", "Water level critically low! Automatic safety shutdown triggered to prevent pump dry run.", "crit");
                        }
                    } else if (localState.soil_moisture < localState.soil_threshold) {
                        if (!localState.pump_on) {
                            localState.pump_on = true;
                            logEvent("PUMP_ACTUATED", `Soil moisture fell below trigger (${localState.soil_threshold}%). Irrigation activated.`, "info");
                        }
                    } else if (localState.soil_moisture >= 55.0) {
                        if (localState.pump_on) {
                            localState.pump_on = false;
                            logEvent("PUMP_DEACTIVATED", "Soil moisture saturated. Irrigation pump deactivated.", "info");
                        }
                    }
                }

                const now = new Date();
                localState.last_updated = now.toTimeString().split(' ')[0];
                updateDashboard(localState);
            }, 1000);
            return;
        }

        logEvent("NETWORK", "Opening secure telemetry WebSocket...", "system");
        const wsScheme = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${wsScheme}//${window.location.host}/ws`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            connectionDot.className = "status-dot online";
            connectionLabel.innerText = "Gateway Connected";
            logEvent("NETWORK", "WebSocket stream established. Receiving telemetry...", "info");
        };

        ws.onmessage = (event) => {
            const packet = JSON.parse(event.data);
            if (packet.type === "telemetry") {
                updateDashboard(packet.data);
            } else if (packet.type === "alert") {
                let severity = "info";
                if (packet.event.includes("CRITICAL")) severity = "crit";
                else if (packet.event.includes("ALARM") || packet.event.includes("WARNING")) severity = "warn";
                logEvent(packet.event, packet.message, severity);
            }
        };

        ws.onclose = () => {
            connectionDot.className = "status-dot offline";
            connectionLabel.innerText = "Gateway Offline";
            logEvent("NETWORK", "WebSocket connection closed. Retrying in 5 seconds...", "warn");
            setTimeout(connectWS, 5000);
        };
    }

    // 4. Update UI Components on telemetry packet
    function updateDashboard(data) {
        valMoisture.innerText = data.soil_moisture.toFixed(1);
        valTemperature.innerText = data.temperature.toFixed(1);
        valHumidity.innerText = data.humidity.toFixed(1);
        valLight.innerText = Math.round(data.light);
        valWater.innerText = data.water_level.toFixed(1);

        fillMoisture.style.width = `${data.soil_moisture}%`;
        fillTemperature.style.width = `${(data.temperature / 50) * 100}%`;
        fillHumidity.style.width = `${data.humidity}%`;
        fillLight.style.width = `${(data.light / 1500) * 100}%`;
        fillWater.style.width = `${data.water_level}%`;

        lblSoilThreshold.innerText = Math.round(data.soil_threshold);
        lblWaterThreshold.innerText = Math.round(data.water_threshold);

        if (data.soil_moisture < data.soil_threshold) {
            gaugeMoistureCard.classList.add("active-alert");
        } else {
            gaugeMoistureCard.classList.remove("active-alert");
        }

        if (data.water_level < data.water_threshold) {
            gaugeWaterCard.classList.add("active-alert");
        } else {
            gaugeWaterCard.classList.remove("active-alert");
        }

        if (data.pump_on) {
            pumpIndicator.classList.add("pump-active");
            pumpStatusLabel.innerText = "ACTIVE (Irrigating)";
            togglePump.checked = true;
        } else {
            pumpIndicator.classList.remove("pump-active");
            pumpStatusLabel.innerText = "OFF";
            togglePump.checked = false;
        }

        toggleAuto.checked = data.auto_mode;
        togglePump.disabled = data.auto_mode;

        telemetryTime.innerText = `Sync: ${data.last_updated}`;
        updateChart(data.last_updated, data.soil_moisture, data.temperature, data.water_level);
    }

    function updateChart(time, moisture, temp, water) {
        chartLabels.push(time);
        moistureData.push(moisture);
        temperatureData.push(temp);
        waterLevelData.push(water);

        if (chartLabels.length > 20) {
            chartLabels.shift();
            moistureData.shift();
            temperatureData.shift();
            waterLevelData.shift();
        }
        telemetryChart.update();
    }

    // 5. User Control Operations
    btnSaveThresholds.addEventListener("click", () => {
        const soilThresh = parseFloat(inputSoilThreshold.value);
        const waterThresh = parseFloat(inputWaterThreshold.value);

        if (isOfflineDemo) {
            localState.soil_threshold = soilThresh;
            localState.water_threshold = waterThresh;
            logEvent("SETTINGS", `Offline config applied: Soil Trigger = ${soilThresh}%, Cutoff = ${waterThresh}%.`, "info");
            return;
        }

        fetch("/api/v1/control/thresholds", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                soil_threshold: soilThresh,
                water_threshold: waterThresh
            })
        })
        .then(res => res.json())
        .then(result => {
            if (result.status === "success") {
                logEvent("SETTINGS", "Successfully applied new operational thresholds to Edge node.", "info");
            }
        })
        .catch(err => {
            logEvent("ERROR", "Failed to sync settings with gateway.", "crit");
        });
    });

    function sendControlOverride() {
        const isAuto = toggleAuto.checked;
        const isPumpOn = togglePump.checked;

        if (isOfflineDemo) {
            localState.auto_mode = isAuto;
            if (!localState.auto_mode) {
                if (isPumpOn && localState.water_level < localState.water_threshold) {
                    logEvent("SAFETY_ALERT", "Cannot actuate pump: Water level is below safety cutoff.", "crit");
                    togglePump.checked = false;
                    return;
                }
                localState.pump_on = isPumpOn;
                const actStr = localState.pump_on ? "activated" : "deactivated";
                logEvent("MANUAL_OVERRIDE", `Control switched to manual. Pump ${actStr} by operator.`, "info");
            } else {
                logEvent("AUTO_MODE_RESTORED", "Control switched back to automated threshold rules.", "system");
            }
            return;
        }

        fetch("/api/v1/control/override", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                auto_mode: isAuto,
                pump_on: isPumpOn
            })
        })
        .then(res => res.json())
        .then(result => {
            if (result.status === "error") {
                logEvent("SAFETY_ALERT", result.message, "crit");
                togglePump.checked = false;
            }
        });
    }

    toggleAuto.addEventListener("change", () => {
        togglePump.disabled = toggleAuto.checked;
        sendControlOverride();
    });

    togglePump.addEventListener("change", sendControlOverride);

    inputSoilThreshold.addEventListener("input", (e) => {
        lblSoilThreshold.innerText = e.target.value;
    });

    inputWaterThreshold.addEventListener("input", (e) => {
        lblWaterThreshold.innerText = e.target.value;
    });

    // 6. Interactive Physics Simulation Injectors
    function injectSimulatorTelemetry() {
        const soil = parseFloat(simSoil.value);
        const temp = parseFloat(simTemp.value);
        const water = parseFloat(simWater.value);
        const light = parseFloat(simLight.value);

        lblSimSoil.innerText = soil;
        lblSimTemp.innerText = temp.toFixed(1);
        lblSimWater.innerText = water;
        lblSimLight.innerText = Math.round(light);

        if (isOfflineDemo) {
            localState.soil_moisture = soil;
            localState.temperature = temp;
            localState.water_level = water;
            localState.light = light;
            updateDashboard(localState);
            return;
        }

        fetch(`/api/v1/simulator/telemetry?soil=${soil}&temp=${temp}&water=${water}&light=${light}`, {
            method: "POST"
        });
    }

    simSoil.addEventListener("input", injectSimulatorTelemetry);
    simTemp.addEventListener("input", injectSimulatorTelemetry);
    simWater.addEventListener("input", injectSimulatorTelemetry);
    simLight.addEventListener("input", injectSimulatorTelemetry);

    // Initial load sync values
    lblSimSoil.innerText = simSoil.value;
    lblSimTemp.innerText = parseFloat(simTemp.value).toFixed(1);
    lblSimWater.innerText = simWater.value;
    lblSimLight.innerText = simLight.value;

    // 7. Local vs Cloud View Toggle
    const btnViewLocal = document.getElementById("btn-view-local");
    const btnViewCloud = document.getElementById("btn-view-cloud");
    const localChartView = document.getElementById("local-chart-view");
    const cloudChartView = document.getElementById("cloud-chart-view");

    btnViewLocal.addEventListener("click", () => {
        btnViewLocal.classList.add("active");
        btnViewCloud.classList.remove("active");
        localChartView.style.display = "block";
        cloudChartView.style.display = "none";
        logEvent("UI", "Switched display to Local Canvas timelines.", "info");
    });

    btnViewCloud.addEventListener("click", () => {
        btnViewCloud.classList.add("active");
        btnViewLocal.classList.remove("active");
        localChartView.style.display = "none";
        cloudChartView.style.display = "block";
        logEvent("UI", "Switched display to Cloud ThingSpeak iframe widgets.", "info");
    });

    connectWS();
});
