import os
import csv
import json
import asyncio
import urllib.request
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

THINGSPEAK_WRITE_KEY = os.getenv("THINGSPEAK_WRITE_KEY", "")

app = FastAPI(title="AgriNexus AI Simulator Gateway")

# Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
DATA_DIR = os.path.join(os.path.dirname(BASE_DIR), "data")
CSV_PATH = os.path.join(DATA_DIR, "telemetry_log.csv")

# Ensure directories exist
os.makedirs(STATIC_DIR, exist_ok=True)
os.makedirs(TEMPLATES_DIR, exist_ok=True)
os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "css"), exist_ok=True)
os.makedirs(os.path.join(STATIC_DIR, "js"), exist_ok=True)

# Mount static files & templates
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
templates = Jinja2Templates(directory=TEMPLATES_DIR)

# Global State (Simulated IoT Node)
state = {
    "soil_moisture": 45.0,     # Percentage (0 - 100%)
    "temperature": 24.5,       # Celsius
    "humidity": 60.0,          # Percentage
    "light": 500.0,            # Lux
    "water_level": 80.0,       # Percentage (0 - 100% of tank capacity)
    "pump_on": False,          # Boolean status
    "auto_mode": True,         # Automatic threshold check vs manual control
    "soil_threshold": 30.0,    # Default soil moisture trigger
    "water_threshold": 15.0,   # Safety tank water level trigger
    "last_updated": ""
}

# WebSocket Clients
active_connections = set()

# Initialize CSV log file
if not os.path.exists(CSV_PATH):
    with open(CSV_PATH, mode="w", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["Timestamp", "Soil Moisture (%)", "Temperature (C)", "Humidity (%)", "Light (Lux)", "Water Level (%)", "Pump State", "Control Mode"])

async def broadcast_state():
    """Broadcast current state to all connected WebSocket clients."""
    if not active_connections:
        return
    payload = json.dumps({
        "type": "telemetry",
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "data": state
    })
    # Gather and send concurrently
    await asyncio.gather(*[client.send_text(payload) for client in active_connections], return_exceptions=True)

def log_to_csv():
    """Append current telemetry state to CSV file."""
    try:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with open(CSV_PATH, mode="a", newline="") as file:
            writer = csv.writer(file)
            writer.writerow([
                timestamp,
                round(state["soil_moisture"], 1),
                round(state["temperature"], 1),
                round(state["humidity"], 1),
                round(state["light"], 1),
                round(state["water_level"], 1),
                "ON" if state["pump_on"] else "OFF",
                "AUTO" if state["auto_mode"] else "MANUAL"
            ])
    except Exception as e:
        print(f"Error logging to CSV: {e}")

async def telemetry_simulator_loop():
    """Background task simulating environmental changes and applying control rules."""
    log_counter = 0
    while True:
        # 1. Simulate environmental changes
        if state["pump_on"]:
            # Pump is active: moisture goes up, water level in the tank drains
            state["soil_moisture"] = min(100.0, state["soil_moisture"] + 2.5)
            state["water_level"] = max(0.0, state["water_level"] - 1.2)
        else:
            # Soil dries up slowly over time
            state["soil_moisture"] = max(0.0, state["soil_moisture"] - 0.25)
            # Water level slowly refills (simulating rainfall or manual tank refill)
            state["water_level"] = min(100.0, state["water_level"] + 0.05)

        # Ambient drift for temperature & humidity (minor noise)
        import random
        state["temperature"] = max(10.0, min(45.0, state["temperature"] + random.uniform(-0.1, 0.1)))
        state["humidity"] = max(20.0, min(95.0, state["humidity"] + random.uniform(-0.2, 0.2)))

        # 2. Apply closed-loop threshold control if Auto Mode is active
        if state["auto_mode"]:
            # Safety checks first: block pump if water level is too low
            if state["water_level"] < state["water_threshold"]:
                if state["pump_on"]:
                    state["pump_on"] = False
                    # Notify clients of critical shutdown event
                    await broadcast_event("CRITICAL_ALARM", "Water level critically low! Automatic safety shutdown triggered to prevent pump dry run.")
            # Trigger pump if soil moisture drops below threshold
            elif state["soil_moisture"] < state["soil_threshold"]:
                if not state["pump_on"]:
                    state["pump_on"] = True
                    await broadcast_event("PUMP_ACTUATED", f"Soil moisture dropped below threshold ({state['soil_threshold']}%). Irrigation pump activated.")
            # Turn pump off when soil moisture is saturated (> 50%)
            elif state["soil_moisture"] >= 55.0:
                if state["pump_on"]:
                    state["pump_on"] = False
                    await broadcast_event("PUMP_DEACTIVATED", "Soil moisture saturated. Irrigation pump deactivated.")

        # Update last updated timestamp
        state["last_updated"] = datetime.now().strftime("%H:%M:%S")

        # 3. Log to CSV every 5 seconds (5 loops of 1s)
        log_counter += 1
        if log_counter >= 5:
            log_to_csv()
            log_counter = 0

        # 3b. Sync to ThingSpeak Cloud every 15 seconds
        if THINGSPEAK_WRITE_KEY:
            if datetime.now().second % 15 == 0:
                try:
                    # Sync fields: Field1=Temp, Field2=Humidity, Field3=Soil Moisture, Field4=Light, Field5=Water, Field6=Pump State
                    url = f"https://api.thingspeak.com/update?api_key={THINGSPEAK_WRITE_KEY}&field1={state['temperature']:.1f}&field2={state['humidity']:.1f}&field3={state['soil_moisture']:.1f}&field4={state['light']}&field5={state['water_level']:.1f}&field6={1 if state['pump_on'] else 0}"
                    await asyncio.to_thread(urllib.request.urlopen, url, timeout=5)
                    await broadcast_event("CLOUDSYNC", "Telemetry packet uploaded to ThingSpeak Cloud.")
                except Exception as e:
                    print(f"ThingSpeak sync failed: {e}")

        # 4. Broadcast real-time packet to dashboard clients
        await broadcast_state()
        await asyncio.sleep(1.0)

