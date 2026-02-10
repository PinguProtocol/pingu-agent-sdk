import { ethers } from "ethers";
import { PinguClient } from "./client";
import { BPS_DIVIDER } from "./config";
import type { MarketInfo, OIData } from "./types";
import {
  formatUnits,
  formatMarketInfo,
  getAssetAddress,
  getAssetDecimals,
  parseContractError,
} from "./utils";

// Raw market info type from contract
interface RawMarketInfo {
  name: string;
  category: string;
  chainlinkFeed: string;
  maxLeverage: ethers.BigNumber;
  maxDeviation: ethers.BigNumber;
  fee: ethers.BigNumber;
  liqThreshold: ethers.BigNumber;
  fundingFactor: ethers.BigNumber;
  minOrderAge: ethers.BigNumber;
  pythMaxAge: ethers.BigNumber;
  pythFeed: string;
  allowChainlinkExecution: boolean;
  isReduceOnly: boolean;
  minFactor: ethers.BigNumber;
  sampleSize: ethers.BigNumber;
}

export class PinguReader {
  private client: PinguClient;

  constructor(client: PinguClient) {
    this.client = client;
  }

  async getMarkets(): Promise<MarketInfo[]> {
    try {
      const marketStore = await this.client.getContract("MarketStore");
      const marketList = (await this.client.withFallback(() =>
        marketStore.getMarketList(),
      )) as string[];
      const rawInfos = (await this.client.withFallback(() =>
        marketStore.getMany(marketList),
      )) as RawMarketInfo[];

      return marketList.map((market, i) =>
        formatMarketInfo({
          market,
          ...rawInfos[i],
        }),
      );
    } catch (error) {
      throw new Error(`Failed to get markets: ${parseContractError(error)}`);
    }
  }

  async getMarketInfo(market: string): Promise<MarketInfo> {
    try {
      const marketStore = await this.client.getContract("MarketStore");
      const rawInfo = (await this.client.withFallback(() =>
        marketStore.get(market),
      )) as RawMarketInfo;
      return formatMarketInfo({ market, ...rawInfo });
    } catch (error) {
      throw new Error(`Failed to get market info: ${parseContractError(error)}`);
    }
  }

