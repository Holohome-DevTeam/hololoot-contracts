import { BigNumber } from "ethers";

export type SaleData = {
  address: string[];
  start_amount: BigNumber[];
  total_amount: BigNumber[];
  start_time: number;
  end_time: number;
  total: BigNumber;
};
