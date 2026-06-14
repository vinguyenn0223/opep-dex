import deployment from "./deployment.json";

export type Deployment = {
  network: string;
  chainId: number;
  deployer: string;
  treasury: string;
  contracts: {
    MemeToken: `0x${string}`;
    WOPN: `0x${string}`;
    DexFactory: `0x${string}`;
    DexRouter: `0x${string}`;
    Launchpad: `0x${string}`;
    StakingRewards: `0x${string}`;
    MerkleAirdrop: `0x${string}`;
  };
  token: { name: string; symbol: string };
};

export const deploy = deployment as Deployment;

export const addresses = deploy.contracts;
export const tokenMeta = deploy.token;
