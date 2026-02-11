export const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
export const BPS_DIVIDER = 10000;

export interface AssetConfig {
  address: string;
  decimals: number;
  isGasToken?: boolean;
  minSize: number;
}

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrls: string[];
  dataStore: string;
  subgraphId: string;
  explorer: string;
  assets: Record<string, AssetConfig>;
}

export const MONAD_RPC_URLS = [
  "https://rpc1.monad.xyz",
  "https://monad.rpc.blxrbdn.com",
  "https://rpc.monad.xyz",
  "https://rpc-mainnet.monadinfra.com",
  "https://rpc3.monad.xyz",
  "https://monad-mainnet.drpc.org",
  "https://monad-mainnet-rpc.spidernode.net",
  "https://rpc.sentio.xyz/monad-mainnet",
  "https://rpc4.monad.xyz",
  "https://infra.originstake.com/monad/evm",
  "https://rpc2.monad.xyz",
  "https://monad-mainnet.api.onfinality.io/public",
  "https://monad-mainnet.gateway.tatum.io",
];

export const MONAD_SUBGRAPH_ID = "G3dQNfEnDw4q3bn6QRSJUmcLzi7JKTDGYGWwPeYWYa6X";

export const MONAD_CONFIG: ChainConfig = {
  chainId: 10143,
  name: "Monad",
  rpcUrls: MONAD_RPC_URLS,
  dataStore: "0x631c6E0d5ae2E1F6a39871a9BE97F1D9d43D1C83",
  subgraphId: MONAD_SUBGRAPH_ID,
  explorer: "https://monadvision.com/",
  assets: {
    USDC: {
      address: "0x754704bc059f8c67012fed69bc8a327a5aafb603",
      decimals: 6,
      minSize: 100,
    },
    MON: {
      address: ADDRESS_ZERO,
      decimals: 18,
      isGasToken: true,
      minSize: 5000,
    },
  },
};

export const DEFAULT_CONFIG = MONAD_CONFIG;

/**
 * Build The Graph endpoint URL with API key
 */
export function buildSubgraphUrl(apiKey: string, subgraphId: string): string {
  return `https://gateway.thegraph.com/api/${apiKey}/subgraphs/id/${subgraphId}`;
}
