import CryptoJS from 'crypto-js';

const GENERIC_REMARKS = ['upi pay', 'upi', 'sent using payt', 'payment', 'sent using paytm'];

export function parseStatement(data) {
  const transactions = [];
  
  if (!Array.isArray(data) || data.length === 0) return transactions;

  // 1. ALL STATEMENTS DEFAULT TO SHRI VINDVASHINI
  const profileId = 'Shri Vindvashini'; 


  // 2. DYNAMIC LAYOUT DETECTION
  let headerRowIndex = -1;
  let layout = 'UNKNOWN'; 
  
  for (let i = 0; i < Math.min(25, data.length); i++) {
    const row = data[i] || [];
    const rowStr = row.join(' ').toUpperCase();
    
    if (rowStr.includes('WITHDRAWAL AMOUNT') && rowStr.includes('DEPOSIT AMOUNT')) {
       headerRowIndex = i;
       layout = 'LAYOUT_A'; // ICICI (Prasidha)
       break;
    } else if (rowStr.includes('TRANSACTION AMOUNT') && rowStr.includes('CR/DR')) {
       headerRowIndex = i;
       layout = 'LAYOUT_B'; // Cr/Dr Toggle (Shri Vindvashini)
       break;
    } else if (rowStr.includes('NO.|TRANSACTION ID|VALUE DATE')) {
       headerRowIndex = i;
       layout = 'LAYOUT_PSV'; // Legacy PSV handled as 1-column array
       break;
    }
  }

  if (headerRowIndex === -1) {
    console.warn("Could not detect statement layout.");
    return transactions;
  }

  // Helper to safely get string
  const getStr = (val) => (val !== undefined && val !== null) ? String(val).trim() : '';

  // 3. ROW EXTRACTION
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || row.length === 0) continue;
    
    let txnId = '', dateStr = '', desc = '', amountStr = 0, isDebit = false, timeStr = '';

    if (layout === 'LAYOUT_PSV') {
       // Legacy PSV is parsed into a single column by XLSX if it's text
       const line = getStr(row[0]);
       if (!line) continue;
       const cols = line.split('|');
       if (cols.length < 8) continue;
       txnId = cols[1];
       dateStr = cols[2];
       timeStr = cols[3];
       desc = cols[5];
       const type = cols[6].toUpperCase();
       isDebit = type === 'DR';
       amountStr = cols[7];
    } 
    else if (layout === 'LAYOUT_A') {
       // [Empty, S No, Value Date, Txn Date, Cheque, Remarks, Withdrawal, Deposit, Balance]
       // Skip footer legend rows — they have no valid date in col[2]
       const rawDate = getStr(row[2]);
       if (!rawDate || !/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(rawDate)) continue;
       dateStr = rawDate;
       desc = getStr(row[5]);
       if (!desc) continue;

       const withdrawal = parseFloat(getStr(row[6]).replace(/,/g, ''));
       const deposit    = parseFloat(getStr(row[7]).replace(/,/g, ''));

       if (!isNaN(withdrawal) && withdrawal > 0) {
          isDebit = true;
          amountStr = withdrawal;
       } else if (!isNaN(deposit) && deposit > 0) {
          isDebit = false;
          amountStr = deposit;
       } else {
          continue;
       }

       // Extract txnId from ICICI remark: prefer ICI[hex] fingerprint, then numeric UPI/IMPS ref
       const iciMatch = desc.match(/ICI([a-f0-9]{16,})/i);
       const numRef   = desc.match(/\/([0-9]{10,15})(?:\/|$)/);
       if (iciMatch)   txnId = 'ICI' + iciMatch[1].toUpperCase();
       else if (numRef) txnId = numRef[1];
    }
    else if (layout === 'LAYOUT_B') {
       // [No, Txn ID, Value Date, Posted Date, Cheque, Desc, Cr/Dr, Amount, Balance]
       if (!row[2]) continue;
       txnId = getStr(row[1]);
       dateStr = getStr(row[2]);
       timeStr = getStr(row[3]);
       desc = getStr(row[5]);
       const type = getStr(row[6]).toUpperCase();
       isDebit = type === 'DR';
       amountStr = getStr(row[7]);
    }

    if (!desc) continue;

    // Standardize amount
    const amount = typeof amountStr === 'number' ? amountStr : parseFloat(getStr(amountStr).replace(/,/g, ''));
    if (isNaN(amount) || amount === 0) continue;

    // Date formatting (Convert DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD or handle Excel serials)
    let isoDate = dateStr;
    const serial = parseFloat(dateStr);
    if (!isNaN(serial) && serial > 10000 && serial < 99999 && !dateStr.includes('-') && !dateStr.includes('/')) {
       // Convert Excel serial date to YYYY-MM-DD
       const utc_days  = Math.floor(serial - 25569);
       const utc_value = utc_days * 86400;                                        
       const date_info = new Date(utc_value * 1000);
       isoDate = date_info.toISOString().split('T')[0];
    } else {
       const cleanDate = dateStr.replace(/\//g, '-');
       const dateParts = cleanDate.split('-');
       if (dateParts.length === 3) {
          isoDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
       }
    }

    // ─── Heuristics Engine ───────────────────────────────────────────────────
    let method = 'OTHER';
    let recipientName = 'Unknown';
    let identifier = '';
    const descUpper = desc.toUpperCase();
    const descParts = desc.split('/');

    // ── Bank Charges / Fees ──────────────────────────────────────────────────
    if (
      descUpper.includes('CASH DEP') && !descUpper.startsWith('UPI') ||
      descUpper.startsWith('CAM/') && descUpper.includes('CASH DEP')
    ) {
      method = 'CASH'; recipientName = 'CASH DEPOSIT';

    } else if (
      descUpper.includes('CASH WDL') ||
      descUpper.startsWith('CASH PAID:SELF') ||
      (descUpper.startsWith('CAM/') && descUpper.includes('CASH WDL'))
    ) {
      method = 'CASH'; recipientName = 'CASH WITHDRAWAL';

    } else if (
      descUpper.startsWith('MABCHGS') || descUpper.startsWith('MAB CHG') ||
      descUpper.startsWith('DCARDFE') || descUpper.startsWith('DCARD FEE') ||
      descUpper.startsWith('SURCHARGE') ||
      descUpper.startsWith('CASHTXNCHGS') || descUpper.startsWith('CASH TXN') ||
      descUpper.startsWith('CASHDEP CHGS') ||
      descUpper.startsWith('MOB ALRT CHG') ||
      descUpper.includes('IMPS CHG') || descUpper.includes('CHQ BOOK CHG') ||
      descUpper.includes('BULK TRN CHG') ||
      descUpper.includes('ATM CARD MAINT') ||
      descUpper.includes('ATM CARD MAINT CHARGE') ||
      (descUpper.includes('+GST') && !descUpper.startsWith('UPI'))
    ) {
      method = 'FEE'; recipientName = 'BANK CHARGES';

    // ── ICICI: TRFR FROM (internal transfer) ─────────────────────────────────
    } else if (descUpper.startsWith('TRFR FROM') || descUpper.startsWith('TFRR FROM')) {
      method = 'TRANSFER';
      recipientName = desc.replace(/^TFR?R FROM\s*:?\s*/i, '').trim() || 'Internal Transfer';

    // ── ICICI / BOI: UPI ─────────────────────────────────────────────────────
    } else if (descUpper.startsWith('UPI/')) {
      method = 'UPI';
      // ICICI UPI format: UPI/{display_name}/{vpa}/{remark}/{bank}/{upi_ref}/{ICI_hash}
      recipientName = (descParts[1] || 'Unknown').trim();
      identifier    = (descParts[2] || '').trim(); // VPA
      // If display name is generic, fall back to VPA username
      if (GENERIC_REMARKS.includes(recipientName.toLowerCase()) && identifier.includes('@')) {
        recipientName = identifier.split('@')[0];
      }

    // ── ICICI: MMT/IMPS (outgoing IMPS) ──────────────────────────────────────
    } else if (descUpper.startsWith('MMT/IMPS/')) {
      method = 'IMPS';
      // MMT/IMPS/{ref}/{remark}/{recipient}/{bank}
      recipientName = (descParts[4] || descParts[3] || 'Unknown').trim();
      identifier    = descParts[2] || ''; // txn ref
      if (!txnId) txnId = identifier;     // use ref as txnId if not already set

    // ── NEFT: INF/NEFT slash format ───────────────────────────────────────────
    } else if (descUpper.startsWith('INF/NEFT/')) {
      method = 'NEFT';
      recipientName = (descParts[4] || descParts[3] || 'Unknown').trim();
      identifier    = descParts[3] || '';

    // ── ICICI: INF/INFT (internal transfer) ──────────────────────────────────
    } else if (descUpper.startsWith('INF/INFT/')) {
      method = 'TRANSFER';
      recipientName = (descParts[3] || 'Unknown').trim();
      identifier    = descParts[2] || '';

    // ── ICICI: CLG (Cheque Clearing) ─────────────────────────────────────────
    } else if (descUpper.startsWith('CLG/')) {
      method = 'CHEQUE';
      recipientName = (descParts[1] || 'Unknown').trim();

    // ── NEFT: ICICI dash format ───────────────────────────────────────────────
    } else if (descUpper.startsWith('NEFT-')) {
      method = 'NEFT';
      // NEFT-{ref}-{sender_name}-ATTN...
      const parts   = desc.split('-');
      identifier    = parts[1] || '';
      recipientName = (parts[2] || 'Unknown').trim();
      if (!txnId) txnId = identifier;

    // ── RTGS dash format ──────────────────────────────────────────────────────
    } else if (descUpper.startsWith('RTGS-')) {
      method = 'RTGS';
      const parts   = desc.split('-');
      recipientName = (parts[2] || 'Unknown').trim();
      identifier    = parts[3] || '';

    // ── ICICI: CMS (loan EMI auto-debit) ─────────────────────────────────────
    } else if (descUpper.startsWith('CMS/')) {
      method = 'EMI';
      recipientName = (descParts[2] || 'Unknown').trim();
      identifier    = descParts[1] || '';

    // ── ICICI: ACH (NACH mandate debit) ──────────────────────────────────────
    } else if (descUpper.startsWith('ACH/')) {
      method = 'NACH';
      recipientName = (descParts[1] || 'Unknown').trim();
      identifier    = descParts[2] || '';

    // ── ICICI: AD~ (loan auto-debit notice) ───────────────────────────────────
    } else if (descUpper.startsWith('AD~')) {
      method = 'NACH';
      recipientName = 'LOAN AUTO DEBIT';

    // ── ICICI: BIL/INFT (bill payment / NACH) ────────────────────────────────
    } else if (descUpper.startsWith('BIL/INFT/')) {
      method = 'INFT';
      recipientName = (descParts[3] || descParts[2] || 'Unknown').trim();
      identifier    = descParts[2] || '';

    // ── ICICI: BIL/ONL (online bill / utility payment) ───────────────────────
    } else if (descUpper.startsWith('BIL/ONL/') || descUpper.startsWith('BIL/')) {
      method = 'BILL';
      recipientName = (descParts[3] || descParts[2] || 'BILL PAYMENT').trim();
      identifier    = descParts[2] || '';

    // ── ICICI: GIB (GST / government tax payment) ────────────────────────────
    } else if (descUpper.startsWith('GIB/')) {
      method = 'TAX';
      recipientName = 'GST PAYMENT';
      identifier    = descParts[1] || '';

    // ── ICICI: VIN / VPS / IPS (merchant POS / vendor payments) ──────────────
    } else if (
      descUpper.startsWith('VIN/') ||
      descUpper.startsWith('VPS/') ||
      descUpper.startsWith('IPS/')
    ) {
      method = 'MERCHANT';
      recipientName = (descParts[1] || 'Unknown').trim();
      identifier    = descParts[3] || '';

    // ── Fallback ──────────────────────────────────────────────────────────────
    } else {
      recipientName = desc.trim();
    }

    recipientName = recipientName.trim().replace(/ +/g, ' ');

    const timeMatch = timeStr.match(/\d{2}:\d{2}:\d{2}(?:\s?[aApP][mM])?/);
    const time = timeMatch ? timeMatch[0] : '00:00:00';

    let sourceHash;
    if (layout === 'LAYOUT_B' || layout === 'LAYOUT_PSV') {
       sourceHash = CryptoJS.SHA256(`${txnId}_${isoDate}`).toString();
    } else {
       sourceHash = CryptoJS.SHA256(`${profileId}_${isoDate}_${amount}_${desc}`).toString();
    }

    if (!txnId) {
       txnId = 'AUTO_' + sourceHash.substring(0, 16);
    }

    transactions.push({
      transaction_id: txnId,
      profile_id: profileId,
      date: isoDate,
      time: time,
      amount: isDebit ? -amount : amount,
      recipient_name: recipientName,
      upi_id: method === 'UPI' ? identifier.trim() : null,
      account_number: (method !== 'UPI' && method !== 'CASH') ? identifier.trim() : null,
      remarks: desc,
      source_hash: sourceHash
    });
  }
  
  return transactions;
}

