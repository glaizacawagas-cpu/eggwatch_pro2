/*
 * ============================================================
 *  EggWatch Pro - ESP32 Firmware
 *  For Vercel/Local Web App Integration
 * ============================================================
 *  Hardware: ESP32
 *  Sensor: AHT30 (I2C - SDA=21, SCL=22)
 *  Outputs: Heater (18), Egg Turner (5), Fan (17)
 * ============================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <ArduinoJson.h>

// ============== CONFIGURATION ==============
// WiFi Settings
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Server URL (change after deploying to Vercel)
// Example: "https://your-app.vercel.app/api"
// Or local: "http://192.168.1.100/eggwatch_pro/api"
const char* serverUrl = "http://192.168.1.100/eggwatch_pro/api";

// ============== PINS ==============
#define HEATER_PIN   18
#define TURNER_PIN    5
#define FAN_PIN      17
#define AHT30_ADDR   0x38
#define AHT30_CMD_TRIGGER 0xAC

// ============== THRESHOLDS ==============
const float TEMP_HEATER_ON  = 36.5f;
const float TEMP_HEATER_OFF = 37.0f;
const float TEMP_FAN_ON    = 37.5f;
const float TEMP_FAN_OFF    = 37.0f;
const unsigned long TURNER_ON_TIME = 10000UL;  // 10 seconds
const unsigned long TURNER_INTERVAL = 14400000UL; // 4 hours

// ============== VARIABLES ==============
float temperature = 37.0f;
float humidity = 55.0f;
bool heaterOn = true;
bool fanOn = false;
bool turnerOn = false;
int turnsToday = 0;
unsigned long lastTurnerTime = 0;
unsigned long lastSensorRead = 0;
unsigned long lastDataSend = 0;
unsigned long uptime = 0;
unsigned long startTime = 0;
bool fanForced = false;

// ============== SETUP ==============
void setup() {
  Serial.begin(115200);
  Wire.begin(21, 22); // SDA, SCL
  delay(100);

  // Initialize pins
  pinMode(HEATER_PIN, OUTPUT);
  pinMode(TURNER_PIN, OUTPUT);
  pinMode(FAN_PIN, OUTPUT);

  // Initial states (ACTIVE-LOW relays)
  digitalWrite(HEATER_PIN, LOW);  // Heater ON
  digitalWrite(TURNER_PIN, HIGH); // Turner OFF
  digitalWrite(FAN_PIN, HIGH);    // Fan OFF

  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi...");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected!");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());

  // AHT30 reset
  Wire.beginTransmission(AHT30_ADDR);
  Wire.write(0xBA);
  Wire.endTransmission();
  delay(100);

  startTime = millis();
  Serial.println("=== EggWatch Pro Ready ===");
}

// ============== LOOP ==============
void loop() {
  // Update uptime
  uptime = (millis() - startTime) / 1000;

  // Read sensors every second
  if (millis() - lastSensorRead > 1000) {
    readAHT30();
    controlHeater();
    controlFan();
    controlTurner();
    lastSensorRead = millis();
  }

  // Send data to server every 5 seconds
  if (millis() - lastDataSend > 5000) {
    sendDataToServer();
    lastDataSend = millis();
  }

  delay(100);
}

// ============== AHT30 SENSOR ==============
void readAHT30() {
  Wire.beginTransmission(AHT30_ADDR);
  Wire.write(AHT30_CMD_TRIGGER);
  Wire.write(0x33);
  Wire.write(0x00);
  if (Wire.endTransmission() != 0) {
    Serial.println("[AHT30] Error");
    return;
  }
  
  delay(80);
  
  if (Wire.requestFrom(AHT30_ADDR, 6) != 6) {
    Serial.println("[AHT30] Read error");
    return;
  }

  uint8_t data[6];
  for (int i = 0; i < 6; i++) data[i] = Wire.read();

  if (data[0] & 0x80) return;

  uint32_t hum_raw = ((uint32_t)data[1] << 12) | ((uint32_t)data[2] << 4) | ((data[3] & 0xF0) >> 4);
  uint32_t temp_raw = ((uint32_t)(data[3] & 0x0F) << 16) | ((uint32_t)data[4] << 8) | data[5];

  humidity = (hum_raw * 100.0f) / 1048576.0f;
  temperature = (temp_raw * 200.0f / 1048576.0f) - 50.0f;

  Serial.printf("Temp: %.1f°C | Hum: %.1f%%\n", temperature, humidity);
}

// ============== HEATER CONTROL ==============
void controlHeater() {
  if (heaterOn && temperature >= TEMP_HEATER_OFF) {
    digitalWrite(HEATER_PIN, HIGH); // OFF
    heaterOn = false;
    Serial.println("[Heater] OFF");
  } else if (!heaterOn && temperature <= TEMP_HEATER_ON) {
    digitalWrite(HEATER_PIN, LOW); // ON
    heaterOn = true;
    Serial.println("[Heater] ON");
  }
}

// ============== FAN CONTROL ==============
void controlFan() {
  if (fanForced) return; // Manual control active

  if (!fanOn && temperature >= TEMP_FAN_ON) {
    digitalWrite(FAN_PIN, LOW); // ON
    fanOn = true;
    Serial.println("[Fan] ON");
  } else if (fanOn && temperature <= TEMP_FAN_OFF) {
    digitalWrite(FAN_PIN, HIGH); // OFF
    fanOn = false;
    Serial.println("[Fan] OFF");
  }
}

// ============== EGG TURNER CONTROL ==============
void controlTurner() {
  unsigned long now = millis();

  // Auto turn every interval
  if (!turnerOn && (now - lastTurnerTime >= TURNER_INTERVAL)) {
    digitalWrite(TURNER_PIN, LOW); // ON
    turnerOn = true;
    lastTurnerTime = now;
    turnsToday++;
    Serial.println("[Turner] ON - Eggs turning");
  }

  // Turn off after time
  if (turnerOn && (now - lastTurnerTime >= TURNER_ON_TIME)) {
    digitalWrite(TURNER_PIN, HIGH); // OFF
    turnerOn = false;
    Serial.println("[Turner] OFF");
  }
}

// ============== SEND DATA TO SERVER ==============
void sendDataToServer() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    return;
  }

  HTTPClient http;
  String url = String(serverUrl) + "/data.php";

  http.begin(url);
  http.addHeader("Content-Type", "application/json");

  StaticJsonDocument<256> doc;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["motorRunning"] = turnerOn;
  doc["fanRunning"] = fanOn;
  doc["heaterRunning"] = heaterOn;
  doc["turnsToday"] = turnsToday;
  doc["uptime"] = uptime;
  doc["firmware"] = "v2.1.4";

  String jsonStr;
  serializeJson(doc, jsonStr);

  int httpCode = http.POST(jsonStr);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("[Server] Response: %d\n", httpCode);
    
    // Check for commands from server
    StaticJsonDocument<512> responseDoc;
    DeserializationError error = deserializeJson(responseDoc, response);
    
    if (!error) {
      // Handle fan command
      if (responseDoc.containsKey("fanRunning")) {
        bool serverFan = responseDoc["fanRunning"];
        if (serverFan != fanOn) {
          fanForced = true;
          digitalWrite(FAN_PIN, serverFan ? LOW : HIGH);
          fanOn = serverFan;
          Serial.printf("[Fan] Set to: %s\n", serverFan ? "ON" : "OFF");
        }
      }
      
      // Handle turn command
      if (responseDoc.containsKey("triggerTurn") && responseDoc["triggerTurn"]) {
        if (!turnerOn) {
          digitalWrite(TURNER_PIN, LOW);
          turnerOn = true;
          lastTurnerTime = millis();
          turnsToday++;
          Serial.println("[Turner] Manual trigger");
        }
      }
    }
  } else {
    Serial.printf("[Server] Error: %d\n", httpCode);
  }

  http.end();
}

// ============== MANUAL FAN CONTROL ==============
// Add serial commands for testing
void serialEvent() {
  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toUpperCase();

    if (cmd == "FAN ON") {
      fanForced = true;
      digitalWrite(FAN_PIN, LOW);
      fanOn = true;
      Serial.println("[Fan] Forced ON");
    } else if (cmd == "FAN OFF") {
      fanForced = false;
      digitalWrite(FAN_PIN, HIGH);
      fanOn = false;
      Serial.println("[Fan] Forced OFF (auto)");
    } else if (cmd == "TURN") {
      if (!turnerOn) {
        digitalWrite(TURNER_PIN, LOW);
        turnerOn = true;
        lastTurnerTime = millis();
        turnsToday++;
        Serial.println("[Turner] Manual trigger");
      }
    } else if (cmd == "STATUS") {
      Serial.println("=== Status ===");
      Serial.printf("Temp: %.1f°C\n", temperature);
      Serial.printf("Humidity: %.1f%%\n", humidity);
      Serial.printf("Heater: %s\n", heaterOn ? "ON" : "OFF");
      Serial.printf("Fan: %s\n", fanOn ? "ON" : "OFF");
      Serial.printf("Turner: %s\n", turnerOn ? "ON" : "OFF");
      Serial.printf("Turns Today: %d\n", turnsToday);
      Serial.printf("Uptime: %lu seconds\n", uptime);
    }
  }
}
