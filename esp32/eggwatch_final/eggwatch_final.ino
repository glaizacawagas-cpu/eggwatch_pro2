/*
 * ============================================================
 *  Egg Incubator Controller - Web App Integrated Version
 *  Hardware : ESP32
 *  Sensor   : AHT30 (I2C — SDA=21, SCL=22)
 *  Outputs  : Heater relay (pin 18, ACTIVE-LOW)
 *             Egg-turner relay (pin  5, ACTIVE-LOW)
 *             Fan relay       (pin 17, ACTIVE-LOW)
 * ============================================================
 */

#include <Wire.h>
#include <WiFi.h>
#include <WebServer.h>
#include <ArduinoJson.h>

// ── WiFi Configuration ────────────────────────────────────────
const char* ssid     = "YOUR_WIFI_SSID";          // Change to your WiFi
const char* password = "YOUR_WIFI_PASSWORD";      // Change to your password
const char* hostname = "EggWatch-Pro";

// ── Web Server ────────────────────────────────────────────────
WebServer server(80);

// ── Pin definitions ────────────────────────────────────────────
#define HEATER_RELAY_PIN   18
#define TURNER_RELAY_PIN    5
#define FAN_RELAY_PIN      17

// ── AHT30 ────────────────────────────────────────────────────
#define AHT30_ADDR         0x38
#define AHT30_CMD_RESET    0xBA
#define AHT30_CMD_TRIGGER  0xAC

// ── Temperature thresholds (°C) ────────────────────────────────
const float TEMP_HEATER_ON  = 36.5f;
const float TEMP_HEATER_OFF = 37.0f;

// ── Fan thresholds (°C) ────────────────────────────────────────
const float TEMP_FAN_ON  = 37.5f;
const float TEMP_FAN_OFF = 37.0f;

// ── Egg-turner timing ─────────────────────────────────────────
const unsigned long TURNER_ON_MS      = 10UL * 1000UL;          // 10 s ON
const unsigned long TURNER_OFF_MS_DEF =  4UL * 60UL * 1000UL;   // 4 min OFF

// ── Sensor polling interval ────────────────────────────────────
const unsigned long SENSOR_INTERVAL_MS = 1000UL;
const unsigned long SERVER_INTERVAL_MS = 100UL;

// ── State variables ────────────────────────────────────────────
bool heaterOn = true;
bool fanOn    = false;

unsigned long offDuration       = TURNER_OFF_MS_DEF;
unsigned long lastTurnerChange  = 0;
bool          turnerOn          = false;

unsigned long lastSensorRead    = 0;
unsigned long lastServerHandle  = 0;

// ── Sensor readings ────────────────────────────────────────────
float currentTemp = 0;
float currentHum = 0;
unsigned long uptime = 0;
int turnsToday = 0;

// ── Fan control ────────────────────────────────────────────────
bool fanForced = false;

// ── Server URL for database ────────────────────────────────────
const char* serverUrl = "http://192.168.1.100/eggwatch_pro/api";

// ================================================================
//  SETUP
// ================================================================
void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22);   // SDA, SCL
  delay(100);

  // AHT30 soft reset
  Wire.beginTransmission(AHT30_ADDR);
  Wire.write(AHT30_CMD_RESET);
  Wire.endTransmission();
  delay(100);

  // Relay pins — all outputs
  pinMode(HEATER_RELAY_PIN, OUTPUT);
  pinMode(TURNER_RELAY_PIN, OUTPUT);
  pinMode(FAN_RELAY_PIN,    OUTPUT);

  // Initial states
  digitalWrite(HEATER_RELAY_PIN, LOW);    // Heater ON (ACTIVE-LOW)
  digitalWrite(TURNER_RELAY_PIN, HIGH);   // Turner OFF
  digitalWrite(FAN_RELAY_PIN,    HIGH);   // Fan OFF

  // Connect to WiFi
  connectWiFi();

  // Setup web server routes
  setupServerRoutes();

  uptime = millis() / 1000;

  Serial.println(F("\n=== Egg Incubator Controller Ready ==="));
  Serial.print(F("IP Address: "));
  Serial.println(WiFi.localIP());
  Serial.println(F("\nWeb Server Endpoints:"));
  Serial.println(F("  GET  /           - Status page"));
  Serial.println(F("  GET  /api/status - JSON status"));
  Serial.println(F("  POST /api/fan    - Toggle fan"));
  Serial.println(F("  POST /api/turn  - Trigger turn"));
  Serial.println(F("  POST /api/schedule - Set schedule"));
  Serial.println();
}

// ================================================================
//  LOOP
// ================================================================
void loop() {
  // Handle web server
  if (millis() - lastServerHandle > SERVER_INTERVAL_MS) {
    server.handleClient();
    lastServerHandle = millis();
  }

  // Temperature control
  handleTemperatureControl();
  
  // Egg turner
  handleEggTurner();
  
  // Update uptime
  uptime = millis() / 1000;
}

