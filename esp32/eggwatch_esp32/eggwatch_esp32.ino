/**
 * EggWatch Pro - ESP32 Firmware
 * Smart Incubator Controller
 * 
 * Hardware:
 * - ESP32 DevKit
 * - DHT22 (Temperature & Humidity Sensor)
 * - Servo Motor (Egg Turner)
 * - Relay Module (Fan Control)
 * - LED indicators
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <Servo.h>
#include <ArduinoJson.h>

// ============== CONFIGURATION ==============
// WiFi Settings
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Web Server Settings
const char* serverUrl = "http://192.168.1.100/eggwatch_pro/api";

// DHT Sensor
#define DHTPIN 4        // GPIO4 - DHT22 Data pin
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// Servo Motor (Egg Turner)
#define SERVO_PIN 13    // GPIO13 - Servo Signal
Servo eggServo;

// Fan Control
#define FAN_PIN 26      // GPIO26 - Fan Relay

// Status LED
#define LED_PIN 2       // GPIO2 - Built-in LED

// Motor Enable
#define MOTOR_PIN 27    // GPIO27 - Motor Relay

// ============== VARIABLES ==============
unsigned long uptime = 0;
unsigned long lastSensorRead = 0;
unsigned long lastDataSend = 0;
unsigned long lastTurnCheck = 0;

float temperature = 0;
float humidity = 0;
bool motorRunning = false;
bool fanRunning = false;
int turnsToday = 0;
unsigned long nextTurnTime = 0;

// Schedule settings
int turnsPerDay = 8;
int intervalHours = 3;
bool scheduleEnabled = true;

// Thresholds
float tempMin = 36.0;
float tempMax = 38.5;
float humMin = 50.0;
float humMax = 65.0;

// ============== SETUP ==============
void setup() {
  Serial.begin(115200);
  Serial.println("EggWatch Pro ESP32 Starting...");

  // Initialize pins
  pinMode(LED_PIN, OUTPUT);
  pinMode(FAN_PIN, OUTPUT);
  pinMode(MOTOR_PIN, OUTPUT);
  
  // Initial states
  digitalWrite(LED_PIN, LOW);
  digitalWrite(FAN_PIN, LOW);    // Fan off
  digitalWrite(MOTOR_PIN, LOW);  // Motor off
  
  // Initialize DHT sensor
  dht.begin();
  
  // Initialize servo
  eggServo.attach(SERVO_PIN);
  eggServo.write(90);  // Neutral position
  
  // Connect to WiFi
  connectWiFi();
  
  // Calculate first turn time
  nextTurnTime = millis() + (intervalHours * 3600000);
  
  Serial.println("EggWatch Pro Ready!");
  digitalWrite(LED_PIN, HIGH);  // LED on when ready
}

// ============== MAIN LOOP ==============
void loop() {
  uptime = millis() / 1000;
  
  // Read sensors every 2 seconds
  if (millis() - lastSensorRead > 2000) {
    readSensors();
    lastSensorRead = millis();
  }
  
  // Check schedule every minute
  if (millis() - lastTurnCheck > 60000) {
    checkSchedule();
    lastTurnCheck = millis();
  }
  
  // Send data to server every 5 seconds
  if (millis() - lastDataSend > 5000) {
    sendDataToServer();
    lastDataSend = millis();
  }
  
  // Handle server requests
  handleServerRequests();
  
  delay(100);
}

// ============== FUNCTIONS ==============

void connectWiFi() {
  Serial.print("Connecting to WiFi...");
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("Failed to connect!");
  }
}

void readSensors() {
  float newTemp = dht.readTemperature();
  float newHum = dht.readHumidity();
  
  // Check if reading is valid
  if (!isnan(newTemp) && !isnan(newHum)) {
    temperature = newTemp;
    humidity = newHum;
    
    Serial.printf("Temp: %.1f°C, Hum: %.1f%%\n", temperature, humidity);
    
    // Auto fan control based on temperature
    if (temperature > tempMax + 0.5 && !fanRunning) {
      setFan(true);
    } else if (temperature < tempMax - 1 && fanRunning) {
      setFan(false);
    }
  } else {
    Serial.println("Sensor reading failed!");
  }
}

void checkSchedule() {
  if (!scheduleEnabled) return;
  
  if (millis() >= nextTurnTime && !motorRunning) {
    // Time to turn eggs
    turnEggs();
    
    // Schedule next turn
    nextTurnTime = millis() + (intervalHours * 3600000);
  }
}

void turnEggs() {
  if (motorRunning) return;
  
  Serial.println("Turning eggs...");
  motorRunning = true;
  digitalWrite(MOTOR_PIN, HIGH);
  
  // Rotate servo back and forth
  eggServo.write(0);
  delay(1000);
  eggServo.write(180);
  delay(1000);
  eggServo.write(90);
  
  delay(3000);  // Motor on for 3 seconds
  
  digitalWrite(MOTOR_PIN, LOW);
  motorRunning = false;
  turnsToday++;
  
  Serial.println("Eggs turned!");
}

void setFan(bool state) {
  fanRunning = state;
  digitalWrite(FAN_PIN, state ? HIGH : LOW);
  Serial.printf("Fan: %s\n", state ? "ON" : "OFF");
}

void sendDataToServer() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    return;
  }
  
  HTTPClient http;
  String url = String(serverUrl) + "/data.php";
  
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  
  StaticJsonDocument<256> doc;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["motorRunning"] = motorRunning;
  doc["fanRunning"] = fanRunning;
  doc["turnsToday"] = turnsToday;
  doc["uptime"] = uptime;
  doc["firmware"] = "v2.1.4";
  
  String jsonStr;
  serializeJson(doc, jsonStr);
  
  int httpCode = http.POST(jsonStr);
  
  if (httpCode > 0) {
    String response = http.getString();
    Serial.printf("Server response: %d - %s\n", httpCode, response.c_str());
  } else {
    Serial.printf("HTTP Error: %d\n", httpCode);
  }
  
  http.end();
}

void handleServerRequests() {
  if (WiFi.status() != WL_CONNECTED) return;
  
  HTTPClient http;
  
  // Check /api/status
  http.begin(String(serverUrl) + "/status.php");
  int httpCode = http.GET();
  
  if (httpCode == 200) {
    String response = http.getString();
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, response);
    
    if (!error) {
      // Handle commands from server
      // The web app can send commands via the database or direct API
    }
  }
  http.end();
  
  // Small delay to prevent flooding
  delay(50);
}

// ============== WEB SERVER HANDLERS ==============
// Add these endpoints to handle direct commands from ESP32

void processCommand(String command, String payload) {
  if (command == "turn") {
    turnEggs();
  } else if (command == "fan_on") {
    setFan(true);
  } else if (command == "fan_off") {
    setFan(false);
  } else if (command.startsWith("schedule:")) {
    // Parse schedule settings
    int tpd = command.substring(9).toInt();
    if (tpd > 0) turnsPerDay = tpd;
  }
}

// ============== ALERT FUNCTIONS ==============
void checkAlerts() {
  // Temperature alerts
  if (temperature < tempMin) {
    Serial.println("ALERT: Temperature too LOW!");
  } else if (temperature > tempMax) {
    Serial.println("ALERT: Temperature too HIGH!");
  }
  
  // Humidity alerts
  if (humidity < humMin) {
    Serial.println("ALERT: Humidity too LOW!");
  } else if (humidity > humMax) {
    Serial.println("ALERT: Humidity too HIGH!");
  }
}
