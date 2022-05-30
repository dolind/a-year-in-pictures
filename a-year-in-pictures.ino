/*
   A year in pictures picture frame. Based on Inkplate examples
    
   This program will display every day a new picture
   
   Want to learn more about Inkplate? Visit www.inkplate.io
   Looking to get support? Write on our forums: http://forum.e-radionica.com/en/
   11 February 2021 by e-radionica.com
*/

// Next 3 lines are a precaution, you can ignore those, and the example would also work without them
#ifndef ARDUINO_INKPLATE10
#error "Wrong board selection for this example, please select Inkplate 10 in the boards menu."
#endif

//Include Inkplate library to the sketch
#include "Inkplate.h"            
//Include library for SD card
#include "SdFat.h"              
//ESP32 library used for deep sleep and RTC wake up pins
#include "driver/rtc_io.h" 

#include <chrono>

constexpr std::chrono::seconds oneDay {60*60*24};
constexpr std::chrono::seconds fourHours {60*60*4};


/// Global Variables
Inkplate display(INKPLATE_1BIT); // Create an object on Inkplate library and also set library into 1 Bit mode (BW)

/// Data
RTC_DATA_ATTR int dayNumber = 0;
RTC_DATA_ATTR int smallSleepCycles = 4;

/// Parameters
constexpr float VOLTAGE_MIN = 3.6;
constexpr int MAX_IMAGES {734};

/// Use to turn deep sleep on
constexpr bool ENABLE_DEEP_SLEEP {true};

/// Sleep parameters
/// Use to define multiples of time to sleep. Must be used as max sleep time is 4h
constexpr int REPEAT_SLEEP_CYCLE {3};
constexpr std::chrono::seconds TIME_TO_SLEEP {fourHours};


void setup()
{

    display.begin();        // Init Inkplate library (you should call this function ONLY ONCE), necessary for RTC_DATA

    // Init SD card. Display if SD card is init propery or not.
    if (!initSDCard())
    {
      return;
    }
    
    
    // Calling the function for the first time and init display
    if (dayNumber == 0)
    {
  
      display.clearDisplay(); // Clear frame buffer of display
      display.display();      // Put clear image on display
      dayNumber = recoverLastImageFromSD();
    }

    // Reseting to valid image
    if ((dayNumber == MAX_IMAGES)){
      dayNumber = 1;  
    }


    
    // This is the main loop either runs here in loop or will exit for deep sleep
    while(dayNumber < MAX_IMAGES){
  
      // Workaround as we can only sleep for 4 hours
      if (smallSleepCycles < REPEAT_SLEEP_CYCLE)
      {
        smallSleepCycles++;
        waitForNextImage(TIME_TO_SLEEP, ENABLE_DEEP_SLEEP);
      }
      else{
        smallSleepCycles = 0;
      }

      displayDailyImage(dayNumber);

      dayNumber++;
      waitForNextImage(TIME_TO_SLEEP, ENABLE_DEEP_SLEEP);
    }
}

/// Read last image after a hard reset
int recoverLastImageFromSD(){
  char val[6];
  float v;
  int i=0;

  SdFile file;
  file.open("/last.txt");
  
  while(val[i-1]!='\n'){
      val[i]=file.read();
      i++;
  }
  file.close();

  return atoi(val);
}


/// Store in the log file
void writeToLogfile(const String& input){
                    
  SdFile file;
  if (file.open("/log.txt",O_CREAT | O_RDWR | O_APPEND)){
    file.println(input);
  }
  file.close();
  
}

/// Store the last known image
void writeToLast(int input){
                    
  SdFile file;
  if (file.open("/last.txt",O_CREAT | O_RDWR)){
    file.println(input);
  }
  file.close();
  
}
void displayDailyImage(int dayNumber){

    const String imagePrefix {"a-year-in-pictures-"};
    const String imageExt {".png"};
    auto imageName {imagePrefix + dayNumber + imageExt};


    // If card is properly init, try to load image and display it on e-paper at position X=0, Y=0
    // NOTE: Both drawImage methods allow for an optional fifth "invert" parameter. Setting this parameter
    // to true will flip all colors on the image, making black white and white black. This may be necessary when
    // exporting bitmaps from certain softwares.
    //        // If is something failed (wrong filename or wrong format), write error message on the screen.
    // You can turn off dithering for somewhat faster image load by changing the fifth parameter to false, or
    // removing the parameter completely
    display.clearDisplay(); // Clear frame buffer of display
    if (!display.drawImage(imageName, 0, 0, false,false))
    {
        // If is something failed (wrong filename or wrong bitmap format), write error message on the screen.
        // REMEMBER! You can only use Windows Bitmap file with color depth of 1, 4, 8 or 24 bits with no
        // compression! You can turn of dithering for somewhat faster image load by changing the last 1 to 0, or
        // removing the 1 argument completely
        display.println("Image open error");
    }
    
    const float voltage = display.readBattery();
    if (voltage < VOLTAGE_MIN)
    {
        display.setTextSize(10);
        display.setCursor(10, 10);
        display.print("Recharge Battery!");
        String outputStr =  String(voltage) + String(',') + String(dayNumber);
        writeToLogfile(outputStr);
        
    }
    writeToLast(dayNumber);
    display.display();
  
}

bool initSDCard(){
  // Init SD card. Display if SD card is init propery or not.
  if (display.sdCardInit())
    {
       return true;
    }
    else
    {
        // If SD card init not success, display error on screen and stop the program (using infinite loop)
        display.println("SD Card error!");
        display.partialUpdate();
        return false;
    }
}

void waitForNextImage(const std::chrono::seconds& waitTime , bool enableDeepSleep ){

  if (enableDeepSleep) {
      // disable eink power consumption
      display.einkOff();

      WiFi.disconnect(true);
      WiFi.mode(WIFI_STA);
      
      // Isolate/disable GPIO12 on ESP32 (only to reduce power consumption in sleep)
      rtc_gpio_isolate(GPIO_NUM_12);

      esp_sleep_enable_timer_wakeup(std::chrono::microseconds(waitTime).count()); 

      // Put ESP32 into deep sleep. Program stops here.
      esp_deep_sleep_start();
  }
  else{
    delay(std::chrono::milliseconds(waitTime).count());
    
    }
}

void loop()
{
    // Nothing...
}
