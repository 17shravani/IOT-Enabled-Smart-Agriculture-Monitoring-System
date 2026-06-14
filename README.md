# IoT-Enabled Smart Agriculture Monitoring System (AgriNexus AI)
<img width="1017" height="755" alt="Screenshot 2026-06-14 143841" src="https://github.com/user-attachments/assets/65ab24da-88b5-4538-82e9-5627b095c575" />

[![Platform Version](https://img.shields.io/badge/AgriNexus--AI-v1.0.0-indigo.svg?style=flat-square)](https://github.com/)
[![License](https://img.shields.io/badge/License-MIT-emerald.svg?style=flat-square)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.9%20%7C%203.10%20%7C%203.11-blue.svg?style=flat-square&logo=python)](https://python.org)
[![ESP32](https://img.shields.io/badge/Microcontroller-ESP32-red.svg?style=flat-square&logo=espressif)](https://www.espressif.com/en/products/socs/esp32)
[![Wokwi Simulator](https://img.shields.io/badge/Simulation-Wokwi-orange.svg?style=flat-square)](https://wokwi.com)

**AgriNexus AI** is an industry-oriented, closed-loop IoT Smart Agriculture Monitoring and Automation platform designed to optimize crop yield and prevent water wastage. 

This repository implements a **dual-track system**:
1. **Local Executable PoC & Dashboard**: An interactive, glassmorphic dark-mode web application (FastAPI + WebSockets + Chart.js) featuring a built-in virtual environment telemetry simulator with manual sliders to trigger alerts, log CSV data, and control a virtual water pump.
2. **Enterprise Architecture Blueprint**: System specifications detailing a planetary-scale microservice stack, multi-agent AI topologies, TimescaleDB hypertable setups, threat vulnerability profiles, and pitch deck metrics.

---

## 1. Problem Statement & Tech Stack

Traditional agriculture suffers from high operational costs and water waste due to manual irrigation scheduling. Over-watering drowns root networks, while under-watering leads to irreversible crop damage. Additionally, dry pump runs occur when storage tanks empty during active pumping cycles, burning out electrical motors.

AgriNexus AI solves this by monitoring environmental variables (soil moisture, temperature, humidity, solar radiation, and water levels) to actuate irrigation closed-loops with **dry-run safety interlocks**.

### Tech Stack
- **Hardware/Firmware**: ESP32 DevKit, DHT22 (Temp/Hum), Capacitive Soil Moisture Sensor, LDR (Solar), HC-SR04 (Ultrasonic level), 5V Optocoupled Relay.
- **Gateway & Server**: Python, FastAPI, WebSockets, Uvicorn, Jinja2 Templates.
- **Frontend Dashboard**: HTML5, Vanilla CSS3 (Glassmorphism & Obsidian Dark Theme), Chart.js, FontAwesome.
- **Protocols & Formats**: MQTT (HiveMQ Public Broker), TCP/IP, JSON.
- **Data Storage**: CSV Telemetry logs (`data/telemetry_log.csv`).

---

## 2. System Architecture

```
                  [ PHYS-SIM OVERRIDES / DEVICE ]
                                 │
                                 ▼
                     [ ESP32 Edge Device / Simulation ]
                                 │
                         (MQTT / JSON over TLS)
                                 │
                                 ▼
                      [ HiveMQ Public Broker ]
                                 │
                                 ▼
                        [ FastAPI Gateway ] ◄─── (REST Control API)
                         │               │
            (WebSocket   │               │ (CSV File Appender)
             Broadcast)  │               │
                         ▼               ▼
                [ Web Dashboard UI ]   [ data/telemetry_log.csv ]
```

---

## 3. Directory Layout

```
IoT-Smart-Agriculture-Monitoring-System/
│
├── apps/
│   ├── dashboard/                # FastAPI Dashboard & Simulator Backend
│   │   ├── main.py              # Application runner, endpoints, and background loop
│   │   ├── templates/
│   │   │   └── index.html       # Dynamic HTML5 dashboard interface
│   │   └── static/
│   │       ├── css/style.css    # Premium glassmorphic stylesheet
│   │       └── js/app.js        # WebSockets handler and Chart.js renderer
│   │
│   └── firmware/                 # Microcontroller Core code
│       ├── esp32_firmware.ino    # Arduino C++ code with local fallback rules
│       └── diagram.json          # Wokwi simulation circuit layout file
│
├── docs/
│   ├── enterprise_architecture.md # Scalable platform designs, database models, schemas
│   ├── github_guide.md           # Day-wise developer commits and repository instructions
│   └── interview_prep.md         # 10 HR & Technical questions with deep model answers
│
├── data/
│   └── telemetry_log.csv         # Automatically generated csv data logs
│
├── .gitignore                    # Version control ignore files
├── requirements.txt              # Python package dependencies
└── run_simulator.bat             # One-click Windows execution batch file
```

---

## 4. Installation & Setup Guide

### Method A: Running the Python Web Simulator (No Hardware Required)

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/yourusername/iot-smart-agriculture-monitoring-system.git
   cd iot-smart-agriculture-monitoring-system
   ```

2. **Windows Quick Run**:
   Double-click the `run_simulator.bat` file. This script automatically checks for Python, sets up a virtual environment, installs dependencies, launches the FastAPI server, and opens the dashboard on `http://127.0.0.1:5000`.

3. **Manual Setup (Mac / Linux / Windows CLI)**:
   ```bash
   # Create and activate virtual environment
   python -m venv venv
   source venv/bin/activate  # On Windows use: venv\Scripts\activate

   # Install dependencies
   pip install -r requirements.txt

   # Start FastAPI Server
   python apps/dashboard/main.py
   ```
   Open your browser and navigate to `http://127.0.0.1:5000`.

---

### Method B: Running the Wokwi Hardware Circuit Simulator

1. Open a browser tab and go to [Wokwi Simulator](https://wokwi.com).
2. Choose **ESP32 DevKit V4** as the microcontroller template.
3. Replace the contents of the Wokwi `sketch.ino` tab with the code inside [esp32_firmware.ino](file:///apps/firmware/esp32_firmware.ino).
4. Replace the contents of the Wokwi `diagram.json` tab with the configuration inside [diagram.json](file:///apps/firmware/diagram.json).
5. Click **Start Simulation**.
6. The ESP32 will connect to `Wokwi-GUEST` virtual network and begin publishing live telemetry JSON packets to the public MQTT broker. Check the serial terminal to verify sensor outputs and connections.

---

## 5. System Features & Verification Runs

### Live Closed-Loop Automation
1. Set the **Soil Irrigation Trigger** to `35%` on the dashboard.
2. Drag the **Force Soil Moisture** simulator slider to `25%` (dry).
3. The dashboard will instantly trigger a warning state, flash the Soil Moisture card red, play an alert sound, actuate the pump indicator to **ACTIVE (Pump ON)**, and append an alert log to the console output:
   `[PUMP_ACTUATED] Soil moisture dropped below threshold (35%). Irrigation pump activated.`
4. As the pump remains active, the simulator increases the soil moisture reading. Once moisture saturates to `55%`, the pump automatically deactivates.

### Dry-Run Pump Prevention Safety Interlock
1. Slide the **Force Reservoir Level** simulator slider to `10%` (critically empty).
2. The system immediately shuts down the active pump to prevent dry-running, flashes the Reservoir card red, and throws a critical system alarm:
   `[CRITICAL_ALARM] Water level critically low! Automatic safety shutdown triggered to prevent pump dry run.`
3. Manual override switches will be blocked until the reservoir is refilled above the threshold.

---

## 6. Learning Outcomes & Professional Skills Demonstrated

This course project demonstrates proficiency in:
- **Embedded C++ & Hardware Interfacing**: Working with ADCs, I2C, and GPIO multiplexing.
- **Asynchronous Python Systems**: Writing thread-safe backend loops, WebSockets gateways, and HTTP routers.
- **Web UI & UX Engineering**: Styling with CSS custom properties, responsive glassmorphism designs, and event-driven canvas charts.
- **Closed-Loop Safety Architectures**: Coding hardware interlocks, hysteresis thresholds, and failsafe conditions.
- **Git Version Control**: Documenting professional commits, tags, and production-ready code setups.
- **Enterprise System Design**: Mapping distributed data meshes, REST/GraphQL endpoints, and threat modeling protocols.
