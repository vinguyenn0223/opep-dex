import { defineChain } from "viem";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_OPN_CHAIN_ID || "0");
const RPC_URL = process.env.NEXT_PUBLIC_OPN_RPC_URL || "http://127.0.0.1:8545";
const EXPLORER_URL = process.env.NEXT_PUBLIC_OPN_EXPLORER_URL || "";
const CHAIN_NAME = process.env.NEXT_PUBLIC_OPN_CHAIN_NAME || "OPN Chain";
const CURRENCY_SYMBOL = process.env.NEXT_PUBLIC_OPN_CURRENCY_SYMBOL || "OPN";
// RainbowKit/WalletConnect require a project id. A placeholder keeps injected
// wallets (MetaMask) working for local/testnet dev without WalletConnect.
const WC_PROJECT_ID = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "opepe-dev";

// OPN Chain — fill chain id / rpc via env once you have them from
// testnet.iopn.tech -> Connect Wallet -> MetaMask "Add Network".
export const opnChain = defineChain({
  id: CHAIN_ID || 31337,
  name: CHAIN_NAME,
  nativeCurrency: { name: CURRENCY_SYMBOL, symbol: CURRENCY_SYMBOL, decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
  },
  blockExplorers: EXPLORER_URL
    ? { default: { name: "Explorer", url: EXPLORER_URL } }
    : undefined,
});

export const wagmiConfig = getDefaultConfig({
  appName: "OPEPE DEX",
  projectId: WC_PROJECT_ID,
  chains: [opnChain],
  ssr: true,
});
