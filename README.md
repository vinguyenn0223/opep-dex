# OPEPE DEX — Meme DEX on OPN Chain

A full-stack meme DEX built on **OPN Chain testnet (chainId 984)** for the IOPn Builder's Programme. Swap, provide liquidity, join presales, launch your own sale, stake to earn, and claim an airdrop — all powered by the exchange's own meme token, **OpnPepe ($OPEPE)**.

## What's inside

| Module | What it does |
|---|---|
| **MemeToken ($OPEPE)** | Fixed-supply (1B) ERC-20 with burn. The exchange's native meme token. |
| **DEX (swap + liquidity)** | Uniswap V2 fork ported to Solidity 0.8.x — Factory, Pair, Router, WOPN. Swap OPN↔OPEPE, add/remove liquidity, earn LP tokens. |
| **Presale** | Buy OPEPE for native OPN at a fixed rate. Soft/hard cap, per-wallet limits, claim on success, full refund on failure. |
| **Launchpad** | Factory that deploys a funded Presale for any project's token, with an optional creation fee. |
| **Staking** | Synthetix-style staking. Stake OPEPE (or an LP token), earn OPEPE rewards continuously over a reward window. |
| **Airdrop** | Gas-efficient Merkle-proof claim. Owner sets the root; eligible wallets claim their allocation once. |

## Live on OPN Chain testnet (chainId 984)

- **RPC:** `https://testnet-rpc.iopn.tech`
- **Explorer:** `https://testnet.iopn.tech`

### Deployed & verified contracts

| Contract | Address | Verified |
|---|---|---|
| MemeToken ($OPEPE) | [`0x7dA69148f610c362b2C21764b82a1d5c2566A8ef`](https://testnet.iopn.tech/address/0x7dA69148f610c362b2C21764b82a1d5c2566A8ef#code) | ✅ |
| WOPN | [`0x979AB6D65199F10C30C1909007Fc012791A39A63`](https://testnet.iopn.tech/address/0x979AB6D65199F10C30C1909007Fc012791A39A63#code) | ✅ |
| DexFactory | [`0xD0cf4cda1a2b8956BDF54ebAa2804d399094278f`](https://testnet.iopn.tech/address/0xD0cf4cda1a2b8956BDF54ebAa2804d399094278f#code) | ✅ |
| DexRouter | [`0x0Be716BEB23154b52d00F52d7D95a099e0FED151`](https://testnet.iopn.tech/address/0x0Be716BEB23154b52d00F52d7D95a099e0FED151#code) | ✅ |
| StakingRewards | [`0x27Fe6Cc7E887E70655B96d23Fc2cd29283238D94`](https://testnet.iopn.tech/address/0x27Fe6Cc7E887E70655B96d23Fc2cd29283238D94#code) | ✅ |
| MerkleAirdrop | [`0xdA48B038459308A4FA2E2C21e15Ab9204629c09a`](https://testnet.iopn.tech/address/0xdA48B038459308A4FA2E2C21e15Ab9204629c09a#code) | ✅ |
| Launchpad | [`0x97fcCf7635038b6af8f51741278BAEc1aE2673C9`](https://testnet.iopn.tech/address/0x97fcCf7635038b6af8f51741278BAEc1aE2673C9#code) | ✅ |
| Presale (OPEPE) | [`0xDD362f9d0A02C48ff2DC9Eee00d83ac0FCd51e25`](https://testnet.iopn.tech/address/0xDD362f9d0A02C48ff2DC9Eee00d83ac0FCd51e25#code) | ✅ |
| Pair (OPEPE/OPN) | [`0x6fE14550Fc3753662000b8d3800012C30a3C49Fd`](https://testnet.iopn.tech/address/0x6fE14550Fc3753662000b8d3800012C30a3C49Fd#code) | ✅ |

The OPEPE/OPN pair is created by the Factory via CREATE2 and backs every swap; its source is `DexPair.sol`. Use `npx hardhat run scripts/verify-pair.ts --network opn` to (re)verify the pair after it is created.

## Repository layout

```
contracts/          Hardhat + TypeScript
  contracts/
    MemeToken.sol
    Presale.sol
    Launchpad.sol
    StakingRewards.sol
    MerkleAirdrop.sol
    dex/            Uniswap V2 fork (Factory, Pair, Router, WOPN, libraries)
  scripts/
    deploy.ts       Deploys all 7 contracts, writes addresses, mirrors to web/
    setup.ts        Seeds liquidity, funds staking, deploys + funds a presale
    airdrop.ts      Builds the Merkle tree, sets the root on-chain, funds the airdrop
    smoke.ts        Exercises every on-chain feature end-to-end
    verify-pair.ts  Retries verifying the CREATE2 pair
  test/             20 unit tests (all passing)

web/                Next.js 14 + wagmi + viem + RainbowKit
  src/app/          Swap, Liquidity, Presale, Launchpad, Stake, Airdrop pages
  src/config/       wagmi chain config, ABIs, deployment.json (auto-generated)
```

## Quick start

### Contracts

```bash
cd contracts
npm install
cp .env.example .env        # fill OPN_RPC_URL, OPN_CHAIN_ID=984, PRIVATE_KEY
npm test                    # 20/20 passing
npm run deploy:opn          # deploy to OPN testnet
npx hardhat run scripts/setup.ts --network opn    # seed LP, staking, presale
npx hardhat run scripts/airdrop.ts --network opn  # set Merkle root + fund airdrop
npx hardhat run scripts/smoke.ts --network opn    # verify all features on-chain
```

### Frontend

```bash
cd web
npm install
cp .env.example .env.local  # fill NEXT_PUBLIC_OPN_RPC_URL, NEXT_PUBLIC_OPN_CHAIN_ID=984
npm run dev                 # http://localhost:3000
```

Connect MetaMask on the OPN testnet (chainId 984) to interact.

## Verification

All 9 contracts (7 deployed directly, plus the CREATE2 Pair and the Presale) are source-verified on the OPN testnet explorer. Every feature has been exercised on-chain with a live wallet — `scripts/smoke.ts` runs swap (both directions), add/remove liquidity, presale contribute, stake + claim rewards + unstake, and airdrop claim, reporting **13/13 features passing**.

## Security notes

- Private keys live only in `.env` / `.env.local`, which are gitignored at the repo root and in both packages. Never commit them.
- The DEX core is a faithful Uniswap V2 port; the staking contract follows the audited Synthetix `StakingRewards` pattern; the airdrop uses OpenZeppelin's `MerkleProof`.
- Contracts use OpenZeppelin `Ownable`/`ReentrancyGuard`/`SafeERC20` where appropriate.

## Tech stack

Solidity 0.8.24 · Hardhat · OpenZeppelin · TypeScript · Next.js 14 · wagmi · viem · RainbowKit