// ================================================================
//  WiFi Connection
// ================================================================
void connectWiFi() {
  Serial.print(F("Connecting to WiFi..."));
  WiFi.begin(ssid, password);
  WiFi.setHostname(hostname);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(F("."));
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println(F("Connected!"));
  } else {
    Serial.println(F("Failed!"));
  }
}

// ================================================================
//  Web Server Routes
// ================================================================
void setupServerRoutes() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/ping", HTTP_GET, handlePing);
  server.on("/api/fan", HTTP_POST, handleFan);
  server.on("/api/turn", HTTP_POST, handleTurn);
  server.on("/api/schedule", HTTP_POST, handleSchedule);
  server.on("/api/thresholds", HTTP_POST, handleThresholds);
  
  server.onNotFound([]() {
    server.send(404, "application/json", "{\"error\":\"Not found\"}");
  });
}

// ── Root page ─────────────────────────────────────────────────
void handleRoot() {
  String html = "<html><head><title>EggWatch Pro</title>";
  html += "<meta name='viewport' content='width=device-width, initial-scale=1'>";
  html += "<style>body{font-family:Arial;margin:20px;background:#f0f0f0;}";
  html += ".card{background:white;padding:20px;margin:10px 0;border-radius:10px;}";
  html += "h1{color:#333;}.status{font-size:24px;margin:10px 0;}";
  html += ".on{color:green;}.off{color:red;}</style></head>";
  html += "<body><h1>🥚 EggWatch Pro ESP32</h1>";
  html += "<div class='card'><h2>Sensors</h2>";
  html += "<p>Temperature: <strong>" + String(currentTemp, 1) + "°C</strong></p>";
  html += "<p>Humidity: <strong>" + String(currentHum, 1) + "%</strong></p></div>";
  html += "<div class='card'><h2>Status</h2>";
  html += "<p>Heater: <span class='" + String(heaterOn ? "on" : "off") + "'>" + String(heaterOn ? "ON" : "OFF") + "</span></p>";
  html += "<p>Fan: <span class='" + String(fanOn ? "on" : "off") + "'>" + String(fanOn ? "ON" : "OFF") + "</span></p>";
  html += "<p>Egg Turner: <span class='" + String(turnerOn ? "on" : "off") + "'>" + String(turnerOn ? "ON" : "OFF") + "</span></p>";
  html += "<p>Turns Today: <strong>" + String(turnsToday) + "</strong></p>";
  html += "<p>Uptime: <strong>" + String(uptime) + "</strong> seconds</p></div>";
  html += "<div class='card'><h2>API</h2>";
  html += "<p><a href='/api/status'>/api/status</a></p></div>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
}

