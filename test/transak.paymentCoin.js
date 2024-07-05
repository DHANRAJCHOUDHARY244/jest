const fetch = require('node-fetch');
const { Coin } = require('../../models/coin');
const { PaymentGatewayCoins } = require('../../models/payment_gateway_coins');
const { GatewaySupportCurrency } = require('../../models/gateway_support_currency');
const { minMaxMarginOfError } = require('../../utilities/minMaxMargin');
const { PROVIDER_NAME_TRANSAK } = require('../cron/common/constants.common');

const FETCH_RATE_TIMEOUT_MS = 10_000;

/**
 * This function synchronizes the active coins in our database with the cryptocurrencies available on Transak.
 * It performs the following steps:
 * 1. Fetches all active coins from our database.
 * 2. Requests the list of cryptocurrencies available on Transak.
 * 3. Filters out the coins that are both active in our database and available on Transak.
 * 4. Updates the payment gateway coins in our database to reflect the current state of availability on Transak.
 */

function avg(arr) {
  const filteredArr = arr.filter(d => Number(d));
  return filteredArr.length ? filteredArr.reduce((acc, v) => acc + Number(v), 0) / filteredArr.length : 0;
}

exports.addOrUpdatePaymentCoinForTransak = async function () {
  console.log('------------------ payment for transak started ---------------');
  try {
    const existingCoinIds = await Coin.find({ is_active: true }, 'coin_name coin_code');
    const coinCodeIdMap = existingCoinIds.reduce(
      (acc, { coin_code: coinCode, _id }) => ({ ...acc, [coinCode]: _id }),
      {},
    );

    const url = `${process.env.TRANSAK_URL}/api/v2/currencies/crypto-currencies`;
    const response = await fetch(url);

    if (response.status !== 200) {
      console.log('TransakStatuscode', response.status);
      console.log('------------------ payment coin for transak ended ---------------');
      return;
    }

    const responseData = await response.json();
    // const paymentCoinDocs = await PaymentGatewayCoins.find({  provider_name: PROVIDER_NAME_TRANSAK,  gateway_coin_code: { $in: vendorCryptoSymbolArr },},'is_active gateway_coin_code',);
    // const coinIsActiveObj = paymentCoinDocs.reduce((acc, { gateway_coin_code: gatewayCoinCode, is_active: isActive }) => ({ ...acc, [gatewayCoinCode]: isActive }),{}, );
    const transakSellCryptoData = responseData.response.reduce(
      (acc, data) => ({
        ...acc,
        [data.symbol]: !acc[data.symbol] && data.isPayInAllowed ? true : acc[data.symbol] || false,
      }),
      {},
    );
    const vendorCryptoSymbolArr = responseData.response.map(d => d.symbol);

    const bulkOperations = responseData.response.map(supportedCoin => ({
      updateOne: {
        filter: { gateway_coin_code: supportedCoin.symbol, provider_name: PROVIDER_NAME_TRANSAK },
        update: {
          $setOnInsert: {
            // is_active: !supportedCoin.isAllowed ? supportedCoin.isAllowed : coinIsActiveObj[supportedCoin.symbol] || false, // supportedCoin.isAllowed,
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
            coin_id: coinCodeIdMap[supportedCoin.symbol.toLowerCase()] || null,
            is_sell_supported: transakSellCryptoData[supportedCoin.symbol] || false,
          },
        },
        upsert: true,
      },
    }));

    await PaymentGatewayCoins.bulkWrite(bulkOperations);

    await PaymentGatewayCoins.updateMany(
      { provider_name: PROVIDER_NAME_TRANSAK, gateway_coin_code: { $nin: vendorCryptoSymbolArr } },
      { $set: { is_active: false } },
    );
  } catch (err) {
    console.log('error at add or update transak coins cron', err);
  }

  console.log('------------------ payment for transak ended ---------------');
};

exports.transakMinOrMaxForCrypto = async function (isMinCron = true) {
  console.log(`------------ ${isMinCron ? 'min' : 'max'} transak crypto started ----------------`);
  try {
    const [supportedCurrencies, supportedCoins] = await Promise.all([
      GatewaySupportCurrency.find(
        { is_active: true, provider_name: PROVIDER_NAME_TRANSAK, is_sell_supported: true },
        { currency_code: 1, vendor_config: 1 },
      ).lean(),
      PaymentGatewayCoins.find(
        { is_active: true, provider_name: PROVIDER_NAME_TRANSAK, is_sell_supported: true },
        { gateway_coin_code: 1, supported_network_code: 1 },
      ).lean(),
    ]);

    // vendor config obj
    const MIN_AMOUNT = Number.MIN_SAFE_INTEGER;
    const MAX_AMOUNT = Number.MAX_SAFE_INTEGER;

    const cryptoAndCoinRequestPromiseObj = supportedCoins.reduce(
      (acc, { gateway_coin_code: coin, supported_network_code: supportedNetworkCode }) => {
        if (!acc[coin]) acc[coin] = [];
        supportedCurrencies.forEach(({ currency_code: currency }) => {
          const requestQueryObj = {
            fiatCurrency: currency.toUpperCase(),
            cryptoCurrency: coin.toUpperCase(),
            cryptoAmount: isMinCron ? MIN_AMOUNT : MAX_AMOUNT,
            isBuyOrSell: 'SELL',
          };
          if (supportedNetworkCode) {
            requestQueryObj.network = supportedNetworkCode;
          }
          const url = `${process.env.TRANSAK_URL}/api/v2/currencies/price?${new URLSearchParams(
            requestQueryObj,
          ).toString()}`;
          acc[coin].push(
            fetch(url, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
              },
              timeout: FETCH_RATE_TIMEOUT_MS,
            }),
          );
        });
        return acc;
      },
      {},
    );

    // to get the min and max
    const resultObj = {};

    // Gather all promises from the initial loop
    const coinPromises = Object.keys(cryptoAndCoinRequestPromiseObj).map(async coin => {
      const allCoinRequests = cryptoAndCoinRequestPromiseObj[coin];
      const responses = await Promise.allSettled(allCoinRequests);

      resultObj[coin] = await Promise.all(
        responses
          .filter(res => res.status === 'fulfilled')
          .map(async res => {
            const resData = await res.value.json();
            let result;
            if (resData.error) {
              result = +resData.error.message.replace(/[^0-9.]/g, '');
            } else {
              result = isMinCron ? 0 : MAX_AMOUNT;
            }
            return result;
          }),
      );
    });

    // Wait for all coinPromises to resolve
    await Promise.all(coinPromises);

    const bulkUpdateArr = [];
    const docSetKey = isMinCron ? 'sell_crypto_min_amount' : 'sell_crypto_max_amount';

    // Iterate over resultObj to prepare bulk update array
    for (const coin in resultObj) {
      if (Object.prototype.hasOwnProperty.call(resultObj, coin)) {
        const minMaxArr = resultObj[coin];
        bulkUpdateArr.push({
          updateOne: {
            filter: { gateway_coin_code: coin, provider_name: PROVIDER_NAME_TRANSAK },
            update: {
              $set: {
                [docSetKey]: +parseFloat(minMaxMarginOfError(avg(minMaxArr), isMinCron, true)).toFixed(8),
              },
            },
          },
        });
      }
    }

    // update the currency
    await PaymentGatewayCoins.bulkWrite(bulkUpdateArr);
  } catch (err) {
    console.log('error at transakMinOrMaxForCurrencies', err);
  }
  console.log(`------------ ${isMinCron ? 'min' : 'max'} transak crypto ended ----------------`);
};
