import type { Address } from 'viem';

/**
 * Deployed addresses for the PTON token and ClaudeVault credit hub,
 * staged for Phase 1 of the llm-api-gateway integration.
 *
 * Source repo: llm-api-gateway/contracts/broadcast/Deploy.s.sol/<chainId>/run-latest.json
 * On chains where no deployment exists yet, fields are `null` and must be
 * populated before BILLING_ENABLED=true on that chain.
 */
export interface BillingChainAddresses {
  chainId: number;
  name: string;
  pton: Address | null;
  claudeVault: Address | null;
  /**
   * Underlying TON ERC-20 that PTON wraps on this chain. `null` where PTON is
   * not deployed, or where the canonical bridged TON is used (Ethereum). On
   * chains with no canonical TON bridge (e.g. Base), this points at a chain-side
   * TON token deployed alongside PTON, exposing a public `faucet()`.
   */
  ton?: Address | null;
  /** Notes about provenance and any caveats (e.g. anvil-fork, not production). */
  notes: string;
}

/**
 * Chain 1 — Ethereum Mainnet
 *
 * LIVE production deploy. Verified on-chain (2026-06-01) against a live Ethereum
 * node: PTON 0x00D1EDcE… has bytecode, wraps the canonical TON
 * (0x2be5e8c109e2197D077D13A82dAead6a9b3433C5), faucet OFF, with real PTON in
 * circulation; ClaudeVault 0x1072f70e… has bytecode and pton()→the live PTON.
 *
 * NOTE: An earlier revision of this entry listed Anvil mainnet-fork addresses
 * (0x1aa43c68… / 0xeae2f210…) which have ZERO bytecode on live Ethereum. Those
 * were stale fork artifacts and have been replaced with the production
 * addresses below (sourced from llm-api-gateway broadcast/Deploy.s.sol/1 and
 * confirmed live via eth_getCode + pton()/ton() reads).
 *
 * admin = operator = 0x5b85411Afe4879B3A9DE1De93b5e83c75B6BB0bB.
 */
export const ETHEREUM_MAINNET: BillingChainAddresses = {
  chainId: 1,
  name: 'Ethereum Mainnet',
  pton: '0x00D1EDcE8E7c617891FF76224DFf501c568f1Ce0' as Address,
  claudeVault: '0x1072f70e7c490E460fA72AC4171F7aDD1ef2d79F' as Address,
  ton: '0x2be5e8c109e2197D077D13A82dAead6a9b3433C5' as Address,
  notes:
    'LIVE Ethereum mainnet deploy. PTON wraps canonical TON (0x2be5e8c1…3433C5), faucet OFF. ' +
    'admin=operator=0x5b85411Afe4879B3A9DE1De93b5e83c75B6BB0bB. Verified on-chain 2026-06-01 ' +
    '(both contracts have bytecode; pton()→0x00D1EDcE…, ton()→canonical TON).',
} as const;

/**
 * Chain 11155111 — Sepolia Testnet
 *
 * No deployment exists yet. Populate before enabling billing on Sepolia.
 */
export const SEPOLIA: BillingChainAddresses = {
  chainId: 11155111,
  name: 'Sepolia',
  pton: null,
  claudeVault: null,
  notes: 'Not deployed — populate pton and claudeVault before enabling on Sepolia.',
} as const;

/**
 * Chain 137 — Polygon Mainnet
 *
 * No deployment exists yet. Populate before enabling billing on Polygon.
 */
export const POLYGON: BillingChainAddresses = {
  chainId: 137,
  name: 'Polygon',
  pton: null,
  claudeVault: null,
  notes: 'Not deployed — populate pton and claudeVault before enabling on Polygon.',
} as const;

/**
 * Chain 8453 — Base Mainnet
 *
 * LIVE production deploy (2026-06-01). Deployed via
 *   llm-api-gateway/contracts/script/DeployBase.s.sol
 * with deployer/admin/operator = 0x3ec2c9fb15C222Aa273F3f2F20a740FA86b4F618.
 *
 * Base has no canonical bridged TON, so a chain-side TON ERC-20 was deployed as
 * the wrap underlying (name "Tokamak Network Token", symbol "TON", 18 decimals)
 * with a public `faucet()`. PTON wraps it 1:1 (faucet OFF on PTON — obtain TON
 * via TON.faucet(), then PTON.deposit()).
 *
 * Deploy tx hashes (Base mainnet, chainId 8453):
 *   TON:         0x39d2e31a4104c489dd7ddd3b41e8630f12ea0f7e51525aa50f705dc30460d7f0
 *   PTON:        0xd11e80255b117f8d0149e3f5f7672b49d4c7dfeef7d90d26913cca2f0edb85c0
 *   ClaudeVault: 0xf35c76663730a339724e24a43f758e9cffd146fc7165c6b63e90b747342317a5
 */
export const BASE_MAINNET: BillingChainAddresses = {
  chainId: 8453,
  name: 'Base',
  pton: '0xb05D73E931bf329bd995c64696E7D833C08650b1' as Address,
  claudeVault: '0x0052258E517835081c94c0B685409f2EfC4D502b' as Address,
  ton: '0x3f89CD27fD877827E7665A9883b3c0180E22A525' as Address,
  notes:
    'LIVE Base mainnet deploy (2026-06-01). admin=operator=0x3ec2c9fb15C222Aa273F3f2F20a740FA86b4F618. ' +
    'Chain-side TON (0x3f89CD27…A525) is a Base-native TON token with a public faucet() — ' +
    'no canonical TON bridge to Base exists. Users obtain TON via faucet, then PTON.deposit() to wrap.',
} as const;

export const BILLING_CHAIN_MAP: ReadonlyMap<number, BillingChainAddresses> = new Map([
  [ETHEREUM_MAINNET.chainId, ETHEREUM_MAINNET],
  [SEPOLIA.chainId, SEPOLIA],
  [POLYGON.chainId, POLYGON],
  [BASE_MAINNET.chainId, BASE_MAINNET],
]);

/**
 * Returns the billing chain addresses for the given chainId, or undefined if
 * the chain is not yet registered.
 *
 * Note: a non-undefined return does NOT guarantee that `pton` and `claudeVault`
 * are populated — check for null before constructing viem clients.
 */
export function getBillingChainAddresses(chainId: number): BillingChainAddresses | undefined {
  return BILLING_CHAIN_MAP.get(chainId);
}