async def broadcast_event(event_type: str, message: str):
    """Send alert events to WebSocket clients."""
    if not active_connections:
        return
    payload = json.dumps({
        "type": "alert",
        "timestamp": datetime.now().strftime("%H:%M:%S"),
        "event": event_type,
        "message": message
    })
    await asyncio.gather(*[client.send_text(payload) for client in active_connections], return_exceptions=True)

# API Input Models
class ThresholdUpdate(BaseModel):
    soil_threshold: float
    water_threshold: float

class ManualOverride(BaseModel):
    pump_on: bool
    auto_mode: bool

# REST Endpoints
@app.get("/", response_class=HTMLResponse)
async def get_dashboard(request: Request):
    """Render the dashboard UI index template."""
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/api/v1/control/thresholds")
async def update_thresholds(data: ThresholdUpdate):
    """Modify threshold settings dynamically."""
    state["soil_threshold"] = data.soil_threshold
    state["water_threshold"] = data.water_threshold
    await broadcast_event("SETTINGS_CHANGED", f"Control thresholds updated: Soil trigger = {data.soil_threshold}%, Tank cutoff = {data.water_threshold}%.")
    return {"status": "success", "thresholds": {"soil": state["soil_threshold"], "water": state["water_threshold"]}}

@app.post("/api/v1/control/override")
async def update_override(data: ManualOverride):
    """Enable/disable manual pump control and Auto-mode toggles."""
    state["auto_mode"] = data.auto_mode
    
    # Handle manual pump actuation
    if not state["auto_mode"]:
        # Safety interlock: Prevent manual override if water level is critically low
        if data.pump_on and state["water_level"] < state["water_threshold"]:
            return {"status": "error", "message": "Cannot actuate pump: Water level is below safety cutoff."}
        
        state["pump_on"] = data.pump_on
        mode_str = "MANUAL"
        action_str = "activated" if state["pump_on"] else "deactivated"
        await broadcast_event("MANUAL_OVERRIDE", f"Control switched to manual. Pump {action_str} by operator.")
    else:
        # Re-enabling auto mode
        await broadcast_event("AUTO_MODE_RESTORED", "Control switched back to automated threshold rules.")
        
    return {"status": "success", "mode": "auto" if state["auto_mode"] else "manual", "pump_state": state["pump_on"]}

@app.post("/api/v1/simulator/telemetry")
async def inject_telemetry(soil: float = None, temp: float = None, hum: float = None, light: float = None, water: float = None):
    """Endpoint for manually forcing telemetry values (interactive physical simulation inputs)."""
    if soil is not None: state["soil_moisture"] = max(0.0, min(100.0, soil))
    if temp is not None: state["temperature"] = max(0.0, min(50.0, temp))
    if hum is not None: state["humidity"] = max(0.0, min(100.0, hum))
    if light is not None: state["light"] = max(0.0, min(2000.0, light))
    if water is not None: state["water_level"] = max(0.0, min(100.0, water))
    
    await broadcast_state()
    return {"status": "success", "state": state}

# WebSocket Handlers
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.add(websocket)
    # Immediately send current state on connect
    try:
        await websocket.send_text(json.dumps({
            "type": "telemetry",
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "data": state
        }))
        while True:
            # Keep connection open and listen for messages if needed
            data = await websocket.receive_text()
            # Handle client heartbeats or client commands if any
            client_msg = json.loads(data)
            if client_msg.get("action") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        active_connections.remove(websocket)
    except Exception as e:
        print(f"WebSocket error: {e}")
        if websocket in active_connections:
            active_connections.remove(websocket)

@app.on_event("startup")
async def startup_event():
    """Start the background physical simulator loop on FastAPI startup."""
    asyncio.create_task(telemetry_simulator_loop())

if __name__ == "__main__":
    import uvicorn
    # Start server binding to all interfaces on port 5000
    uvicorn.run(app, host="0.0.0.0", port=5000)
