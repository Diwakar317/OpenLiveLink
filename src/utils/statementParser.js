import CryptoJS from 'crypto-js';

const GENERIC_REMARKS = ['upi pay', 'upi', 'sent using payt', 'payment', 'sent using paytm'];

export function parseStatement(data) {
  const transactions = [];
  
  if (!Array.isArray(data) || data.length === 0) return transactions;

  // 1. SMART PROFILE DETECTION (Scan top 10 rows)
  let profileId = 'Shri Vindvashini'; // default fallback
  const topRows = data.slice(0, 10);
  const topText = topRows.map(r => (r || []).join(' ')).join(' ').toUpperCase();
  
  if (topText.includes('RITA SINGH')) {
    profileId = 'Rita Singh';
  } else if (topText.includes('SHRI VINDVASHNI')) {
    profileId = 'Shri Vindvashini';
  } else if (topText.includes('PRASIDHA SINGH')) {
    profileId = 'Prasidha Singh';
  }

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
    } else if (rowStr.includes('DEBIT') && rowStr.includes('CREDIT') && rowStr.includes('REMARKS')) {
       headerRowIndex = i;
       layout = 'LAYOUT_C'; // Debit/Credit Columns (Rita)
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
       if (!row[2]) continue; // Skip if no Value Date
       dateStr = getStr(row[2]);
       desc = getStr(row[5]);
       
       const withdrawal = parseFloat(getStr(row[6]).replace(/,/g, ''));
       const deposit = parseFloat(getStr(row[7]).replace(/,/g, ''));
       
       if (!isNaN(withdrawal) && withdrawal > 0) {
          isDebit = true;
          amountStr = withdrawal;
       } else if (!isNaN(deposit) && deposit > 0) {
          isDebit = false;
          amountStr = deposit;
       } else {
          continue;
       }
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
    else if (layout === 'LAYOUT_C') {
       // [Sr No, Date, Remarks, Debit, Credit, Balance Amount]
       if (!row[1]) continue;
       dateStr = getStr(row[1]);
       desc = getStr(row[2]);
       const debit = parseFloat(getStr(row[3]).replace(/,/g, ''));
       const credit = parseFloat(getStr(row[4]).replace(/,/g, ''));
       
       if (!isNaN(debit) && debit > 0) {
          isDebit = true;
          amountStr = debit;
       } else if (!isNaN(credit) && credit > 0) {
          isDebit = false;
          amountStr = credit;
       } else {
          continue;
       }
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

    // Heuristics Engine
    let method = 'OTHER';
    let recipientName = 'Unknown';
    let identifier = '';
    const descUpper = desc.toUpperCase();
    const descParts = desc.split('/');

    if (descUpper.includes('CASH DEP')) {
      method = 'CASH'; recipientName = 'CASH DEPOSIT';
    } else if (descUpper.includes('CASH WDL')) {
      method = 'CASH'; recipientName = 'CASH WITHDRAWAL';
    } else if (
      descUpper.startsWith('MOB ALRT CHG') || descUpper.includes('+GST') ||
      descUpper.includes('IMPS CHG') || descUpper.includes('CHQ BOOK CHG') ||
      descUpper.includes('CASHDEP CHGS') || descUpper.includes('BULK TRN CHG') || descUpper.includes('ATM CARD MAINT')
    ) {
      method = 'FEE'; recipientName = 'BANK CHARGES';
    } else if (descUpper.startsWith('UPI/')) {
      method = 'UPI';
      recipientName = descParts[2] || 'Unknown';
      identifier = descParts[3] || '';
      if (GENERIC_REMARKS.includes(recipientName.toLowerCase().trim()) && identifier.includes('@')) {
         recipientName = identifier.split('@')[0];
      }
    } else if (descUpper.startsWith('MMT/IMPS/')) {
      method = 'IMPS';
      recipientName = descParts[4] || descParts[3] || 'Unknown';
      identifier = descParts[5] || '';
    } else if (descUpper.startsWith('IMPSUAIB/')) {
      method = 'IMPS';
      recipientName = descParts[2] || 'Unknown';
      identifier = descParts[1] || '';
    } else if (descUpper.startsWith('BIL/INFT/')) {
      method = 'INFT';
      recipientName = descParts[4] || descParts[3] || 'Unknown';
      identifier = descParts[2] || '';
    } else if (descUpper.startsWith('INF/NEFT/') || descUpper.startsWith('UNAWBNEFT/')) {
      method = 'NEFT';
      recipientName = descParts[4] || descParts[3] || 'Unknown';
      identifier = descParts[3] || '';
    } else if (descUpper.startsWith('NEFT-')) {
      method = 'NEFT';
      const parts = desc.split('-');
      recipientName = parts[2] || 'Unknown';
      identifier = parts[4] || '';
    } else if (descUpper.startsWith('RTGS-')) {
      method = 'RTGS';
      const parts = desc.split('-');
      recipientName = parts[2] || 'Unknown';
      identifier = parts[3] || '';
    } else if (descUpper.startsWith('CMS/')) {
      method = 'CMS';
      recipientName = descParts[2] || 'Unknown';
    } else if (descUpper.startsWith('ACH/')) {
      method = 'ACH';
      recipientName = descParts[1] || 'Unknown';
      identifier = descParts[2] || '';
    } else {
      recipientName = desc;
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