// ── JSON Status ────────────────────────────────────────────────
void handleStatus() {
  StaticJsonDocument<512> doc;
  
  doc["temperature"] = currentTemp;
  doc["humidity"] = currentHum;
  doc["motorRunning"] = turnerOn;
  doc["fanRunning"] = fanOn;
  doc["heaterRunning"] = heaterOn;
  doc["turnsToday"] = turnsToday;
  doc["nextTurnMs"] = offDuration;
  doc["uptime"] = uptime;
  doc["firmware"] = "v2.1.4-esp32";
  doc["timestamp"] = "";
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// ── Ping ─────────────────────────────────────────────────────
void handlePing() {
  StaticJsonDocument<128> doc;
  doc["success"] = true;
  doc["firmware"] = "v2.1.4-esp32";
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// ── Fan Control ────────────────────────────────────────────────
void handleFan() {
  if (server.hasArg("plain")) {
    String body = server.arg("plain");
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, body);
    
    if (!error) {
      bool state = doc["state"] | false;
      
      if (state) {
        fanForced = true;
        digitalWrite(FAN_RELAY_PIN, LOW);  // ACTIVE-LOW → ON
        fanOn = true;
      } else {
        fanForced = false;
        // Fan will return to auto control in next loop
      }
      
      StaticJsonDocument<128> responseDoc;
      responseDoc["success"] = true;
      responseDoc["fanRunning"] = fanOn;
      responseDoc["message"] = fanOn ? "Fan turned ON" : "Fan turned OFF";
      
      String response;
      serializeJson(responseDoc, response);
      server.send(200, "application/json", response);
      return;
    }
  }
  server.send(400, "application/json", "{\"error\":\"Invalid request\"}");
}

// ── Manual Turn ───────────────────────────────────────────────
void handleTurn() {
  if (!turnerOn) {
    // Trigger immediate turn
    digitalWrite(TURNER_RELAY_PIN, LOW);  // ON
    turnerOn = true;
    lastTurnerChange = millis();
    turnsToday++;
  }
  
  StaticJsonDocument<128> doc;
  doc["success"] = true;
  doc["message"] = "Manual turn triggered";
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// ── Set Schedule ──────────────────────────────────────────────
void handleSchedule() {
  if (server.hasArg("plain")) {
    String body = server.arg("plain");
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, body);
    
    if (!error) {
      int tpd = doc["turnsPerDay"] | 8;
      float ih = doc["intervalHours"] | 3.0;
      
      offDuration = (unsigned long)(ih * 60.0 * 60.0 * 1000.0);
      
      StaticJsonDocument<128> responseDoc;
      responseDoc["success"] = true;
      
      String response;
      serializeJson(responseDoc, response);
      server.send(200, "application/json", response);
      return;
    }
  }
  server.send(400, "application/json", "{\"error\":\"Invalid request\"}");
}

// ── Set Thresholds ────────────────────────────────────────────
void handleThresholds() {
  // Thresholds are handled locally, but we acknowledge the request
  StaticJsonDocument<128> doc;
  doc["success"] = true;
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

// ================================================================
//  Temperature Control (AHT30)
// ================================================================
void handleTemperatureControl() {
  if (millis() - lastSensorRead < SENSOR_INTERVAL_MS) return;
  lastSensorRead = millis();

  // Trigger measurement
  Wire.beginTransmission(AHT30_ADDR);
  Wire.write(AHT30_CMD_TRIGGER);
  Wire.write(0x33);
  Wire.write(0x00);
  if (Wire.endTransmission() != 0) {
    Serial.println(F("[AHT30] ERROR: Trigger failed"));
    return;
  }

  delay(80);

  if (Wire.requestFrom(AHT30_ADDR, 6) != 6) {
    Serial.println(F("[AHT30] ERROR: Read failed"));
    return;
  }

  uint8_t data[6];
  for (int i = 0; i < 6; i++) data[i] = Wire.read();

  if (data[0] & 0x80) {
    return;
  }

  uint32_t hum_raw = ((uint32_t)data[1] << 12) | ((uint32_t)data[2] << 4) | ((data[3] & 0xF0) >> 4);
  uint32_t temp_raw = ((uint32_t)(data[3] & 0x0F) << 16) | ((uint32_t)data[4] << 8) | data[5];

  currentHum = (hum_raw * 100.0f) / 1048576.0f;
  currentTemp = (temp_raw * 200.0f / 1048576.0f) - 50.0f;

  // ── Heater hysteresis ────────────────────────────────────────
  if (heaterOn && currentTemp >= TEMP_HEATER_OFF) {
    digitalWrite(HEATER_RELAY_PIN, HIGH);   // OFF
    heaterOn = false;
  } else if (!heaterOn && currentTemp <= TEMP_HEATER_ON) {
    digitalWrite(HEATER_RELAY_PIN, LOW);    // ON
    heaterOn = true;
  }

  // ── Fan hysteresis (only when not forced) ──────────────────
  if (!fanForced) {
    if (!fanOn && currentTemp >= TEMP_FAN_ON) {
      digitalWrite(FAN_RELAY_PIN, LOW);      // ON
      fanOn = true;
    } else if (fanOn && currentTemp <= TEMP_FAN_OFF) {
      digitalWrite(FAN_RELAY_PIN, HIGH);     // OFF
      fanOn = false;
    }
  }

  // ── Status print ───────────────────────────────────────────
  Serial.print(F("Temp: "));    Serial.print(currentTemp, 2); Serial.print(F("C"));
  Serial.print(F(" | Hum: "));  Serial.print(currentHum, 1);  Serial.print(F("%"));
  Serial.print(F(" | H: "));   Serial.print(heaterOn ? F("ON") : F("OFF"));
  Serial.print(F(" | F: "));   Serial.print(fanOn ? F("ON") : F("OFF"));
  Serial.print(fanForced ? F("(f)") : F("(a)"));
  Serial.print(F(" | T: "));   Serial.println(turnerOn ? F("ON") : F("OFF"));
}

// ================================================================
//  Egg Turner Control
// ================================================================
void handleEggTurner() {
  unsigned long now = millis();

  if (!turnerOn && (now - lastTurnerChange >= offDuration)) {
    digitalWrite(TURNER_RELAY_PIN, LOW);   // ON
    turnerOn = true;
    lastTurnerChange = now;
    Serial.println(F("[Turner] ON"));
  }

  if (turnerOn && (now - lastTurnerChange >= TURNER_ON_MS)) {
    digitalWrite(TURNER_RELAY_PIN, HIGH);  // OFF
    turnerOn = false;
    lastTurnerChange = now;
    Serial.println(F("[Turner] OFF"));
  }
}
