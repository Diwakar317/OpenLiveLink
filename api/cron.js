import CryptoJS from 'crypto-js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const JCB_TOKEN_ID = process.env.JCB_TOKEN_ID;
const SERIAL_NUMBER = process.env.JCB_SERIAL_NUMBER || "HAR3DXS5K03564175";
const TENANCY_ID = process.env.JCB_TENANCY_ID || "2742799";
const CRON_SECRET = process.env.CRON_SECRET;
const AES_SECRET = process.env.JCB_AES_SECRET;

if (!AES_SECRET) {
  console.warn("WARNING: JCB_AES_SECRET is missing from environment variables!");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function fetchLocationData(tokenId, dateString) {
  if (!tokenId) throw new Error("JCB_TOKEN_ID is missing from environment variables");
  
  const rawPayload = {
    serialNumber: SERIAL_NUMBER,
    loginTenancyId: TENANCY_ID,
    period: dateString
  };

  const encryptedPayload = CryptoJS.AES.encrypt(JSON.stringify(rawPayload), AES_SECRET).toString();

  const response = await fetch("https://customerui.jcblivelink.in/WISE/AssetEventLogRESTService/getAssetEventDetails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "TokenId": tokenId,
      "Origin": "https://customerui.jcblivelink.in",
      "Referer": `https://customerui.jcblivelink.in/fleetdetail/${SERIAL_NUMBER}`
    },
    body: JSON.stringify(encryptedPayload)
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

async function saveToSupabase(data, dateString) {
  if (!data || data.length === 0) return 0;
  
  const formattedData = data.map(event => ({
    machine_id: SERIAL_NUMBER,
    timestamp: new Date(event.transactionTime + " UTC").toISOString(),
    latitude: parseFloat(event.latitude),
    longitude: parseFloat(event.longitude),
    status: event.parameterName,
    raw_event_data: event
  }));

  const { error } = await supabase
    .from('machine_locations')
    .upsert(formattedData, { onConflict: 'machine_id,timestamp,status' });

  if (error) throw new Error(error.message);
  
  if (dateString) {
    await supabase.from('active_dates').upsert({ active_date: dateString }, { onConflict: 'active_date' });
  }
  
  return formattedData.length;
}

export default async function handler(req, res) {
  try {
    // 1. Validate Secret to prevent unauthorized abuse
    const authHeader = req.headers.authorization || '';
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
      return res.status(401).json({ error: "Unauthorized. Invalid CRON_SECRET." });
    }

    // 2. Fetch Data for Today
    const dateString = new Date().toISOString().split('T')[0];
    const data = await fetchLocationData(JCB_TOKEN_ID, dateString);
    
    // 3. Save Data to Supabase
    const recordsSaved = await saveToSupabase(data, dateString);

    return res.status(200).json({ 
      success: true, 
      date: dateString, 
      recordsSaved 
    });
  } catch (error) {
    console.error("Vercel Cron Error:", error.message);
    return res.status(500).json({ error: error.message });
  }
}