  /**
   * Get open interest for a market.
   * Optimized: only fetches OI long and OI short, computes total client-side.
   */
  async getOpenInterest(market: string, asset = "USDC"): Promise<OIData> {
    try {
      const positionStore = await this.client.getContract("PositionStore");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);
      const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

      const [oiLong, oiShort] = (await Promise.all([
        this.client.withFallback(() =>
          positionStore.getOILong(assetAddress, market),
        ),
        this.client.withFallback(() =>
          positionStore.getOIShort(assetAddress, market),
        ),
      ])) as [ethers.BigNumber, ethers.BigNumber];

      const longNum = Number(formatUnits(oiLong, assetDecimals));
      const shortNum = Number(formatUnits(oiShort, assetDecimals));

      return {
        total: longNum + shortNum,
        long: longNum,
        short: shortNum,
      };
    } catch (error) {
      throw new Error(
        `Failed to get open interest: ${parseContractError(error)}`,
      );
    }
  }

  /**
   * Get the last capped EMA funding rate (updated every 8h).
   * Returns the funding rate as a percentage per 8-hour period.
   */
  async getFundingRate(market: string, asset = "USDC"): Promise<number> {
    try {
      const fundingStore = await this.client.getContract("FundingStore");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);

      const result = (await this.client.withFallback(() =>
        fundingStore.getLastCappedEmaFundingRate(assetAddress, market),
      )) as ethers.BigNumber;
      const formattedResult = formatUnits(result);
      return (Number(formattedResult) / BPS_DIVIDER / (365 * 3)) * 100;
    } catch (error) {
      throw new Error(
        `Failed to get funding rate: ${parseContractError(error)}`,
      );
    }
  }

  /**
   * Get real-time funding tracker (more accurate for trading strategies).
   * This is the interpolated funding tracker between on-chain updates.
   */
  async getRealTimeFundingTracker(
    market: string,
    asset = "USDC",
  ): Promise<ethers.BigNumber> {
    try {
      const funding = await this.client.getContract("Funding");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);

      return (await this.client.withFallback(() =>
        funding.getRealTimeFundingTracker(assetAddress, market),
      )) as ethers.BigNumber;
    } catch (error) {
      throw new Error(
        `Failed to get real-time funding tracker: ${parseContractError(error)}`,
      );
    }
  }

  /**
   * Get accrued funding for a market using the V2 EMA-based calculation.
   *
   * Calls `Funding.getAccruedFundingV2` on-chain and returns the first value
   * (fundingIncrement), which is the V2 equivalent of V1's `getAccruedFunding`.
   * It represents the total funding tracker increment over the elapsed intervals,
   * computed using the exponential moving average (EMA) method.
   *
   * - Positive value = longs pay shorts (funding tracker increases).
   * - Negative value = shorts pay longs (funding tracker decreases).
   * - Value is in UNIT × bps scale.
   *
   * @param market - Market identifier (e.g. "ETH-USD")
   * @param asset - Asset name (default "USDC")
   * @param intervals - Number of intervals to compute over (default 0 = auto-calculate from last update)
   */
  async getAccruedFunding(
    market: string,
    asset = "USDC",
    intervals = 0,
  ): Promise<ethers.BigNumber> {
    try {
      const funding = await this.client.getContract("Funding");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);

      const result = (await this.client.withFallback(() =>
        funding.getAccruedFundingV2(assetAddress, market, intervals),
      )) as [ethers.BigNumber, ethers.BigNumber, ethers.BigNumber, ethers.BigNumber];

      // First return value = accrued funding increment (V2 equivalent of V1)
      return result[0];
    } catch (error) {
      throw new Error(
        `Failed to get accrued funding: ${parseContractError(error)}`,
      );
    }
  }

  /**
   * Get last funding update timestamp
   */
  async getLastFundingUpdate(
    market: string,
    asset = "USDC",
  ): Promise<number> {
    try {
      const fundingStore = await this.client.getContract("FundingStore");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);

      const timestamp = (await this.client.withFallback(() =>
        fundingStore.getLastUpdated(assetAddress, market),
      )) as ethers.BigNumber;
      return Number(timestamp);
    } catch (error) {
      throw new Error(
        `Failed to get last funding update: ${parseContractError(error)}`,
      );
    }
  }

  async getPoolBalance(asset = "USDC"): Promise<number> {
    try {
      const poolStore = await this.client.getContract("PoolStore");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);
      const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

      const balance = (await this.client.withFallback(() =>
        poolStore.getBalance(assetAddress),
      )) as ethers.BigNumber;
      return Number(formatUnits(balance, assetDecimals));
    } catch (error) {
      throw new Error(
        `Failed to get pool balance: ${parseContractError(error)}`,
      );
    }
  }

  async getMaxPositionSize(market: string, asset = "USDC"): Promise<number> {
    try {
      const riskStore = await this.client.getContract("RiskStore");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);
      const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

      const maxSize = (await this.client.withFallback(() =>
        riskStore.getMaxPositionSize(market, assetAddress),
      )) as ethers.BigNumber;
      return Number(formatUnits(maxSize, assetDecimals));
    } catch (error) {
      throw new Error(
        `Failed to get max position size: ${parseContractError(error)}`,
      );
    }
  }

  async getMaxOI(market: string, asset = "USDC"): Promise<number> {
    try {
      const riskStore = await this.client.getContract("RiskStore");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);
      const assetDecimals = getAssetDecimals(asset, this.client.config.assets);

      const maxOI = (await this.client.withFallback(() =>
        riskStore.getMaxOI(market, assetAddress),
      )) as ethers.BigNumber;
      return Number(formatUnits(maxOI, assetDecimals));
    } catch (error) {
      throw new Error(`Failed to get max OI: ${parseContractError(error)}`);
    }
  }

  /**
   * Get global unrealized profit/loss for a given asset.
   *
   * This value is set by a whitelisted keeper and represents the total
   * unrealized P&L of all open positions for this asset. It is used
   * internally by the Pool contract to calculate deposit/withdrawal taxes.
   *
   * @param asset - Asset name (default "USDC")
   * @returns Global UPL as a signed BigNumber (positive = net unrealized profit)
   */
  async getGlobalUPL(asset = "USDC"): Promise<ethers.BigNumber> {
    try {
      const pool = await this.client.getContract("Pool");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);

      return (await this.client.withFallback(() =>
        pool.getGlobalUPL(assetAddress),
      )) as ethers.BigNumber;
    } catch (error) {
      throw new Error(
        `Failed to get global UPL: ${parseContractError(error)}`,
      );
    }
  }

  /**
   * Compute profit & loss for a position on-chain via Positions.getPnL.
   *
   * This calls the contract's `getPnL` view function which computes:
   * - Price PnL based on entry price vs current price
   * - Funding fee based on funding tracker differential
   * - Net PnL = price PnL − funding fee (for longs) or + funding fee (for shorts)
   *
   * @param market - Market identifier (e.g. "ETH-USD")
   * @param isLong - Whether the position is long
   * @param currentPrice - Current market price (18 decimals BigNumber)
   * @param positionPrice - Position average entry price (18 decimals BigNumber)
   * @param size - Position size in asset decimals (BigNumber)
   * @param fundingTracker - Position's funding tracker snapshot (BigNumber)
   * @param asset - Asset name (default "USDC")
   * @returns Object with `pnl` (net P&L in asset decimals) and `fundingFee`
   */
  async getPnL(
    market: string,
    isLong: boolean,
    currentPrice: ethers.BigNumber,
    positionPrice: ethers.BigNumber,
    size: ethers.BigNumber,
    fundingTracker: ethers.BigNumber,
    asset = "USDC",
  ): Promise<{ pnl: ethers.BigNumber; fundingFee: ethers.BigNumber }> {
    try {
      const positions = await this.client.getContract("Positions");
      const assetAddress = getAssetAddress(asset, this.client.config.assets);

      const result = (await this.client.withFallback(() =>
        positions.getPnL(
          assetAddress,
          market,
          isLong,
          currentPrice,
          positionPrice,
          size,
          fundingTracker,
        ),
      )) as [ethers.BigNumber, ethers.BigNumber];

      return {
        pnl: result[0],
        fundingFee: result[1],
      };
    } catch (error) {
      throw new Error(`Failed to get PnL: ${parseContractError(error)}`);
    }
  }
}
