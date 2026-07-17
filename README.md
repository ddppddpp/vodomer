# Vodomer
## A playwright automation for water meter reading submission

### Why Vodomer?
Vodomer allows you to do a headless submission of your water meter readings to the website of the sole water utility company in Sofia, Bulgaria - [Sofiyska Voda](https://sofiyskavoda.bg), without the need to manually fill-in a web form a click on Submit button like we used to do back in the 20th century.

### Requirements
- the actual meter data. Getting it is beyond the script scope, but you can check out [my approach](BACKGROUND.md).
- a registered [profile](https://www.sofiyskavoda.bg/registration) on Sofiyska Voda's web portal
- A Linux host (technically, should work on any OS)
- Node.js >= 16
- Playwright
- Browser: bundled Chromium (x86_64/arm64)



### Installation
```bash
git clone https://github.com/ddppddpp/vodomer.git && cd vodomer
npm install
npx playwright install chromium --with-deps   # skip on armv7l
cp .env-example .env                          # then edit with real credentials
bash install.sh
```
This sets up a directory in /opt/sofiyskavoda where the execution scripts live.

### Usage
Submit a report by using the wrapper-script
```
/opt/sofiyskavoda/ha-submit.sh <reading1> <reading2>
```
Then see the result in the log file
```
 $ tail -f /var/log/sofiyskavoda.log
 
[Mon 06 Jul 2026 01:48:57 PM EEST] Starting: meter1=123 meter2=456
Navigating to login page...
CSRF token: found
Submitting login...
After login URL: https://www.sofiyskavoda.bg/cp/dashboard
Navigating to meter readings page...
Meter page URL: https://www.sofiyskavoda.bg/cp/customer-accounts/111111/user-readings/create
Filling meter readings...
Filled meter 1234546 with 123
Filled meter 7890123 with 456
Verified values: { v1: '123', v2: '456' }
Fill result: { filled1: true, filled2: true }
Submitting readings...
After submit URL: https://www.sofiyskavoda.bg/cp/customer-accounts/111111/user-readings/create
RESULT: Submission confirmed.
```
Optionally, automate reading submission. You can find an example with Home Assitant [here](AUTOMATION.md).
### Contributions
This automation has been verified to work only for my personal account.
Reach out if you'd like to test and need help setting it up.
Any ideas are more than welcome.
### Credits
JavaScript code vibed with [OpenCode](https://opencode.ai).
