# Sol TWAP Toolkit — v3

A Chrome extension for time-weighted average price (TWAP) trading on the Solana blockchain with persistent embedded wallet management.

## Features

- **Persistent Embedded Wallet**: Generate or import a Solana wallet with encrypted storage
- **TWAP Trading**: Execute time-weighted average price orders
- **Jupiter Integration**: Swap tokens using Jupiter aggregator
- **Mainnet/Devnet Support**: Trade on Solana mainnet or devnet
- **Secure Encryption**: Wallet keys encrypted with AES-GCM using passphrase-derived keys

## Installation

### Chrome Extension

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the project directory
5. The extension icon should appear in your browser toolbar

### Firebase Hosting (Optional)

1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Deploy: `firebase deploy`

## Usage

### Wallet Management

1. **Generate Wallet**: Create a new embedded wallet with encryption
2. **Import Wallet**: Import existing wallet using Base58 private key
3. **Unlock**: Decrypt and load wallet into memory
4. **Export**: Copy encrypted private key to clipboard

### Trading

1. Select trade mode (Buy/Sell)
2. Enter base token mint (asset you want)
3. Enter quote token mint (asset you spend)
4. Set amount and slippage tolerance
5. Click "Quote" to preview or "Execute" to trade

### TWAP Orders

1. Enable TWAP mode
2. Configure chunk size and interval
3. Click "Register TWAP" to schedule automated trades

## Security

- Private keys are encrypted using WebCrypto API with AES-GCM
- Keys are stored in `chrome.storage.local` with encryption
- Always use a strong passphrase
- Never share your private keys or passphrase

## Configuration

- **Default Network**: Mainnet (use Devnet for testing)
- **RPC Endpoint**: `https://api.mainnet-beta.solana.com`
- **Jupiter API**: `https://quote-api.jup.ag/v6`

## Files

- `manifest.json` - Chrome extension manifest (v3)
- `index.html` - Extension popup UI
- `popup.js` - Frontend logic and wallet management
- `background.js` - Service worker for API requests
- `firebase.json` - Firebase hosting configuration
- `public/` - Static files for Firebase hosting

## Development

This is a static Chrome extension with no build step required. Simply edit the files and reload the extension in Chrome.

## License

MIT

## Disclaimer

This software is provided as-is. Use at your own risk. Always test on devnet before using real funds on mainnet.
