/**
 * ==========================================================================
 * AgriNexus AI — Resilient ESP32 IoT Smart Farming Firmware
 * Targets: ESP32 DevKitC V4 / Wokwi virtual simulator
 * Features: Multi-sensor reading, MQTT publishing, local closed-loop failover,
 *           and optocoupled relay actuation with dry-run safety protection.
 * ==========================================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

// --- PIN DEFINITIONS ---
#define DHTPIN            4         // DHT22 Temperature & Humidity sensor
#define DHTTYPE           DHT22     
#define SOIL_PIN          34        // Analog Soil Moisture sensor (capacitive)
#define LDR_PIN           35        // Analog LDR Photoresistor sensor
#define RELAY_PIN         25        // Active-low / active-high Relay trigger pin
#define TRIG_PIN          12        // Ultrasonic sensor Trigger (water level)
#define ECHO_PIN          13        // Ultrasonic sensor Echo (water level)

// --- SYSTEM THRESHOLDS (LOCAL FALLBACK) ---
#define SOIL_DRY_LIMIT    1500      // Calibrated ADC dry limit (approx 35% moisture)
#define WATER_MIN_LIMIT   10.0      // Min safe distance (cm) before tank dry run

// --- WIFI & MQTT CONFIGURATION ---
const char* wifi_ssid        = "Wokwi-GUEST";           // Default simulator SSID
const char* wifi_password    = "";                      // No password on Wokwi guest AP

// [Option 1: Connect to Local Dashboard Gateway (Default)]
const char* mqtt_server      = "broker.hivemq.com";     // Free public MQTT broker
const int mqtt_port          = 1883;
const char* mqtt_client_id   = "agrinex_esp32_node1";
const char* telemetry_topic  = "farm/node1/telemetry";
const char* command_topic    = "farm/node1/control";

// [Option 2: Direct ThingSpeak Cloud Integration (Alternate)]
// To publish directly to ThingSpeak instead of the local gateway dashboard:
// 1. Set mqtt_server     = "mqtt3.thingspeak.com";
// 2. Set mqtt_port       = 1883;
// 3. Set mqtt_client_id  = "YOUR_THINGSPEAK_MQTT_CLIENT_ID" (from ThingSpeak profile)
// 4. Set telemetry_topic = "channels/757665/publish" (channels/<ChannelID>/publish)
// 5. Publish formatted string: "field1=temp&field2=humidity&field3=soil..." instead of JSON.

// --- LIBRARY INSTANCES ---
DHT dht(DHTPIN, DHTTYPE);
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// --- GLOBAL VARIABLES ---
unsigned long lastTelemetryTime = 0;
const unsigned long telemetryInterval = 5000; // Publish telemetry every 5 seconds
bool localAutoIrrigation = true;
bool pumpState = false;

// --- UTILITY: ULTRASONIC DISTANCE READING ---
float readWaterLevelDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);
  
  long duration = pulseIn(ECHO_PIN, HIGH);
  // Calculate distance in cm (speed of sound = 343 m/s = 0.0343 cm/us)
  float distance = duration * 0.0343 / 2;
  return distance;
}

// --- SETUP ---
void setup() {
  Serial.begin(115200);
  Serial.println("\n[SYSTEM] Initializing AgriNexus AI Node...");

  // Actuator Configuration
  pinMode(RELAY_PIN, OUTPUT);
  // Force pump OFF on startup (Active LOW relays turn off when driven HIGH)
  digitalWrite(RELAY_PIN, HIGH); 

  // Sensor Configuration
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  dht.begin();

  // Connect to Wi-Fi
  connectWiFi();

  // Setup MQTT client
  mqttClient.setServer(mqtt_server, mqtt_port);
  mqttClient.setCallback(mqttCallback);
}

// --- CONNECT WIFI ---
void connectWiFi() {
  delay(10);
  Serial.printf("\n[WIFI] Connecting to SSID: %s\n", wifi_ssid);
  WiFi.begin(wifi_ssid, wifi_password);

  int retryCounter = 0;
  while (WiFi.status() != WL_CONNECTED && retryCounter < 15) {
    delay(500);
    Serial.print(".");
    retryCounter++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WIFI] Connected! Assigned IP: %s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\n[WIFI] Connection failed. Operating in offline/local fallback mode.");
  }
}

// --- MQTT CALLBACK (RECEIVE COMMANDS) ---
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.printf("\n[MQTT] Command payload arrived on topic [%s]\n", topic);
  
  // Parse incoming JSON packet
  StaticJsonDocument<200> doc;
  DeserializationError error = deserializeJson(doc, payload, length);

  if (error) {
    Serial.print("[MQTT] JSON Deserialization failed: ");
    Serial.println(error.c_str());
    return;
  }

  // Parse control commands
  if (doc.containsKey("auto_mode")) {
    localAutoIrrigation = doc["auto_mode"];
    Serial.printf("[SYSTEM] Control mode updated. Automated Control: %s\n", localAutoIrrigation ? "ENABLED" : "DISABLED");
  }

  if (doc.containsKey("pump_on")) {
    bool targetPumpState = doc["pump_on"];
    if (!localAutoIrrigation) {
      actuatePump(targetPumpState);
      Serial.printf("[SYSTEM] Operator manual override. Pump state set to: %s\n", targetPumpState ? "ON" : "OFF");
    } else {
      Serial.println("[SYSTEM] Manual override ignored. System is in AUTO mode.");
    }
  }
}

// --- ACTUATE PUMP WITH SAFETY CHECK ---
void actuatePump(bool turnOn) {
  float distance = readWaterLevelDistance();
  
  // Safety Interlock: Block pump execution if reservoir level is empty
  if (turnOn && distance > WATER_MIN_LIMIT * 4) { // Assumes > 40cm distance is empty tank
    Serial.println("[SAFETY] CRITICAL: Command blocked! Water reservoir level too low (Dry-Run prevention).");
    digitalWrite(RELAY_PIN, HIGH); // Force Pump OFF
    pumpState = false;
    return;
  }

  if (turnOn) {
    digitalWrite(RELAY_PIN, LOW); // Trigger active-low relay contacts
    pumpState = true;
  } else {
    digitalWrite(RELAY_PIN, HIGH); // De-energize relay contacts
    pumpState = false;
  }
}

// --- RECONNECT MQTT ---
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("[MQTT] Attempting to connect to HiveMQ Broker...");
    if (mqttClient.connect(mqtt_client_id)) {
      Serial.println(" Connected!");
      // Subscribe to control topics
      mqttClient.subscribe(command_topic);
      Serial.printf("[MQTT] Subscribed to topic: %s\n", command_topic);
    } else {
      Serial.printf(" Failed, rc=%d. Retrying in 3 seconds...\n", mqttClient.state());
      delay(3000);
      
      // Keep processing local failsafe routines even when broker is down
      runLocalFailsafe();
    }
  }
}

// --- LOCAL CLOSED-LOOP FAILSAFE CONTROLLER ---
void runLocalFailsafe() {
  if (!localAutoIrrigation) return;

  int soilADC = analogRead(SOIL_PIN);
  float distance = readWaterLevelDistance();

  // Failsafe Rules
  if (distance > WATER_MIN_LIMIT * 4) {
    // Force shutdown if dry
    actuatePump(false);
    Serial.println("[LOCAL FAILSAFE] Reservoir empty! Stopping pump.");
  } else if (soilADC > SOIL_DRY_LIMIT) {
    // Soil is dry, turn pump ON
    actuatePump(true);
    Serial.printf("[LOCAL FAILSAFE] Soil moisture dry (ADC %d). Activating irrigation.\n", soilADC);
  } else if (soilADC < 1000) {
    // Soil is saturated, turn pump OFF
    actuatePump(false);
    Serial.printf("[LOCAL FAILSAFE] Soil moisture saturated (ADC %d). Deactivating irrigation.\n", soilADC);
  }
}

// --- MAIN LOOP ---
void loop() {
  // Ensure network connectivity is maintained in the background
  if (WiFi.status() == WL_CONNECTED) {
    if (!mqttClient.connected()) {
      reconnectMQTT();
    }
    mqttClient.loop();
  } else {
    // If WiFi is lost, handle local controls directly
    runLocalFailsafe();
  }

  // Handle telemetry publishing timeline
  unsigned long currentMillis = millis();
  if (currentMillis - lastTelemetryTime >= telemetryInterval) {
    lastTelemetryTime = currentMillis;

    // Read Sensors
    float temp = dht.readTemperature();
    float hum = dht.readHumidity();
    int soilADC = analogRead(SOIL_PIN);
    int lightADC = analogRead(LDR_PIN);
    float waterDistance = readWaterLevelDistance();

    // Skip corrupted sensor packets
    if (isnan(temp) || isnan(hum)) {
      Serial.println("[ERROR] Failed to read from DHT sensor!");
      return;
    }

    // Convert raw ADC values to generic percentages for user readability
    float soilMoisturePercent = map(soilADC, 4095, 1000, 0, 100);
    soilMoisturePercent = constrain(soilMoisturePercent, 0.0, 100.0);
    
    float waterLevelPercent = map(waterDistance, 40, 2, 0, 100); // Assumes max depth = 40cm
    waterLevelPercent = constrain(waterLevelPercent, 0.0, 100.0);

    // Print to Serial Monitor
    Serial.printf("\n================ telemetry node ================\n");
    Serial.printf("Ambient Temp   : %.1f °C\n", temp);
    Serial.printf("Air Humidity   : %.1f %%\n", hum);
    Serial.printf("Soil Moisture  : %.1f %% (ADC: %d)\n", soilMoisturePercent, soilADC);
    Serial.printf("Light Intensity: %d (ADC)\n", lightADC);
    Serial.printf("Reservoir Dist : %.1f cm (%.1f %%)\n", waterDistance, waterLevelPercent);
    Serial.printf("Irrigation Pump: %s\n", pumpState ? "ON (ACTIVE)" : "OFF (INACTIVE)");
    Serial.printf("System Mode    : %s\n", localAutoIrrigation ? "AUTOMATIC" : "MANUAL");

    // Execute local auto control loop if not connected to server
    if (WiFi.status() != WL_CONNECTED || !mqttClient.connected()) {
      runLocalFailsafe();
    }

    // Publish telemetry over MQTT if network is connected
    if (WiFi.status() == WL_CONNECTED && mqttClient.connected()) {
      StaticJsonDocument<256> doc;
      doc["soil_moisture"] = round(soilMoisturePercent * 10) / 10;
      doc["temperature"] = round(temp * 10) / 10;
      doc["humidity"] = round(hum * 10) / 10;
      doc["light"] = lightADC;
      doc["water_level"] = round(waterLevelPercent * 10) / 10;
      doc["pump_on"] = pumpState;
      doc["auto_mode"] = localAutoIrrigation;

      char buffer[256];
      serializeJson(doc, buffer);
      
      if (mqttClient.publish(telemetry_topic, buffer)) {
        Serial.println("[MQTT] Telemetry payload published successfully.");
      } else {
        Serial.println("[MQTT] Error: Failed to publish payload.");
      }
    }
  }

  // Small scheduler delay
  delay(50);
}
