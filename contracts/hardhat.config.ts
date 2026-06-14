import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const OPN_RPC_URL = process.env.OPN_RPC_URL || "";
const OPN_CHAIN_ID = Number(process.env.OPN_CHAIN_ID || "0");
const RAW_PK = (process.env.PRIVATE_KEY || "").trim();
const PRIVATE_KEY = RAW_PK && !RAW_PK.startsWith("0x") ? `0x${RAW_PK}` : RAW_PK;

const accounts = /^0x[0-9a-fA-F]{64}$/.test(PRIVATE_KEY) ? [PRIVATE_KEY] : [];

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        // DEX core (Uniswap V2 fork) — ships uint overflow math, keep optimizer runs high
        version: "0.8.24",
        settings: {
          optimizer: { enabled: true, runs: 200 },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    opn: {
      url: OPN_RPC_URL,
      chainId: OPN_CHAIN_ID || undefined,
      accounts,
    },
  },
  etherscan: {
    apiKey: {
      opn: process.env.OPN_VERIFY_API_KEY || "empty",
    },
    customChains: [
      {
        network: "opn",
        chainId: OPN_CHAIN_ID || 0,
        urls: {
          apiURL: process.env.OPN_VERIFY_API_URL || "",
          browserURL: process.env.OPN_EXPLORER_URL || "",
        },
      },
    ],
  },
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

export default config;
