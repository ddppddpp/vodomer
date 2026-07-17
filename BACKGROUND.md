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
- [ ] Clone this repo on your linux host
- [ ] execute the provided install.sh to copy setup playwright generate executable scripts in /opt/sofiyskavoda
- [ ] test by manually executing ```/opt/sofiyskavoda/ha-submit.sh value1 value2```
- [ ] (optional) setup automation via home assistant

###'Smart' Radio Watermeters
My utility company is using meters OEMed by the Swiss manucaturer [Wehle](https://www.wehrle.de/wp-content/uploads/2020/05/Data-Sheet-Supercom-581-EN.pdf). A search on the web showed that they are 433.82 MHz 
radio meters that transmit readings that are being picked by hubs. Couple of meters per household, a hub per a building block and that's it.
###USB TV Tuner
Next task was how to actyally read the data. Turns out that DVB-T TV Tuners based on the RTL2832U chipset can be used with community-developed [software](https://www.rtl-sdr.com/about-rtl-sdr/) to turn a computer in a wide-spectrum radio scanner that can read your (and your neighbour's) water meters. You can get one from virtually everywhere, my came from Aliexpress.
###Get and Records the radings
There's an great [tutorial](https://github.com/zibous/ha-watermeter/blob/master/docs/wmbusmeters-with-rtl-sdr.md) on setting up a Raspberry Pi with a DVB-T USB stick and isntalling a couple of packages (rtl-sdr, rtl-wmbus and wmbusmeters).
Basically, radio telegrams in the wireless m-bus (wmbus) protocol that look like
```
1844AE4C4455223368077A55000000_041389E20100023B0000
```
are captured and decrypted into human-readable messages. 
The result is one log file per water meter that logs messages looking like
```
{"media":"cold water","meter":"mkradio4","name":"coldwater","id":"123456","total_m3":779.6,"target_m3":766,"timestamp":"2026-07-09T16:10:46Z","device":"rtlwmbus[00000001]","rssi_dbm":131}
```
which are then published to an mqtt topic. This allowed me to start collecting the data in my HomeAssitant instance and see some nice graphs. Cool! Now on to submitting my readings.

###Submitting your readings to Sofia Water
This is where my innitial progress slowed down to 

### References:
Peter Siebler's excellent [guide](https://github.com/zibous/ha-watermeter/blob/master/docs/wmbusmeters-with-rtl-sdr.md) on setting up wmbusmeters on a RPi



