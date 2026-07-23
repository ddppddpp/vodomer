# Automating Water Meter Report Submission
## with HomeAssitant, wmbusmeters, rtl-sdr and playwright


### Problem:
1. Our household is usually empty during working hours so there's nobody to answer the door when the Utility Person comes over to read our water meters.
2. No meter reading == High Charges
3. My utility company doesn't charge me for in-person meter reading, but would like to charge me for remote reading services.
4. Theres's also a web form for submitting your readings but who submits forms manually in the 21st centry anyway?

### Solution:
- [ ] Invest in 'smart' radio watermeters
- [ ] Get a USB TV Tuner
- [ ] Setup a linux host (i.e. RPi) with wmbusmeters, rtl-sdr.
- [ ] Discover your meters' serials and start recording readings
- [ ] Create an acount on sofiyskavoda.bg and get your accountID and meters' IDs and submit a manual report


###'Smart' Radio Watermeters
My utility company is using meters OEMed by the Swiss manucaturer [Wehle](https://www.wehrle.de/wp-content/uploads/2020/05/Data-Sheet-Supercom-581-EN.pdf). A search on the web showed that they are 433.82 MHz 
radio meters that transmit readings that are being picked by hubs. Couple of meters per household, a hub per a building block and that's it.
###USB TV Tuner
Next task was how to actyally read the data. Turns out that DVB-T TV Tuners based on the RTL2832U chipset can be used with community-developed [software](https://www.rtl-sdr.com/about-rtl-sdr/) to turn a computer in a wide-spectrum radio scanner that can read your (and your neighbour's) water meters. You can get one from virtually everywhere, my came from Aliexpress.
###Get and Records the radings
There's an great [tutorial](https://github.com/zibous/ha-watermeter/blob/master/docs/wmbusmeters-with-rtl-sdr.md) on setting up a Raspberry Pi with a DVB-T USB stick and isntalling a couple of packages (rtl-sdr, rtl-wmbus and wmbusmeters).
I live in an appartment building of 11 flats and I can mostly 'listen' to my all neighbours' radio meters with no issues, which makes it difficult to filter out the noise. To do so you need to know your watermenter_id (which is different from the serial number). You can mostly guess if you compare the logs with the physical reading (the likelihood of two households having the same meter reading is really low) or just talk the team that does the radio installation into giving the id's to you.

Basically, captured radio telegrams in the wireless m-bus (wmbus) protocol that look like
```
1844AE4C4455223368077A55000000_041389E20100023B0000
```
are captured and decrypted into human-readable messages. 
The result is one log file per water meter that logs messages looking like
```
{"media":"cold water","meter":"mkradio4","name":"coldwater","id":"123456","total_m3":779.6,"target_m3":766,"timestamp":"2026-07-09T16:10:46Z","device":"rtlwmbus[00000001]","rssi_dbm":131}
{"media":"warm water","meter":"mkradio4","name":"warmwaternew","id":"456789","total_m3":138.7,"target_m3":131,"timestamp":"2026-07-23T14:43:27Z","device":"rtlwmbus[00000001]","rssi_dbm":131}
```
which are then published to an mqtt topic. This allowed me to start collecting the data in my HomeAssitant instance and see some nice graphs. Cool! Now back to [submitting](README.md) my readings.

### References:
Peter Siebler's excellent [guide](https://github.com/zibous/ha-watermeter/blob/master/docs/wmbusmeters-with-rtl-sdr.md) on setting up wmbusmeters on a RPi



