/**
 * Shared validation utilities
 */

/**
 * Validates a Solana token mint address
 * @param {string} tokenMint - The token mint address to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export function isValidTokenMint(tokenMint) {
  // Basic validation for Solana token mint address
  if (!tokenMint || typeof tokenMint !== 'string') {
    return false;
  }
  
  // Should be base58 encoded and around 32-44 characters
  if (tokenMint.length < 32 || tokenMint.length > 44) {
    return false;
  }
  
  // Basic base58 character check
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(tokenMint);
} 