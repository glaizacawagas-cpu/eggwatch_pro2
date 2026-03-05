/*
 * ============================================================
 *  EggWatch Pro - ESP32 Firmware v2
 *  Complete Integration with Web App
 * ============================================================
 *  Hardware: ESP32
 *  Sensor: AHT30 (I2C - SDA=21, SCL=22)
 *  Outputs: Heater (18), Egg Turner (5), Fan (17)
 * ============================================================
 * 
 *  INSTRUCTIONS:
 *  1. Change WiFi SSID and Password below
 *  2. Change SERVER_URL to your Vercel URL (after deployment)
 *  3. Upload to ESP32
 *  4. Open Serial Monitor (115200) to see debug output
 * ============================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <ArduinoJson.h>

// ============== CONFIGURATION - CHANGE THESE ==============
const char* ssid = "YOUR_WIFI_SSID";          // Your WiFi name
const char* password = "YOUR_WIFI_PASSWORD";  // Your WiFi password

// Server URL - Replace with your Vercel URL after deployment
// Example: "https://eggwatch-pro2.vercel.app/api"
// For local testing: "http://192.168.1.100/eggwatch_pro/api"
const char* serverUrl = "https://eggwatch-pro2.vercel.app/api";

// Device name
const char* deviceName = "EggWatch-ESP32";

// ============== HARDWARE PINS ==============
#define HEATER_PIN   18
#define TURNER_PIN    5
#define FAN_PIN      17
#define LED_PIN       2

// ============== AHT30 SENSOR ==============
#define AHT30_ADDR          0x38
#define AHT30_CMD_RESET     0xBA
#define AHT30_CMD_TRIGGER   0xAC

// ============== THRESHOLDS ==============
const float TEMP_HEATER_ON  = 36.5f;
const float TEMP_HEATER_OFF = 37.5f;
const float TEMP_FAN_ON     = 38.0f;
const float TEMP_FAN_OFF    = 37.0f;

const unsigned long TURNER_RUN_TIME = 10000UL;  // 10 seconds
const unsigned long TURNER_INTERVAL = 14400000UL; // 4 hours
const unsigned long DATA_SEND_INTERVAL = 5000UL; // 5 seconds

// ============== VARIABLES ==============
float temperature = 0;
float humidity = 0;
bool heaterOn = true;
bool fanOn = false;
bool turnerOn = false;
bool fanForced = false;
int turnsToday = 0;
unsigned long uptime = 0;
unsigned long startTime = 0;
unsigned long lastDataSend = 0;
unsigned long lastTurnerTime = 0;
bool wifiConnected = false;

// ============== SETUP ==============
void setup() {
  Serial.begin(115200);
  Serial.println("\n\n=== EggWatch Pro v2 Starting ===");
  
  // Initialize pins
  pinMode(HEATER_PIN, OUTPUT);
  pinMode(TURNER_PIN, OUTPUT);
  pinMode(FAN_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);
  
  // Initial states (ACTIVE-LOW relays)
  digitalWrite(HEATER_PIN, LOW);   // Heater ON
  digitalWrite(TURNER_PIN, HIGH);   // Turner OFF
  digitalWrite(FAN_PIN, HIGH);      // Fan OFF
  digitalWrite(LED_PIN, LOW);       // LED OFF
  
  // Initialize I2C for AHT30
  Wire.begin(21, 22);  // SDA=21, SCL=22
   
  // Reset AHT30
 delay(100);
  Wire.beginTransmission(AHT30_ADDR);
  Wire.write(AHT30_CMD_RESET);
  Wire.endTransmission();
  delay(100);
  
  // Connect to WiFi
  connectWiFi();
  
  startTime = millis();
  Serial.println("=== Setup Complete ===\n");
}

// ============== MAIN LOOP ==============
void loop() {
  // Update uptime
  uptime = (millis() - startTime) / 1000;
  
  // Read sensor every second
  static unsigned long lastSensorRead = 0;
  if (millis() - lastSensorRead > 1000) {
    readAHT30();
    controlHeater();
    controlFan();
    controlTurner();
    lastSensorRead = millis();
  }
  
  // Send data to server
  if (millis() - lastDataSend > DATA_SEND_INTERVAL) {
    sendDataToServer();
    lastDataSend = millis();
  }
  
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    if (wifiConnected) {
      Serial.println("WiFi disconnected! Reconnecting...");
      wifiConnected = false;
    }
    connectWiFi();
  }
  
  delay(100);
}

// ============== WIFI ==============
void connectWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println("\n✓ WiFi Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    digitalWrite(LED_PIN, HIGH);  // LED ON when connected
  } else {
    Serial.println("\n✗ WiFi Failed!");
  }
}

// ============== AHT30 SENSOR ==============
void readAHT30() {
  // Trigger measurement
  Wire.beginTransmission(AHT30_ADDR);
  Wire.write(AHT30_CMD_TRIGGER);
  Wire.write(0x33);
  Wire.write(0x00);
  
  if (Wire.endTransmission() != 0) {
    Serial.println("[ERROR] AHT30 not found!");
    return;
  }
  
  delay(80);
  
  if (Wire.requestFrom(AHT30_ADDR, 6) != 6) {
    Serial.println("[ERROR] AHT30 read failed!");
    return;
  }
  
  uint8_t data[6];
  for (int i = 0; i < 6; i++) {
    data[i] = Wire.read();
  }
  
  // Check busy bit
  if (data[0] & 0x80) {
    return;  // Sensor busy
  }
  
  // Calculate temperature and humidity
  uint32_t humRaw = ((uint32_t)data[1] << 12) | ((uint32_t)data[2] << 4) | ((data[3] & 0xF0) >> 4);
  uint32_t tempRaw = ((uint32_t)(data[3] & 0x0F) << 16) | ((uint32_t)data[4] << 8) | data[5];
  
  humidity = (humRaw * 100.0f) / 1048576.0f;
  temperature = (tempRaw * 200.0f / 1048576.0f) - 50.0f;
  
  // Debug output
  Serial.printf("[Sensor] Temp: %.1f°C | Hum: %.1f%%\n", temperature, humidity);
}

// ============== HEATER CONTROL ==============
void controlHeater() {
  if (heaterOn && temperature >= TEMP_HEATER_OFF) {
    digitalWrite(HEATER_PIN, HIGH);  // OFF
    heaterOn = false;
    Serial.println("[Heater] OFF");
  } 
  else if (!heaterOn && temperature <= TEMP_HEATER_ON) {
    digitalWrite(HEATER_PIN, LOW);   // ON
    heaterOn = true;
    Serial.println("[Heater] ON");
  }
}

// ============== FAN CONTROL ==============
void controlFan() {
  if (fanForced) {
    return;  // Manual control active
  }
  
  if (!fanOn && temperature >= TEMP_FAN_ON) {
    digitalWrite(FAN_PIN, LOW);   // ON
    fanOn = true;
    Serial.println("[Fan] ON (auto)");
  } 
  else if (fanOn && temperature <= TEMP_FAN_OFF) {
    digitalWrite(FAN_PIN, HIGH);  // OFF
    fanOn = false;
    Serial.println("[Fan] OFF (auto)");
  }
}

// ============== EGG TURNER ==============
void controlTurner() {
  unsigned long now = millis();
  
  // Automatic turn
  if (!turnerOn && (now - lastTurnerTime >= TURNER_INTERVAL)) {
    digitalWrite(TURNER_PIN, LOW);   // ON
    turnerOn = true;
    lastTurnerTime = now;
    turnsToday++;
    Serial.println("[Turner] ON - Eggs turning");
  }
  
  // Turn off after run time
  if (turnerOn && (now - lastTurnerTime >= TURNER_RUN_TIME)) {
    digitalWrite(TURNER_PIN, HIGH);  // OFF
    turnerOn = false;
    Serial.println("[Turner] OFF");
  }
}

// ============== SEND DATA TO SERVER ==============
void sendDataToServer() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Server] WiFi not connected, skipping...");
    return;
  }
  
  HTTPClient http;
  
  String url = String(serverUrl) + "/data.php";
  Serial.println("[Server] Sending data to: " + url);
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  // Create JSON payload
  StaticJsonDocument<256> doc;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["motorRunning"] = turnerOn;
  doc["fanRunning"] = fanOn;
  doc["heaterRunning"] = heaterOn;
  doc["turnsToday"] = turnsToday;
  doc["uptime"] = uptime;
  doc["firmware"] = "v2.0";
  doc["device"] = deviceName;
  
  String jsonStr;
  serializeJson(doc, jsonStr);
  
  int httpCode = http.POST(jsonStr);
  
  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("[Server] Response (%d): %s\n", httpCode, response.c_str());
    
    // Parse response for commands
    StaticJsonDocument<512> responseDoc;
    DeserializationError error = deserializeJson(responseDoc, response);
    
    if (!error) {
      // Check for fan command
      if (responseDoc.containsKey("fanRunning")) {
        bool newFanState = responseDoc["fanRunning"];
        if (newFanState != fanOn) {
          fanForced = true;
          digitalWrite(FAN_PIN, newFanState ? LOW : HIGH);
          fanOn = newFanState;
          Serial.printf("[Fan] Set to: %s\n", newFanState ? "ON" : "OFF");
        }
      }
    }
  } else {
    Serial.printf("[Server] Error: %d\n", httpCode);
  }
  
  http.end();
}

// ============== SERIAL COMMANDS ==============
void serialEvent() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toUpperCase();
    
    if (cmd == "STATUS") {
      Serial.println("\n=== EggWatch Status ===");
      Serial.printf("Temperature: %.1f°C\n", temperature);
      Serial.printf("Humidity: %.1f%%\n", humidity);
      Serial.printf("Heater: %s\n", heaterOn ? "ON" : "OFF");
      Serial.printf("Fan: %s\n", fanOn ? "ON" : "OFF");
      Serial.printf("Turner: %s\n", turnerOn ? "ON" : "OFF");
      Serial.printf("Turns Today: %d\n", turnsToday);
      Serial.printf("Uptime: %lu seconds\n", uptime);
      Serial.printf("WiFi: %s\n", WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected");
      Serial.println("========================\n");
    }
    else if (cmd == "FAN ON") {
      fanForced = true;
      digitalWrite(FAN_PIN, LOW);
      fanOn = true;
      Serial.println("[Fan] Forced ON");
    }
    else if (cmd == "FAN OFF") {
      fanForced = true;
      digitalWrite(FAN_PIN, HIGH);
      fanOn = false;
      Serial.println("[Fan] Forced OFF");
    }
    else if (cmd == "FAN AUTO") {
      fanForced = false;
      Serial.println("[Fan] Auto mode");
    }
    else if (cmd == "TURN") {
      if (!turnerOn) {
        digitalWrite(TURNER_PIN, LOW);
        turnerOn = true;
        lastTurnerTime = millis();
        turnsToday++;
        Serial.println("[Turner] Manual trigger");
      }
    }
    else if (cmd == "HELP") {
      Serial.println("=== Commands ===");
      Serial.println("STATUS   - Show status");
      Serial.println("FAN ON   - Turn fan on");
      Serial.println("FAN OFF  - Turn fan off");
      Serial.println("FAN AUTO - Auto fan control");
      Serial.println("TURN     - Trigger egg turn");
      Serial.println("================");
    }
  }
}
