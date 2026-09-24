import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read .env manually
const envPath = path.join(__dirname, '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const apiKeyLine = envContent.split('\n').find(line => line.startsWith('VITE_GEMINI_API_KEY='));
const API_KEY = apiKeyLine ? apiKeyLine.split('=')[1].trim() : '';

console.log('Using Key:', API_KEY.substring(0, 10) + '...');

const genAI = new GoogleGenerativeAI(API_KEY);

async function run() {
  try {
    // The SDK does not expose listModels directly easily, we can just fetch it with standard node fetch
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`);
    const data = await response.json();
    if (data.error) {
      console.error('API Error:', data.error);
    } else {
      console.log('Available models:');
      data.models.forEach(m => console.log(m.name));
    }
  } catch (e) {
    console.error(e);
  }
}

run();
