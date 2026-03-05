/**
 * EggWatch Pro - ESP32 Firmware with Web Server
 * Smart Incubator Controller with REST API
 * 
 * Hardware:
 * - ESP32 DevKit V1
 * - DHT22 (Temperature & Humidity Sensor) - GPIO4
 * - Servo Motor (Egg Turner) - GPIO13
 * - Relay Module (Fan Control) - GPIO26
 * - Relay Module (Motor Control) - GPIO27
 * - LED (Status) - GPIO2 (Built-in)
 */

#include <WiFi.h>
#include <WebServer.h>
#include <DHT.h>
#include <Servo.h>
#include <ArduinoJson.h>

// ============== CONFIGURATION ==============
// WiFi Settings - CHANGE THESE
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Fixed IP Configuration
IPAddress localIP(192, 168, 1, 100);
IPAddress gateway(192, 168, 1, 1);
IPAddress subnet(255, 255, 255, 0);

// Hardware Pins
#define DHTPIN 4          // DHT22 Data pin
#define DHTTYPE DHT22
#define SERVO_PIN 13      // Servo Signal
#define FAN_PIN 26        // Fan Relay
#define MOTOR_PIN 27      // Motor Relay
#define LED_PIN 2         // Status LED

// ============== INITIALIZE HARDWARE ==============
DHT dht(DHTPIN, DHTTYPE);
Servo eggServo;
WebServer server(80);

// ============== GLOBAL VARIABLES ==============
unsigned long uptime = 0;
unsigned long startTime = 0;

float temperature = 37.5;
float humidity = 57.0;
bool motorRunning = false;
bool fanRunning = false;
int turnsToday = 0;
unsigned long nextTurnTime = 0;

// Settings
int turnsPerDay = 8;
int intervalHours = 3;
bool scheduleEnabled = true;
float tempMin = 36.0;
float tempMax = 38.5;
float humMin = 50.0;
float humMax = 65.0;

// ============== SETUP ==============
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== EggWatch Pro ESP32 Starting ===");
  
  // Initialize pins
  pinMode(LED_PIN, OUTPUT);
  pinMode(FAN_PIN, OUTPUT);
  pinMode(MOTOR_PIN, OUTPUT);
  
  // Initial states - all off
  digitalWrite(LED_PIN, LOW);
  digitalWrite(FAN_PIN, LOW);
  digitalWrite(MOTOR_PIN, LOW);
  
  // Initialize sensors
  dht.begin();
  eggServo.attach(SERVO_PIN);
  eggServo.write(90);  // Neutral position
  
  // Connect to WiFi
  connectWiFi();
  
  // Setup web server routes
  setupServerRoutes();
  
  // Calculate first turn time (3 hours from now)
  nextTurnTime = millis() + (intervalHours * 3600000UL);
  startTime = millis();
  
  Serial.println("=== EggWatch Pro Ready ===");
  digitalWrite(LED_PIN, HIGH);  // LED on when ready
}

// ============== MAIN LOOP ==============
void loop() {
  server.handleClient();
  
  uptime = (millis() - startTime) / 1000;
  
  // Read sensors every 2 seconds
  static unsigned long lastSensorRead = 0;
  if (millis() - lastSensorRead > 2000) {
    readSensors();
    lastSensorRead = millis();
  }
  
  // Check schedule every 30 seconds
  static unsigned long lastScheduleCheck = 0;
  if (millis() - lastScheduleCheck > 30000) {
    checkSchedule();
    lastScheduleCheck = millis();
  }
  
  // Auto fan control
  checkFanControl();
}

// ============== WIFI CONNECTION ==============
void connectWiFi() {
  Serial.print("Connecting to WiFi...");
  
  // Try static IP first
  if (!WiFi.config(localIP, gateway, subnet)) {
    Serial.println("STA Failed to configure!");
  }
  
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nConnected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\nFailed to connect! Running in AP mode...");
    WiFi.softAP("EggWatch-Pro", "12345678");
    Serial.print("AP IP: ");
    Serial.println(WiFi.softAPIP());
  }
}

// ============== SENSOR READING ==============
void readSensors() {
  float newTemp = dht.readTemperature();
  float newHum = dht.readHumidity();
  
  if (!isnan(newTemp) && !isnan(newHum)) {
    temperature = newTemp;
    humidity = newHum;
    Serial.printf("Sensors: %.1f°C, %.1f%%\n", temperature, humidity);
  } else {
    Serial.println("Warning: Invalid sensor reading!");
  }
}

// ============== SCHEDULE & CONTROL ==============
void checkSchedule() {
  if (!scheduleEnabled || motorRunning) return;
  
  if (millis() >= nextTurnTime) {
    performEggTurn();
    nextTurnTime = millis() + (intervalHours * 3600000UL);
  }
}

