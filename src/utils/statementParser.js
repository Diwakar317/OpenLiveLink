import CryptoJS from 'crypto-js';

const GENERIC_REMARKS = ['upi pay', 'upi', 'sent using payt', 'payment', 'sent using paytm'];

export function parseStatement(text) {
  const lines = text.split('\n');
  const transactions = [];
  
  let isData = false;
  
  for (let line of lines) {
    if (line.startsWith('No.|')) {
      isData = true;
      continue;
    }
    
    if (!isData || !line.trim()) continue;
    
    const cols = line.split('|');
    if (cols.length < 8) continue;
    
    const [no, txnIdStr, dateStr, postedDate, cheque, description, type, amountStr, balanceStr] = cols;
    
    const amount = parseFloat(amountStr.replace(/,/g, ''));
    const isDebit = type.trim() === 'DR';
    
    let method = 'OTHER';
    let recipientName = 'Unknown';
    let identifier = '';
    
    const desc = description.trim();
    const descParts = desc.split('/');
    
    // CASH DEPOSIT HEURISTIC
    if (desc.includes('CASH DEP')) {
      method = 'CASH';
      recipientName = 'CASH DEPOSIT';
      identifier = '';
    } 
    // CASH WITHDRAWAL HEURISTIC
    else if (desc.includes('CASH WDL')) {
      method = 'CASH';
      recipientName = 'CASH WITHDRAWAL';
      identifier = '';
    }
    // BANK CHARGES HEURISTIC
    else if (
      desc.toLowerCase().startsWith('mob alrt chg') ||
      desc.toLowerCase().includes('+gst') ||
      desc.toLowerCase().includes('imps chg') ||
      desc.toLowerCase().includes('chq book chg') ||
      desc.toLowerCase().includes('cashdep chgs') ||
      desc.toLowerCase().includes('bulk trn chg')
    ) {
      method = 'FEE';
      recipientName = 'BANK CHARGES';
      identifier = '';
    }
    // UPI HEURISTIC
    else if (desc.startsWith('UPI/')) {
      method = 'UPI';
      recipientName = descParts[2] || 'Unknown';
      identifier = descParts[3] || '';
      
      // If name is a generic remark, try to extract a real name from the UPI ID
      if (GENERIC_REMARKS.includes(recipientName.toLowerCase().trim()) && identifier.includes('@')) {
         const prefix = identifier.split('@')[0];
         // Simple clean up (e.g. 9336974906 or prasidha)
         recipientName = prefix;
      }
    } 
    // IMPS HEURISTIC
    else if (desc.startsWith('MMT/IMPS/')) {
      method = 'IMPS';
      recipientName = descParts[4] || descParts[3] || 'Unknown';
      identifier = descParts[5] || '';
    } 
    // INFT (Internal Transfer) HEURISTIC
    else if (desc.startsWith('BIL/INFT/')) {
      method = 'INFT';
      recipientName = descParts[4] || descParts[3] || 'Unknown';
      identifier = descParts[2] || '';
    }
    // NEFT HEURISTICS
    else if (desc.startsWith('INF/NEFT/')) {
      method = 'NEFT';
      recipientName = descParts[4] || 'Unknown';
      identifier = descParts[3] || '';
    } else if (desc.startsWith('NEFT-')) {
      method = 'NEFT';
      const parts = desc.split('-');
      recipientName = parts[2] || 'Unknown';
      identifier = parts[4] || '';
    } 
    // RTGS HEURISTIC
    else if (desc.startsWith('RTGS-')) {
      method = 'RTGS';
      const parts = desc.split('-');
      recipientName = parts[2] || 'Unknown';
      identifier = parts[3] || '';
    } 
    // CMS HEURISTIC
    else if (desc.startsWith('CMS/')) {
      method = 'CMS';
      recipientName = descParts[2] || 'Unknown';
      // Deliberately leave identifier blank so Layer 2 groups them by the extracted Name
      identifier = '';
    }
    // ACH HEURISTIC
    else if (desc.startsWith('ACH/')) {
      method = 'ACH';
      recipientName = descParts[1] || 'Unknown';
      identifier = descParts[2] || '';
    } 
    // FALLBACK
    else {
      recipientName = desc;
    }
    
    recipientName = recipientName.trim().replace(/ +/g, ' ');
    const txnId = txnIdStr.trim() || no.trim();
    const date = dateStr.trim();
    
    // Convert 01-08-2026 to YYYY-MM-DD
    let isoDate = date;
    const dateParts = date.split('-');
    if (dateParts.length === 3) {
       isoDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
    }

    const timeMatch = postedDate.match(/\d{2}:\d{2}:\d{2}(?:\s?[aApP][mM])?/);
    const time = timeMatch ? timeMatch[0] : '00:00:00';

    const sourceHash = CryptoJS.SHA256(`${txnId}_${isoDate}`).toString();

    transactions.push({
      transaction_id: txnId,
      date: isoDate,
      time: time,
      amount: isDebit ? -amount : amount,
      recipient_name: recipientName,
      upi_id: method === 'UPI' ? identifier.trim() : null,
      account_number: (method !== 'UPI' && method !== 'CASH') ? identifier.trim() : null,
      remarks: desc,
      status: 'valid',
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
