
/* popup.js - v3 persistent embedded wallet
   - Persists encrypted wallet in chrome.storage.local
   - Loads solanaWeb3 from global (IIFE)
   - Minimal trade flows with REST quote fallback
*/

const logEl = document.getElementById('log');
function log(...args){ console.log(...args); logEl.textContent += args.map(a=>typeof a==='object'?JSON.stringify(a):String(a)).join(' ') + "\n"; logEl.scrollTop = logEl.scrollHeight; }

// WebCrypto helpers
async function deriveKey(passphrase, salt){ const enc = new TextEncoder(); const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']); return crypto.subtle.deriveKey({name:'PBKDF2', salt, iterations:250000, hash:'SHA-256'}, base, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']); }
function toB64(buf){ return btoa(String.fromCharCode(...new Uint8Array(buf))); }
function fromB64(b64){ const bin = atob(b64); const arr = new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i); return arr; }

async function encryptPk(base58Pk, pass){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const data = new TextEncoder().encode(base58Pk);
  const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, data);
  return { salt: toB64(salt), iv: toB64(iv), ciphertext: toB64(ct) };
}
async function decryptPk(encObj, pass){
  const salt = fromB64(encObj.salt);
  const iv = fromB64(encObj.iv);
  const ct = fromB64(encObj.ciphertext);
  const key = await deriveKey(pass, salt);
  const dec = await crypto.subtle.decrypt({name:'AES-GCM', iv}, key, ct);
  return new TextDecoder().decode(dec);
}

// storage helpers using chrome.storage.local for persistence across browser restarts
async function setEnc(enc){ return new Promise(res=>chrome.storage.local.set({enc_wallet:enc}, res)); }
async function getEnc(){ return new Promise(res=>chrome.storage.local.get(['enc_wallet'], res)).then(r=>r.enc_wallet); }
async function clearEnc(){ return new Promise(res=>chrome.storage.local.remove(['enc_wallet'], res)); }

let wallet = null;
let Jupiter = null;

// Try dynamic import of Jupiter SDK (best-effort)
(async function tryLoadJupiter(){
  try{
    const mod = await import('https://unpkg.com/@jup-ag/core/dist/index.esm.js');
    Jupiter = mod.Jupiter || mod.default || null;
    if(Jupiter) log('Jupiter SDK loaded via dynamic import');
  }catch(e){
    log('Jupiter dynamic import failed (likely CSP):', e.message);
  }
})();

function updatePubkeyDisplay(){ document.getElementById('pubkey').textContent = wallet ? wallet.publicKey.toBase58() : 'Not loaded'; }

// Generate embedded wallet and persist encrypted
document.getElementById('generateWallet').addEventListener('click', async ()=>{
  const pass = document.getElementById('pass').value;
  if(!pass){ alert('Enter passphrase to encrypt wallet'); return; }
  try{
    const kp = solanaWeb3.Keypair.generate();
    const base58 = bs58.encode(kp.secretKey);
    const enc = await encryptPk(base58, pass);
    await setEnc(enc);
    wallet = kp;
    updatePubkeyDisplay();
    log('Generated embedded wallet and stored encrypted (persistent)');
  }catch(e){ log('generate err', e.message); alert('Generate failed: '+e.message); }
});

// Import wallet and persist encrypted
document.getElementById('importWallet').addEventListener('click', async ()=>{
  const pass = document.getElementById('pass').value;
  if(!pass){ alert('Enter passphrase to encrypt'); return; }
  const base58 = prompt('Paste Base58 private key (secretKey):');
  if(!base58) return;
  try{
    const enc = await encryptPk(base58.trim(), pass);
    await setEnc(enc);
    const sk = bs58.decode(base58.trim());
    wallet = solanaWeb3.Keypair.fromSecretKey(sk);
    updatePubkeyDisplay();
    log('Imported and stored encrypted key (persistent)');
  }catch(e){ log('import err', e.message); alert('Import failed: '+e.message); }
});