void performEggTurn() {
  Serial.println("Turning eggs...");
  motorRunning = true;
  digitalWrite(MOTOR_PIN, HIGH);
  
  // Smooth servo movement
  for (int pos = 90; pos <= 180; pos += 10) {
    eggServo.write(pos);
    delay(100);
  }
  delay(500);
  for (int pos = 180; pos >= 0; pos -= 10) {
    eggServo.write(pos);
    delay(100);
  }
  delay(500);
  for (int pos = 0; pos <= 90; pos += 10) {
    eggServo.write(pos);
    delay(100);
  }
  
  delay(2000);  // Hold position
  digitalWrite(MOTOR_PIN, LOW);
  motorRunning = false;
  turnsToday++;
  
  Serial.printf("Turn complete! Total today: %d\n", turnsToday);
}

void checkFanControl() {
  // Auto fan when temperature is too high
  if (temperature > tempMax + 0.5 && !fanRunning) {
    setFan(true);
  } else if (temperature < tempMax - 1.0 && fanRunning) {
    setFan(false);
  }
}

void setFan(bool state) {
  fanRunning = state;
  digitalWrite(FAN_PIN, state ? HIGH : LOW);
  Serial.printf("Fan: %s\n", state ? "ON" : "OFF");
}

// ============== WEB SERVER ROUTES ==============
void setupServerRoutes() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/api/status", HTTP_GET, handleStatus);
  server.on("/api/ping", HTTP_GET, handlePing);
  server.on("/api/turn", HTTP_POST, handleTurn);
  server.on("/api/fan", HTTP_POST, handleFan);
  server.on("/api/schedule", HTTP_POST, handleSchedule);
  server.on("/api/thresholds", HTTP_POST, handleThresholds);
  
  server.onNotFound([]() {
    server.send(404, "application/json", "{\"error\":\"Not found\"}");
  });
}

void handleRoot() {
  String html = "<html><head><title>EggWatch Pro</title></head><body>";
  html += "<h1>EggWatch Pro ESP32</h1>";
  html += "<p>Temperature: " + String(temperature) + "°C</p>";
  html += "<p>Humidity: " + String(humidity) + "%</p>";
  html += "<p>Motor: " + String(motorRunning ? "Running" : "Idle") + "</p>";
  html += "<p>Fan: " + String(fanRunning ? "On" : "Off") + "</p>";
  html += "<p>Uptime: " + String(uptime) + " seconds</p>";
  html += "</body></html>";
  server.send(200, "text/html", html);
}

void handleStatus() {
  StaticJsonDocument<512> doc;
  
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["motorRunning"] = motorRunning;
  doc["fanRunning"] = fanRunning;
  doc["turnsToday"] = turnsToday;
  doc["nextTurnMs"] = nextTurnTime;
  doc["uptime"] = uptime;
  doc["firmware"] = "v2.1.4";
  doc["timestamp"] = "";
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void handlePing() {
  StaticJsonDocument<256> doc;
  doc["success"] = true;
  doc["firmware"] = "v2.1.4";
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void handleTurn() {
  if (!motorRunning) {
    performEggTurn();
  }
  
  StaticJsonDocument<256> doc;
  doc["success"] = true;
  doc["message"] = "Manual turn triggered";
  
  String response;
  serializeJson(doc, response);
  server.send(200, "application/json", response);
}

void handleFan() {
  if (server.hasArg("plain")) {
    String body = server.arg("plain");
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, body);
    
    if (!error) {
      bool state = doc["state"] | false;
      setFan(state);
      
      StaticJsonDocument<256> responseDoc;
      responseDoc["success"] = true;
      responseDoc["fanRunning"] = fanRunning;
      responseDoc["message"] = fanRunning ? "Fan turned ON" : "Fan turned OFF";
      
      String response;
      serializeJson(responseDoc, response);
      server.send(200, "application/json", response);
      return;
    }
  }
  
  server.send(400, "application/json", "{\"error\":\"Invalid request\"}");
}

void handleSchedule() {
  if (server.hasArg("plain")) {
    String body = server.arg("plain");
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, body);
    
    if (!error) {
      turnsPerDay = doc["turnsPerDay"] | 8;
      intervalHours = doc["intervalHours"] | 3.0;
      
      // Recalculate next turn time
      nextTurnTime = millis() + (intervalHours * 3600000UL);
      
      StaticJsonDocument<256> responseDoc;
      responseDoc["success"] = true;
      
      String response;
      serializeJson(responseDoc, response);
      server.send(200, "application/json", response);
      return;
    }
  }
  
  server.send(400, "application/json", "{\"error\":\"Invalid request\"}");
}

void handleThresholds() {
  if (server.hasArg("plain")) {
    String body = server.arg("plain");
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, body);
    
    if (!error) {
      tempMin = doc["tempMin"] | 36.0;
      tempMax = doc["tempMax"] | 38.5;
      humMin = doc["humMin"] | 50.0;
      humMax = doc["humMax"] | 65.0;
      
      StaticJsonDocument<256> responseDoc;
      responseDoc["success"] = true;
      
      String response;
      serializeJson(responseDoc, response);
      server.send(200, "application/json", response);
      return;
    }
  }
  
  server.send(400, "application/json", "{\"error\":\"Invalid request\"}");
}
