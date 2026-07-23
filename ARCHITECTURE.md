### Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   #1  PHYSICAL DATA COLLECTION                             │
│                                                                            │
│  ┌──────────┐  433MHz wmbus   ┌──────────┐  USB    ┌──────────────────┐    │
│  │ Wehrle   │ ──────────────┐ │ RTL-SDR  │ ─────►  │  rtl-wmbus       │    │
│  │ Meter 1  │               ├►│ DVB-T    │         │  + wmbusmeters   │    │
│  │ (cold)   │               │ │ (RTL2832)│         │                  │    │
│  └──────────┘               │ └──────────┘         │  decrypts tele-  │    │
│  ┌──────────┐               │                      │  grams into JSON │    │
│  │ Wehrle   │  433MHz wmbus │                      │  logs like:      │    │
│  │ Meter 2  │ ──────────────┘                      │  {"id":"123..",  │    │
│  │ (warm)   │                                      │   "total_m3":779}│    │
│  └──────────┘                                      └────────┬─────────┘    │
│                                                             │              │
│                                                             ▼              │
│                                                   ┌──────────────────┐     │
│                                                   │     MQTT Topic   │     │
│                                                   │  (homeassistant/ │     │
│                                                   │   water/...)     │     │
│                                                   └────────┬─────────┘     │
└────────────────────────────────────────────────────────────┼───────────────┘
                                                             │
                                                             ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                 #2   HOME ASSISTANT (automation host)                      │
│                                                                            │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐  │
│  │ sensor.meter_1   │    │ sensor.meter_2   │    │ input_boolean.       │  │
│  │ (from MQTT)      │    │ (from MQTT)      │    │ water_readings_      │  │
│  │ value: 779       │    │ value: 138       │    │ submitted (off/on)   │  │
│  └────────┬─────────┘    └────────┬─────────┘    └──────────────────────┘  │
│           │                       │                                        │
│           ▼                       ▼                                        │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Automation: "Submit Water Meter Readings"                           │  │
│  │  Trigger: daily 09:00, 1st-7th, weekdays, not yet submitted          │  │
│  │                                                                      │  │
│  │  1. Read sensor values (int)                                         │  │
│  │  2. If sensor unavailable → send SKIPPED notification                │  │
│  │  3. Else → shell_command.submit_water_readings(meter1, meter2)       │  │
│  │  4. If result.success → send success notification, turn flag ON      │  │
│  │  5. Else → send failure notification with error excerpt              │  │
│  └──────────────────────────────────────┬───────────────────────────────┘  │
│                                         │                                  │
│  Automation: "Reset Flag" (day=1 @00:01)│                                  │
│  └──────────────────────────────────────┘                                  │
│                                         │                                  │
│              SSH (passwordless key)     │                                  │
└─────────────────────────────────────────┼──────────────────────────────────┘
                                          │
                                          ▼
┌────────────────────────────────────────────────────────────────────────────┐
│               #3    LINUX BOX (Can be the same as #1)                      │
│                                                                            │
│  ┌──────────────────────────────────────────┐                              │
│  │  /opt/sofiyskavoda/ha-submit.sh          │                              │
│  │  1. Set PLAYWRIGHT_BROWSER + PATH        │                              │
│  │  2. Run submit-readings.js <v1> <v2>     │                              │
│  │  3. Parse exit code                      │                              │
│  │  4. Output JSON:                         │                              │
│  │     {status:"success", meter1, meter2}   │                              │
│  │     {status:"failure", exit_code, log}   │                              │
│  └─────────────────────┬────────────────────┘                              │
│                        │                                                   │
│                        ▼                                                   │
│  ┌──────────────────────────────────────────┐                              │
│  │  submit-readings.js (Playwright)         │                              │
│  │                                          │                              │
│  │  1. Date guard: 1st-7th, weekday?        │                              │
│  │  2. Launch Chromium (bundled or system)  │                              │
│  │  3. Navigate to sofiyskavoda.bg/login    │                              │
│  │  4. Extract CSRF token                   │                              │
│  │  5. Fill honeypot/hidden fields          │                              │
│  │  6. Submit login form                    │                              │
│  │  7. Navigate to /cp/customer-accounts/   │                              │
│  │     {ACCOUNT_ID}/user-readings/create    │                              │
│  │  8. Fill METER1_ID with reading1         │                              │
│  │  9. Fill METER2_ID with reading2         │                              │
│  │  10. Scrape table to verify values       │                              │
│  │  11. Submit form                         │                              │
│  │  12. Check for "Вече имате подаден..."   │                              │
│  │      → exit 0 (idempotent)               │                              │
│  │  13. Confirm success → exit 0            │                              │
│  │  14. On any failure → exit 1             │                              │
│  └─────────────────────┬────────────────────┘                              │
│                        │                                                   │
│  ┌─────────────────────▼────────────────────┐                              │
│  │  /var/log/sofiyskavoda.log               │                              │
│  │  [Mon 06 Jul ...] Starting: meter1=...   │                              │
│  │  [Mon 06 Jul ...] RESULT: Submission...  │                              │
│  └──────────────────────────────────────────┘                              │
└─────────────────────────┼──────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                    SOFIYSKA VODA (production website)                      │
│                                                                            │
│  https://www.sofiyskavoda.bg                                               │
│    ├── /login                    (CSRF + honeypot auth)                    │
│    └── /cp/customer-accounts/    (meter reading submission form)           │
│         {ACCOUNT_ID}/                                                      │
│         user-readings/create                                               │
│                                                                            │
│  Form fields: METER1_ID=<reading1>                                         │
│               METER2_ID=<reading2>                                         │
│                                                                            │
│  Possible outcomes:                                                        │
│    ● Success → readings table updated                                      │
│    ● "Already submitted" → idempotent, treated as success                  │
│    ● Blocked outside 1st-7th → Playwright date guard catches first         │
└────────────────────────────────────────────────────────────────────────────┘

```