// Unlock (decrypt into memory)
document.getElementById('unlockWallet').addEventListener('click', async ()=>{
  const pass = document.getElementById('pass').value;
  if(!pass){ alert('Enter passphrase'); return; }
  try{
    const enc = await getEnc();
    if(!enc){ alert('No encrypted wallet found. Generate or import first.'); return; }
    const base58 = await decryptPk(enc, pass);
    const secret = bs58.decode(base58);
    wallet = solanaWeb3.Keypair.fromSecretKey(secret);
    updatePubkeyDisplay();
    log('Wallet unlocked');
  }catch(e){ log('unlock err', e.message); alert('Unlock failed: '+e.message); }
});

// Export wallet (decrypt then copy base58 to clipboard)
document.getElementById('exportWallet').addEventListener('click', async ()=>{
  const pass = document.getElementById('pass').value;
  if(!pass){ alert('Enter passphrase'); return; }
  try{
    const enc = await getEnc();
    if(!enc){ alert('No encrypted wallet'); return; }
    const base58 = await decryptPk(enc, pass);
    await navigator.clipboard.writeText(base58);
    alert('Private key copied to clipboard (Base58). Keep it safe.');
  }catch(e){ log('export err', e.message); alert('Export failed: '+e.message); }
});

// Clear in-memory only (persisted encrypted key remains unless user deletes via chrome.storage)
document.getElementById('clearMemory').addEventListener('click', async ()=>{
  wallet = null;
  updatePubkeyDisplay();
  log('Cleared wallet from memory (persistent encrypted key remains)');
});

// Map buy/sell to input/output mints
function mapMints(){
  const mode = document.getElementById('buySell').value;
  const base = document.getElementById('baseMint').value.trim();
  const quote = document.getElementById('quoteMint').value.trim();
  if(mode === 'buy'){
    return { inputMint: quote, outputMint: base };
  } else {
    return { inputMint: base, outputMint: quote };
  }
}

// Get quote via background REST proxy
async function getQuote(amount){
  const slippage = Number(document.getElementById('slippage').value)/100;
  const mapping = mapMints();
  const resp = await new Promise(res=>chrome.runtime.sendMessage({type:'GET_QUOTE', inputMint: mapping.inputMint, outputMint: mapping.outputMint, amount, slippage}, resp=>res(resp)));
  return resp;
}

document.getElementById('getQuote').addEventListener('click', async ()=>{
  const amt = document.getElementById('amount').value.trim();
  if(!amt){ alert('Enter amount'); return; }
  const r = await getQuote(amt);
  if(!r.ok) log('Quote error', r.error); else log('Quote', r.data);
});

