import requests
import json
from datetime import datetime

URL = "https://script.google.com/macros/s/AKfycbwkczy9TswS6OOXiPZr2K13_uPGCU8OTz32oWC5knGHsb2tEykcGYjCYAmENbxQqtu0/exec"

data = {
    "Kabir": ["89", "241", "55", "169", "101"],
    "Surya": ["237", "131", "15", "234", "100"],
    "Laxman Ram": ["90", "33"],
    "Anish": ["120", "167"]
}

records = []
timestamp = datetime.now().strftime("%m/%d/%Y, %I:%M:%S %p")

for staff, cycles in data.items():
    for cycle in cycles:
        records.append({
            "timestamp": timestamp,
            "taskType": "Routine Checkup",
            "cycleId": cycle,
            "batteryId": "",
            "condition": "good",
            "issue": "",
            "partsChecked": "",
            "staffName": staff,
            "stationName": "N/A"
        })

print(f"Sending {len(records)} records to Google Sheets...")

payload = {"data": json.dumps(records)}
response = requests.post(URL, data=payload)

print("Status Code:", response.status_code)
print("Response:", response.text)
