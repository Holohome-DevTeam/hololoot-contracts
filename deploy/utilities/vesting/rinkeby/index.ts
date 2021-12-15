import { BigNumber } from "ethers";
import { SaleData } from "../types";

// DATA
import { ADDRESSES_SEED, AMOUNT_SEED } from "./seed";
import { ADDRESSES_PRIVATE, AMOUNT_PRIVATE } from "./private";
import { ADDRESSES_IDO_SEEDIFY, AMOUNT_IDO_SEEDIFY } from "./ido_seedify";
import { ADDRESSES_IDO_ENJIN, AMOUNT_IDO_ENJIN } from "./ido_enjin";
import { ADDRESSES_IDO_SYNAPSE, AMOUNT_IDO_SYNAPSE } from "./ido_synapse";

/**
 * SEED       - Sat Jun 11 2022 15:30:00 GMT+0000
 * PRIVATE    - Mon Dec 13 2021 15:30:00 GMT+0000
 * IDO        - Mon Dec 13 2021 15:30:00 GMT+0000
 */
const START_TIME = {
  seed: 1654961400, //    SEED
  private: 1639409400, // PRIVATE
  ido: 1639409400, //     IDO
};

/**
 * SEED       - Sun Jun 11 2023 15:30:00 GMT+0000
 * PRIVATE    - Tue Dec 13 2022 15:30:00 GMT+0000
 * IDO        - Fri Sep 09 2022 15:30:00 GMT+0000
 */
const END_TIME = {
  seed: 1686497400, //    SEED
  private: 1670945400, // PRIVATE
  ido: 1662737400, //     IDO
};

const START_BPS = {
  seed: 0, //             SEED
  private: 1000, //        PRIVATE
  ido: 3000, //           IDO
};

export function getSaleData(round: string): SaleData {
  switch (round) {
    case "seed":
      return getData(ADDRESSES_SEED, AMOUNT_SEED, START_TIME.seed, END_TIME.seed, START_BPS.seed);
    case "private":
      return getData(ADDRESSES_PRIVATE, AMOUNT_PRIVATE, START_TIME.private, END_TIME.private, START_BPS.private);
    case "ido_seedify":
      return getData(ADDRESSES_IDO_SEEDIFY, AMOUNT_IDO_SEEDIFY, START_TIME.ido, END_TIME.ido, START_BPS.ido);
    case "ido_enjin":
      return getData(ADDRESSES_IDO_ENJIN, AMOUNT_IDO_ENJIN, START_TIME.ido, END_TIME.ido, START_BPS.ido);
    case "ido_synapse":
      return getData(ADDRESSES_IDO_SYNAPSE, AMOUNT_IDO_SYNAPSE, START_TIME.ido, END_TIME.ido, START_BPS.ido);
    default:
      return {
        address: [],
        start_amount: [],
        total_amount: [],
        total: BigNumber.from(0),
        start_time: 0,
        end_time: 0,
      };
  }
}

function getData(round_addresses: string[], round_amounts: number[], startTime: number, endTime: number, basisPoints: number): SaleData {
  if (round_addresses.length == round_amounts.length) {
    const saleData: SaleData = {
      address: round_addresses,
      start_amount: [],
      total_amount: [],
      total: BigNumber.from(0),
      start_time: startTime,
      end_time: endTime,
    };

    round_amounts.forEach(function (value) {
      const amount: BigNumber = BigNumber.from((value * 10000).toFixed(0))
        .mul(BigNumber.from(10).pow(18))
        .div(10000);

      const start: BigNumber = amount.mul(basisPoints).div(10000);

      saleData.total = saleData.total.add(amount);
      saleData.start_amount.push(start);
      saleData.total_amount.push(amount);
    });

    return saleData;
  } else {
    throw new Error("VESTING DATA MISMATCH");
  }
}
