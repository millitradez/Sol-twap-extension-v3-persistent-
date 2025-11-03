
console.log("Sol TWAP v3 background running.");
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === "GET_QUOTE") {
      try {
        const params = new URLSearchParams({
          inputMint: msg.inputMint,
          outputMint: msg.outputMint,
          amount: msg.amount,
          slippageBps: String(Math.floor((msg.slippage||0.03)*10000))
        });
        const url = "https://quote-api.jup.ag/v4/swap?" + params.toString();
        const r = await fetch(url);
        const data = await r.json();
        sendResponse({ok:true, data});
      } catch (e) {
        sendResponse({ok:false, error: e.message});
      }
    } else {
      sendResponse({ok:false, error:"unknown message type"});
    }
  })();
  return true;
});
