const fetch = require('node-fetch');
const { PROVIDER_NAME_TRANSAK } = require('../cron/common/constants.common');
const { addOrUpdatePaymentCoinForTransak } = require('../cron/paymentCoins/transak.paymentCoin');
const { PaymentGatewayCoins } = require('../models/payment_gateway_coins');
const { Coin } = require('../models/coin');
require('dotenv').config();
jest.mock('node-fetch', () => require('jest-fetch-mock'));
jest.mock('../models/coin');
jest.mock('../models/payment_gateway_coins');

describe('addOrUpdatePaymentCoinForTransak', () => {
  beforeEach(() => {
    jest.clearAllMocks(); // Clear all mocks before each test
  });

  // it('should fetch active coins from the database and update payment gateway coins based on Transak data', async () => {
  //   Coin.find.mockResolvedValue([
  //     { _id: '6135cbd122183c78cdd83948', coin_name: 'VITE', coin_code: 'vite' },
  //     { _id: '6148891ec2f80d5b9b61f128', coin_name: 'DIA', coin_code: 'dia' },
  //   ]);
  
  //   PaymentGatewayCoins.bulkWrite.mockResolvedValue();
  //   PaymentGatewayCoins.updateMany.mockResolvedValue();
  
  //   const transakResponse = {
  //     response: [
  //       { symbol: 'DIA', isPayInAllowed: true },
  //       { symbol: 'VITE', isPayInAllowed: false },
  //     ],
  //   };
  //   fetch.mockResponseOnce(JSON.stringify(transakResponse));
  
  //   await addOrUpdatePaymentCoinForTransak();
  
  //   expect(fetch).toHaveBeenCalledWith(`${process.env.TRANSAK_URL}/api/v2/currencies/crypto-currencies`);
  //   expect(fetch).toHaveBeenCalledTimes(1);
  
  //   expect(Coin.find).toHaveBeenCalledWith({ is_active: true }, 'coin_name coin_code');
  
  //   // Corrected to match the expected behavior of updating based on Transak data
  //   const expectedBulkWriteCalls = [
  //     {
  //       updateOne: {
  //         filter: { coin_code: 'DIA' },
  //         update: { $set: { is_active: true } },
  //         upsert: true,
  //       },
  //     },
  //     {
  //       updateOne: {
  //         filter: { coin_code: 'VITE' },
  //         update: { $set: { is_active: false } },
  //         upsert: true,
  //       },
  //     },
  //   ];
  //   // expect(PaymentGatewayCoins.bulkWrite).toHaveBeenCalledWith(expectedBulkWriteCalls);
  //   console.log(PaymentGatewayCoins.bulkWrite.mock.calls[0][0]);
  
  //   // expect(PaymentGatewayCoins.updateMany).toHaveBeenCalledWith(
  //   //   { provider_name: 'TRANSAK', gateway_coin_code: { $nin: ['DIA', 'VITE'] } },
  //   //   { $set: { is_active: false } },
  //   // );
  // });

  it('should log error if fetch fails', async () => {
    Coin.find.mockResolvedValue([
      { _id: '6135cbd122183c78cdd83948', coin_name: 'VITE', coin_code: 'vite' },
      { _id: '6148891ec2f80d5b9b61f128', coin_name: 'DIA', coin_code: 'dia' },
    ]);

    fetch.mockResolvedValueOnce({ status: 500, text: () => Promise.resolve('Status error') });

    console.log = jest.fn();

    await addOrUpdatePaymentCoinForTransak();

    expect(console.log).toHaveBeenCalledWith('TransakStatuscode', 500);
    expect(console.log).toHaveBeenCalledWith('------------------ payment coin for transak ended ---------------');
  });

  it('should handle errors gracefully', async () => {
    Coin.find.mockRejectedValue(new Error('Database error'));

    console.log = jest.fn();

    await addOrUpdatePaymentCoinForTransak();

    expect(console.log).toHaveBeenCalledWith('error at add or update transak coins cron', expect.any(Error));
  });
});
