import CryptoJS from 'crypto-js';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env file
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const JCB_TOKEN_ID = process.env.JCB_TOKEN_ID;
const SERIAL_NUMBER = process.env.JCB_SERIAL_NUMBER || "HAR3DXS5K03564175";
const TENANCY_ID = process.env.JCB_TENANCY_ID || "2742799";

// The secret key we reverse-engineered!
const AES_SECRET = process.env.JCB_AES_SECRET;

if (!AES_SECRET) {
  console.warn("WARNING: JCB_AES_SECRET is missing from environment variables!");
}

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchLocationData(tokenId, dateString) {
  if (!tokenId) {
    throw new Error("JCB_TOKEN_ID is missing from your .env file!");
  }
  console.log(`Fetching data for ${SERIAL_NUMBER} on ${dateString}...`);
  
  // 1. Construct the raw payload
  const rawPayload = {
    serialNumber: SERIAL_NUMBER,
    loginTenancyId: TENANCY_ID,
    period: dateString // Format: "YYYY-MM-DD"
  };

  // 2. Encrypt the payload using CryptoJS AES
  const encryptedPayload = CryptoJS.AES.encrypt(JSON.stringify(rawPayload), AES_SECRET).toString();

  // 3. Make the API request
  const response = await fetch("https://customerui.jcblivelink.in/WISE/AssetEventLogRESTService/getAssetEventDetails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "TokenId": tokenId,
      "Origin": "https://customerui.jcblivelink.in",
      "Referer": `https://customerui.jcblivelink.in/fleetdetail/${SERIAL_NUMBER}`
    },
    body: JSON.stringify(encryptedPayload) // Wait, is it JSON.stringify or raw string?
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  const responseData = await response.json(); 
  
  console.log("Successfully fetched data!");
  console.log("RAW RESPONSE DATA:");
  console.log(responseData);
  
  // Wait, if it's encrypted, it might just be a string like "U2FsdGVkX1..."
  // If so, we need to decrypt it. We'll check the output first!
  
  return responseData;
}

async function saveToSupabase(data, dateString) {
  if (!data || data.length === 0) {
    console.log("No data found to save.");
    return;
  }
  console.log(`Preparing to save ${data.length} records to Supabase...`);
  
  // Format the data to match our Supabase schema
  const formattedData = data.map(event => ({
    machine_id: SERIAL_NUMBER,
    timestamp: new Date(event.transactionTime + " UTC").toISOString(), // Adjust timezone if necessary, JCB usually returns UTC or local
    latitude: parseFloat(event.latitude),
    longitude: parseFloat(event.longitude),
    status: event.parameterName,
    raw_event_data: event
  }));

  // Upsert into Supabase (will update if it exists, insert if it doesn't)
  const { error } = await supabase
    .from('machine_locations')
    .upsert(formattedData, { onConflict: 'machine_id,timestamp,status' });

  if (error) {
    throw new Error(`Supabase Insert Error: ${error.message}`);
  }
  
  // Upsert the active date so the frontend knows this date has data
  if (dateString) {
    const { error: dateError } = await supabase
      .from('active_dates')
      .upsert({ active_date: dateString }, { onConflict: 'active_date' });
    if (dateError) console.error(`Failed to record active date: ${dateError.message}`);
  }
  
  console.log("Successfully saved all records to Supabase!");
}

async function main() {
  try {
    // Check if the user passed a number of days to backfill (e.g., `node scripts/extract.js 7`)
    const args = process.argv.slice(2);
    const daysToFetch = args.length > 0 ? parseInt(args[0], 10) : 1;
    
    if (isNaN(daysToFetch) || daysToFetch < 1) {
      throw new Error("Please provide a valid number of days to backfill.");
    }

    console.log(`Starting extraction for the last ${daysToFetch} day(s)...`);

    for (let i = 0; i < daysToFetch; i++) {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() - i);
      const dateString = targetDate.toISOString().split('T')[0];
      
      try {
        const data = await fetchLocationData(JCB_TOKEN_ID, dateString);
        await saveToSupabase(data, dateString);
      } catch (err) {
        console.error(`Failed to process ${dateString}:`, err.message);
      }
      
      // Be polite to the API, wait 1 second between requests if fetching multiple days
      if (daysToFetch > 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log("All extractions complete!");
  } catch (error) {
    console.error("Extraction script crashed:", error.message);
    if (error.message.includes("401") || error.message.includes("Unauthorized")) {
       console.error("⚠️ Your JCB_TOKEN_ID has likely expired! Please grab a new one from the browser and update your .env file.");
    }
  }
}

main();
