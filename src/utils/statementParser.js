import CryptoJS from 'crypto-js';

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
    const isCredit = type.trim() === 'CR';
    const isDebit = type.trim() === 'DR';
    
    let method = 'OTHER';
    let recipientName = 'Unknown';
    let identifier = '';
    
    const desc = description.trim();
    const descParts = desc.split('/');
    
    if (desc.startsWith('UPI/')) {
      method = 'UPI';
      recipientName = descParts[2] || 'Unknown';
      identifier = descParts[3] || '';
    } else if (desc.startsWith('MMT/IMPS/')) {
      method = 'IMPS';
      recipientName = descParts[3] || 'Unknown';
      identifier = descParts[4] || ''; 
      if (!identifier || identifier.trim() === '') {
        identifier = descParts[5] || '';
      }
    } else if (desc.startsWith('INF/NEFT/')) {
      method = 'NEFT';
      recipientName = descParts[4] || 'Unknown';
      identifier = descParts[3] || '';
    } else if (desc.startsWith('NEFT-')) {
      method = 'NEFT';
      const parts = desc.split('-');
      recipientName = parts[2] || 'Unknown';
      identifier = parts[4] || '';
    } else if (desc.startsWith('RTGS-')) {
      method = 'RTGS';
      const parts = desc.split('-');
      recipientName = parts[2] || 'Unknown';
      identifier = parts[3] || '';
    } else if (desc.startsWith('ACH/')) {
      method = 'ACH';
      recipientName = descParts[1] || 'Unknown';
      identifier = descParts[2] || '';
    } else {
      recipientName = desc;
    }
    
    recipientName = recipientName.trim().replace(/ +/g, ' ');
    const txnId = txnIdStr.trim() || no.trim();
    const date = dateStr.trim();
    
    // Convert 01-08-2026 to YYYY-MM-DD for standard DB
    let isoDate = date;
    const dateParts = date.split('-');
    if (dateParts.length === 3) {
       isoDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;
    }

    const timeMatch = postedDate.match(/\d{2}:\d{2}:\d{2}/);
    const time = timeMatch ? timeMatch[0] : '00:00:00';

    const sourceHash = CryptoJS.SHA256(`${txnId}_${isoDate}`).toString();

    // Map to Supabase Schema
    transactions.push({
      transaction_id: txnId,
      date: isoDate,
      time: time,
      amount: isDebit ? -amount : amount, // Negative for Paid, Positive for Received
      recipient_name: recipientName,
      upi_id: method === 'UPI' ? identifier.trim() : null,
      account_number: method !== 'UPI' ? identifier.trim() : null,
      remarks: desc,
      status: 'valid',
      source_hash: sourceHash
    });
  }
  
  return transactions;
}

export function groupTransactions(payments) {
  const grouped = {};
  
  payments.forEach(txn => {
    let key = (txn.recipient_name || 'Unknown').toUpperCase();
    
    // Normalization
    if (key.includes('PRADEEPKUMAR')) key = 'PRADEEP KUMAR';
    if (key.includes('MAHENDRAPAL')) key = 'MAHENDRA PAL';
    
    if (!grouped[key]) {
      grouped[key] = {
        name: key,
        totalPaid: 0,
        totalReceived: 0,
        transactions: [],
        identifiers: new Set()
      };
    }
    
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
    group.identifiers = Array.from(group.identifiers);
    return group;
  });
  
  result.sort((a, b) => (b.totalPaid + b.totalReceived) - (a.totalPaid + a.totalReceived));
  
  return result;
}