// Execute swap
async function executeSwap(amountUi){
  const mapping = mapMints();
  const slippage = Number(document.getElementById('slippage').value)/100;

  if(Jupiter && typeof Jupiter.load === 'function'){
    try{
      const conn = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com','confirmed');
      const j = await Jupiter.load({connection: conn, cluster: 'mainnet'});
      const decimals = 9;
      const amountSmall = Math.floor(Number(amountUi) * Math.pow(10, decimals));
      const routes = await j.computeRoutes({ inputMint: mapping.inputMint, outputMint: mapping.outputMint, amount: amountSmall, slippage: Math.floor(slippage*100) });
      if(!routes || !routes.routesInfos || routes.routesInfos.length===0){ log('No routes'); alert('No route found'); return; }
      const routeInfo = routes.routesInfos[0];
      const execResp = await j.exchange({ routeInfo, signer: wallet ? wallet : undefined });
      const swapTransaction = execResp.swapTransaction || execResp.swapTxn || null;
      if(!swapTransaction){ log('SDK returned no swapTransaction'); throw new Error('No swapTransaction'); }
      const tx = solanaWeb3.Transaction.from(swapTransaction);
      tx.feePayer = wallet ? wallet.publicKey : (window.solana && window.solana.isPhantom ? window.solana.publicKey : null);
      const conn2 = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com','confirmed');
      const recent = await conn2.getRecentBlockhash();
      tx.recentBlockhash = recent.blockhash;
      if(wallet){
        tx.partialSign(wallet);
        const sig = await conn2.sendRawTransaction(tx.serialize());
        await conn2.confirmTransaction(sig, 'confirmed');
        log('Swap sent (embedded)', sig);
        return sig;
      } else if(window.solana && window.solana.isPhantom){
        const provider = window.solana;
        const signed = await provider.signTransaction(tx);
        const sig = await conn2.sendRawTransaction(signed.serialize());
        await conn2.confirmTransaction(sig, 'confirmed');
        log('Swap sent (Phantom)', sig);
        return sig;
      } else {
        alert('No signer available');
        return;
      }
    }catch(e){ log('SDK exec error, falling back to REST:', e.message); }
  }

  const quoteResp = await getQuote(amountUi);
  if(!quoteResp.ok){ log('Quote failed', quoteResp.error); alert('Quote failed'); return; }
  const data = quoteResp.data;
  const txB64 = data?.data?.[0]?.swapTransaction || data.swapTransaction || null;
  if(!txB64){ log('No serialized tx in REST response'); alert('No serialized tx — consider bundling Jupiter SDK locally'); return; }
  try{
    const raw = Uint8Array.from(atob(txB64), c=>c.charCodeAt(0));
    const tx = solanaWeb3.Transaction.from(raw);
    tx.feePayer = wallet ? wallet.publicKey : (window.solana && window.solana.isPhantom ? window.solana.publicKey : null);
    const conn = new solanaWeb3.Connection('https://api.mainnet-beta.solana.com','confirmed');
    const recent = await conn.getRecentBlockhash();
    tx.recentBlockhash = recent.blockhash;
    if(wallet){
      tx.partialSign(wallet);
      const sig = await conn.sendRawTransaction(tx.serialize());
      await conn.confirmTransaction(sig, 'confirmed');
      log('Swap sent (embedded REST)', sig);
      return sig;
    } else if(window.solana && window.solana.isPhantom){
      const provider = window.solana;
      const signed = await provider.signTransaction(tx);
      const sig = await conn.sendRawTransaction(signed.serialize());
      await conn.confirmTransaction(sig, 'confirmed');
      log('Swap sent (Phantom REST)', sig);
      return sig;
    } else {
      alert('No signer available');
    }
  }catch(e){ log('Execution error', e.message); alert('Execution failed: '+e.message); }
}

document.getElementById('execute').addEventListener('click', async ()=>{
  const amt = document.getElementById('amount').value.trim();
  if(!amt){ alert('Enter amount'); return; }
  await executeSwap(amt);
});

// TWAP registration
document.getElementById('register').addEventListener('click', async ()=>{
  if(!document.getElementById('twapToggle').checked){ alert('Enable TWAP first'); return; }
  const netUrl = document.getElementById('netUrl').value.trim();
  const mapping = mapMints();
  const total = Number(prompt('Total amount to sell (UI):','1'));
  const chunk = Number(document.getElementById('chunk').value);
  const interval = Number(document.getElementById('interval').value);
  const body = { inputMint: mapping.inputMint, outputMint: mapping.outputMint, totalAmount: total, chunkSize: chunk, intervalMs: interval };
  try{
    const r = await fetch(netUrl + '/register-job', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
    const j = await r.json();
    if(r.ok) log('TWAP registered', j); else log('TWAP register error', j);
  }catch(e){ log('Register failed', e.message); alert('Register failed: '+e.message); }
});

// On load, check persisted encrypted wallet and auto-unlock if passphrase present in sessionStorage (not recommended)
// We will not auto-decrypt; user must click unlock with passphrase to load private key into memory.
(async ()=>{
  const enc = await getEnc();
  if(enc) log('Encrypted wallet stored (persistent). Click Unlock with passphrase to load into memory.');
  // show pubkey if we can derive it without decrypting
  try{
    if(enc && enc.ciphertext){
      document.getElementById('pubkey').textContent = 'Encrypted wallet stored (unlock to load)';
    }
  }catch(e){}
})();
