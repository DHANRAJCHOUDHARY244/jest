/* eslint-disable */
const fetch = require('node-fetch');
require('dotenv').config();
jest.mock('../models/coin');
jest.mock('../models/payment_gateway_coins');
jest.mock('node-fetch', () => require('jest-fetch-mock'));
const { addOrUpdatePaymentCoinForTransak } = require('../cron/paymentCoins/transak.paymentCoin');
const { Coin } = require('../models/coin');
const { PaymentGatewayCoins } = require('../models/payment_gateway_coins');
const e = require('cors');


test('test mongodb', async () => {
    Coin.find.mockResolvedValue([
      { coin_name: 'Bitcoin', coin_code: 'btc',_id:'123' },
      { coin_name: 'Ethereum', coin_code: 'eth',_id:'234' },
    ]);
    const transakData=[
        { symbol: 'BTC', isAllowed: true },
        { symbol: 'ETH', isAllowed: true },
    ]
    fetch.mockResolvedValueOnce({
        status: 200,
        json: () => ({ response: transakData }),
      });
    PaymentGatewayCoins.bulkWrite.mockResolvedValue();
    PaymentGatewayCoins.updateMany.mockResolvedValue();
  
  await addOrUpdatePaymentCoinForTransak();
  expect(Coin.find).toHaveBeenCalledWith({ is_active: true }, 'coin_name coin_code');
  expect(fetch).toHaveBeenCalledWith(`${process.env.TRANSAK_URL}/api/v2/currencies/crypto-currencies`);
// Step 1: Define the bulk operations for ETH and BTC separately
const ethBulkOperation = {
    updateOne: {
      filter: { gateway_coin_code: 'ETH', provider_name: 'transak' },
      update: {
        $setOnInsert: {
          is_buy_supported: true,
          buy_fee_perc: null,
          sell_fee_perc: null,
          buy_rate: null,
          sell_rate: null,
          buy_fiat_min_amount: null,
          buy_fiat_max_amount: null,
          sell_fiat_min_amount: null,
          sell_fiat_max_amount: null,
          buy_crypto_min_amount: null,
          buy_crypto_max_amount: null,
          buy_withdraw_fees: null,
        },
        $set: {
          coin_id: '234',
          is_sell_supported: false,
        },
      },
      upsert: true,
    },
  };
  
  const btcBulkOperation = {
    updateOne: {
      filter: { gateway_coin_code: 'BTC', provider_name: 'transak' },
      update: {
        $setOnInsert: {
          is_buy_supported: true,
          buy_fee_perc: null,
          sell_fee_perc: null,
          buy_rate: null,
          sell_rate: null,
          buy_fiat_min_amount: null,
          buy_fiat_max_amount: null,
          sell_fiat_min_amount: null,
          sell_fiat_max_amount: null,
          buy_crypto_min_amount: null,
          buy_crypto_max_amount: 7,
          buy_withdraw_fees: null,
        },
        $set: {
          coin_id: '123',
          is_sell_supported: false,
        },
      },
      upsert: true,
    },
  };
  
  expect(PaymentGatewayCoins.bulkWrite).toHaveBeenCalledWith([ btcBulkOperation,ethBulkOperation]);
  expect(PaymentGatewayCoins.updateMany).toHaveBeenCalledWith(
    { provider_name: 'transak', gateway_coin_code: { $nin: ['BTC', 'ETH'] } },
        { $set: { is_active: false } },
  );
});



