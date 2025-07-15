# Token Transaction Tracker - Deployment Guide

This application is a simple UI for tracking any transactions involving a specific token across different block numbers, with duplicate address highlighting.

## Features

- **Search Interface**: Input token address and block number to search for transactions
- **Multiple Searches**: Keep track of multiple searches and their results
- **Duplicate Detection**: Automatically highlights addresses that appear across different tokens
- **Universal Coverage**: Tracks any transaction type involving the target token (swaps, transfers, mints, burns, etc.)
- **Responsive Design**: Clean, modern UI that works on desktop and mobile
- **Static Deployment**: Built as a static site for easy deployment

## How to Use

1. **Enter Token Information**:

   - Token Address: Enter the Solana token mint address
   - Block Number: Enter the specific block number to search

2. **Search for Transactions**: Click "Start Tracking" to find all transactions involving that token at the specified block

3. **View Results**:

   - Each search appears as a separate card with transaction details
   - Duplicate addresses across different tokens are highlighted in yellow
   - Click transaction links to view on Solscan

4. **Track Duplicates**: The "Duplicate Addresses Summary" section shows addresses that appear in multiple searches

5. **Manage Searches**: Use "Clear All Searches" to reset and start fresh

## Development

### Prerequisites

- Node.js 18+
- pnpm

### Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Build for production
pnpm run build
```

## Deployment

### GitHub Pages

The project is configured for GitHub Pages deployment:

```bash
# Build with correct base path for GitHub Pages
pnpm run build:github

# The built files will be in the docs/ directory
# Push to GitHub and enable Pages in repository settings
```

### Other Static Hosting

For other static hosting services (Netlify, Vercel, etc.):

```bash
# Build for production
pnpm run build

# Deploy the contents of the docs/ directory
```

### Manual Deployment

1. Run `pnpm run build`
2. Copy all files from `docs/` directory to your web server
3. Serve `index.html` as the main entry point

## Technical Details

- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **Package Manager**: pnpm
- **Output**: Static files in `docs/` directory

## API Integration

Currently uses mock data for demonstration. To integrate with real Solana data:

1. Replace the `fetchBuyersForToken` function in `src/App.tsx`
2. Implement actual Solana RPC calls to fetch transaction data
3. Parse transaction logs to extract buyer addresses
4. Handle rate limiting and error cases

## Browser Compatibility

- Modern browsers with ES2020 support
- Chrome 88+
- Firefox 78+
- Safari 14+
- Edge 88+
