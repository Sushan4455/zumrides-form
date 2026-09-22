import requests
from xhtml2pdf import pisa
from datetime import datetime
import sys

# The URL to your Main Google Apps Script
APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwkczy9TswS6OOXiPZr2K13_uPGCU8OTz32oWC5knGHsb2tEykcGYjCYAmENbxQqtu0/exec"
SECRET_PASSWORD = "Admin123"

def fetch_live_data():
    print("Fetching live data from Google Sheets...")
    try:
        # Hit the secret endpoint
        response = requests.get(f"{APPS_SCRIPT_URL}?secret={SECRET_PASSWORD}")
        response.raise_for_status()
        return response.json()
    except Exception as e:
        print(f"Error fetching data: {e}")
        sys.exit(1)

def generate_pdf_report(data):
    today_str = datetime.now().strftime("%d %B %Y")
    
    # Process Routine Data
    routine_rows = ""
    staff_summaries = ""
    routine_dict = data.get("routine", {})
    
    if not routine_dict:
        routine_rows = '<tr><td colspan="3">No routine checkups recorded today.</td></tr>'
    else:
        for staff, cycles in routine_dict.items():
            if cycles:
                unique_cycles = list(set(cycles))
                cycle_str = ", ".join(map(str, unique_cycles))
                count = len(unique_cycles)
                routine_rows += f"""
                <tr>
                    <td class="bold">{staff}</td>
                    <td>{cycle_str}</td>
                    <td>{count}</td>
                </tr>
                """
                staff_summaries += f"<li><span class=\"bold\">{staff}:</span> Executed routine checkups for {count} cycles ({cycle_str}).</li>"

    # Process Station Data
    station = data.get("station", {})
    station_staff = station.get("staff", "None")
    station_cycles = station.get("cycles", [])
    station_text = f"Cycles {', '.join(map(str, station_cycles))} were verified." if station_cycles else "No station visits recorded today."
    
    if station_cycles:
        staff_summaries += f"<li><span class=\"bold\">{station_staff}:</span> Completed field station inspection for {len(station_cycles)} cycles.</li>"

    # Process Overall Data
    overall = data.get("overall", {})
    overall_staff = overall.get("staff", "None")
    overall_cycles = list(set(overall.get("cycles", [])))
    overall_count = len(overall_cycles)
    overall_text = ", ".join(map(str, overall_cycles)) if overall_cycles else "None"
    
    if overall_cycles:
        staff_summaries += f"<li><span class=\"bold\">{overall_staff}:</span> Conducted overall 11-point inspections across {overall_count} cycles.</li>"

    # Process Maintenance Data
    maintenance = data.get("maintenance", [])
    maint_rows = ""
    maint_summaries = []
    
    if not maintenance:
        maint_rows = '<tr><td colspan="2">No mechanical repair work recorded today.</td></tr>'
    else:
        for record in maintenance:
            maint_rows += f"""
            <tr>
                <td class="bold">Cycle {record['cycleId']}</td>
                <td>{record['fix']}</td>
            </tr>
            """
            maint_summaries.append(f"{record['fix']} on cycle {record['cycleId']}")
        staff_summaries += f"<li><span class=\"bold\">Mechanical Maintenance Team:</span> Serviced {len(maintenance)} cycles ({'; '.join(maint_summaries)}).</li>"

    # Build the HTML Template
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            @page {{ size: A4; margin: 2cm; }}
            body {{ font-family: 'Helvetica', 'Arial', sans-serif; color: #1a1a1a; font-size: 12px; line-height: 1.6; }}
            h1 {{ font-size: 20px; margin-bottom: 5px; color: #111827; }}
            .meta {{ font-size: 12px; font-weight: bold; margin-bottom: 30px; color: #4b5563; }}
            h2 {{ font-size: 15px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-top: 25px; margin-bottom: 15px; color: #1f2937; }}
            table {{ width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11px; }}
            th {{ background-color: #f3f4f6; text-align: left; padding: 8px; border-bottom: 1px solid #d1d5db; font-weight: bold; }}
            td {{ padding: 8px; border-bottom: 1px solid #e5e7eb; }}
            ul {{ margin-top: 5px; margin-bottom: 15px; padding-left: 20px; }}
            li {{ margin-bottom: 5px; }}
            .bold {{ font-weight: bold; }}
        </style>
    </head>
    <body>
        <h1>Daily Operations Report</h1>
        <div class="meta">Date: {today_str} | Prepared by: Zum Administrator</div>

        <h2>1. Executive Operations Summary</h2>
        <p>Today's operational tasks focused on routine cycle condition checks, a comprehensive overall cycle inspection, station management, and targeted mechanical repairs.</p>

        <h2>2. Routine Cycle Checkups</h2>
        <p>Routine condition and functionality inspections were assigned across field staff members:</p>
        <table>
            <thead><tr><th>Staff Member</th><th>Assigned Cycle IDs</th><th>Total Units</th></tr></thead>
            <tbody>{routine_rows}</tbody>
        </table>

        <h2>3. Station Visit</h2>
        <ul>
            <li><span class="bold">Assigned Staff:</span> {station_staff}</li>
            <li><span class="bold">Scope of Work:</span> Inspected field station facilities and evaluated operational readiness.</li>
            <li><span class="bold">Inspected Units:</span> {station_text}</li>
        </ul>

        <h2>4. Overall Cycle Checkup</h2>
        <ul><li><span class="bold">Assigned Staff:</span> {overall_staff}</li></ul>
        <p class="bold" style="margin-bottom:0;">Standard Inspection Checklist</p>
        <p style="margin-top:0;">Each unit was evaluated across 11 key structural, mechanical, and electrical parameters.</p>
        
        <p class="bold" style="margin-bottom:0;">Units Inspected</p>
        <p style="margin-top:0;">The following {overall_count} cycle IDs were recorded during today's overall inspection:<br>{overall_text}</p>

        <h2>5. Mechanical Repair Work</h2>
        <table>
            <thead><tr><th style="width:25%;">Cycle ID</th><th style="width:75%;">Maintenance Activity</th></tr></thead>
            <tbody>{maint_rows}</tbody>
        </table>

        <h2>6. Staff Contribution Summary</h2>
        <ul>{staff_summaries}</ul>
    </body>
    </html>
    """
    
    output_filename = f"Daily_Operations_Report_{datetime.now().strftime('%Y-%m-%d')}.pdf"
    
    with open(output_filename, "w+b") as result_file:
        pisa_status = pisa.CreatePDF(html_content, dest=result_file)
        
    if pisa_status.err:
        print("Error generating PDF")
    else:
        print(f"Successfully generated {output_filename}")

if __name__ == "__main__":
    live_data = fetch_live_data()
    print("Data retrieved! Generating PDF...")
    generate_pdf_report(live_data)