export function groupTransactions(payments, aliases = {}) {
  const grouped = {};
  
  payments.forEach(txn => {
    if (txn.transaction_id === 'SYS_ALIASES') return;

    // LAYER 1: IDENTIFIER-BASED GROUPING
    let originalKey;
    const upiId = txn.upi_id ? txn.upi_id.toLowerCase().trim() : null;
    const accNo = txn.account_number ? txn.account_number.toLowerCase().trim() : null;
    
    if (upiId) {
      originalKey = `UPI:${upiId}`;
    } else if (accNo && accNo !== '') {
      originalKey = `ACC:${accNo}`;
    } else {
      // LAYER 2: FUZZY NAME MATCHING
      originalKey = (txn.recipient_name || 'Unknown').toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    
    // LAYER 3: SMART ALIASING (MERGING)
    let key = aliases[originalKey] ? `MERGED:${aliases[originalKey].toUpperCase()}` : originalKey;
    
    if (!grouped[key]) {
      grouped[key] = {
        key: key,
        customName: aliases[originalKey] || null,
        names: new Set(),
        totalPaid: 0,
        totalReceived: 0,
        transactions: [],
        identifiers: new Set(),
        originalKeys: new Set()
      };
    }
    
    grouped[key].names.add(txn.recipient_name);
    grouped[key].originalKeys.add(originalKey);
    
    const amount = Number(txn.amount);
    if (amount < 0) {
      grouped[key].totalPaid += Math.abs(amount);
    } else {
      grouped[key].totalReceived += amount;
    }
    
    grouped[key].transactions.push(txn);
    if (txn.upi_id) grouped[key].identifiers.add(`UPI: ${txn.upi_id}`);
    if (txn.account_number) grouped[key].identifiers.add(`A/C: ${txn.account_number}`);
  });
  
  const result = Object.values(grouped).map(group => {
    group.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    group.lastTransactionDate = group.transactions[0]?.date;
    
    if (group.customName) {
       group.name = group.customName;
    } else {
       // Choose the best name for the group (most frequent, ignoring generic ones)
       const nameCounts = {};
       let bestName = 'Unknown';
       let maxCount = 0;
       
       group.transactions.forEach(t => {
          const n = t.recipient_name;
          if (!GENERIC_REMARKS.includes(n.toLowerCase())) {
             nameCounts[n] = (nameCounts[n] || 0) + 1;
             if (nameCounts[n] > maxCount) {
                maxCount = nameCounts[n];
                bestName = n;
             }
          }
       });
       
       // If all names were generic, fallback to the latest transaction's name
       if (maxCount === 0 && group.transactions.length > 0) {
          bestName = group.transactions[0].recipient_name;
       }
       
       group.name = bestName;
    }

    group.identifiers = Array.from(group.identifiers);
    group.originalKeys = Array.from(group.originalKeys);
    return group;
  });
  
  result.sort((a, b) => (b.totalPaid + b.totalReceived) - (a.totalPaid + a.totalReceived));
  
  return result;
}
