import os
import sys
import time
import subprocess
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from webdriver_manager.chrome import ChromeDriverManager
from webdriver_manager.core.os_manager import ChromeType

def get_today_pdf_path():
    # Generate the PDF first by calling your existing script
    print("Step 1: Generating today's report...")
    subprocess.run([sys.executable, "generate_report.py"], check=True)
    pdf_filename = f"Daily_Operations_Report_{datetime.now().strftime('%Y-%m-%d')}.pdf"
    pdf_path = os.path.abspath(pdf_filename)
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF generation failed, {pdf_path} not found.")
    print(f"✅ PDF generated: {pdf_path}")
    return pdf_path

def send_whatsapp_report(pdf_path, chat_name):
    print("Step 2: Setting up Brave Browser driver...")
    # Use a persistent profile so you only scan the QR code ONCE
    user_data_dir = os.path.expanduser("~/Library/Application Support/BraveSoftware/Brave-Browser/WhatsAppAutomation")
    
    chrome_options = Options()
    # Point Selenium to the Brave Browser executable on macOS
    chrome_options.binary_location = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
    chrome_options.add_argument(f"user-data-dir={user_data_dir}")
    # Note: WhatsApp Web often blocks headless mode, so we run it visibly (or minimized)
    
    # Automatically install/manage ChromeDriver explicitly for Brave
    print("Step 3: Downloading browser automation drivers (this might take a moment)...")
    service = Service(ChromeDriverManager(chrome_type=ChromeType.BRAVE).install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    
    try:
        print("Step 4: Opening WhatsApp Web...")
        driver.get("https://web.whatsapp.com/")
        
        # Wait up to 60 seconds for the user to scan the QR code (only needed on the very first run!)
        print("Waiting for WhatsApp Web to load (Scan QR code if you aren't logged in yet)...")
        search_box = WebDriverWait(driver, 60).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "div[contenteditable='true'][data-tab='3']"))
        )
        print("Logged in successfully!")
        
        # Search for the chat
        print(f"Searching for chat: {chat_name}")
        search_box.clear()
        search_box.send_keys(chat_name)
        time.sleep(2)
        search_box.send_keys(Keys.ENTER)
        time.sleep(2) # Wait for chat to open
        
        # Click the attach (plus) button
        attach_btn = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "div[title='Attach'], span[data-icon='plus']"))
        )
        attach_btn.click()
        
        # Find the hidden input for documents
        doc_input = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "input[accept='*']"))
        )
        # Send the file path to the input
        doc_input.send_keys(pdf_path)
        
        # Wait for preview to load and click send
        send_btn = WebDriverWait(driver, 10).until(
            EC.element_to_be_clickable((By.CSS_SELECTOR, "span[data-icon='send']"))
        )
        send_btn.click()
        
        print("✅ Report sent successfully!")
        time.sleep(5) # Let the upload finish before closing
        
    except Exception as e:
        print(f"❌ Error occurred: {e}")
    finally:
        driver.quit()

if __name__ == "__main__":
    # Ensure it doesn't run on Saturdays
    if datetime.today().weekday() == 5:
        print("Today is Saturday. Skipping automated report.")
        sys.exit(0)
        
    # CHANGE THIS TO THE EXACT NAME OF YOUR GROUP OR CONTACT
    TARGET_CHAT_NAME = "3cc Group" 
    
    try:
        pdf = get_today_pdf_path()
        send_whatsapp_report(pdf, TARGET_CHAT_NAME)
    except Exception as e:
        print(f"Failed: {e}")

