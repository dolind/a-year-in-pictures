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


/// Global Variables
Inkplate display(INKPLATE_1BIT); // Create an object on Inkplate library and also set library into 1 Bit mode (BW)
SdFile file;                     // Create SdFile object used for accessing files on SD card
RTC_DATA_ATTR int dayNumber = 2;


void setup()
{
    bool ENABLE_DEEP_SLEEP {false};
    
    const std::chrono::seconds oneDay {60*60*24};
    const std::chrono::seconds TIME_TO_SLEEP {2};
  
    if ((dayNumber == 1) || (dayNumber == 365)){
      dayNumber = resetToDayOfTheYear();  
    }
    
    Serial.begin(115200);

    display.begin();        // Init Inkplate library (you should call this function ONLY ONCE)
    display.clearDisplay(); // Clear frame buffer of display
    display.display();      // Put clear image on display

    // Init SD card. Display if SD card is init propery or not.
    if (!initSDCard())
    {
      return;
    }
    
    constexpr int MAX_IMAGES {54};
    while(dayNumber < MAX_IMAGES){
      displayDailyImage(dayNumber);
      dayNumber++;
      waitForNextImage(TIME_TO_SLEEP, ENABLE_DEEP_SLEEP);
    }
}

int resetToDayOfTheYear(){
  return 1;
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
        display.display();
    }
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
