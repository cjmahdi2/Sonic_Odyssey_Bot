const fs = require('fs');
require('colors');
const solana = require('@solana/web3.js');
const axios = require('axios').default;
const base58 = require('bs58');
const nacl = require('tweetnacl');
const { connection, delay } = require('./src/solanaUtils');
const { HEADERS } = require('./src/headers');
const { displayHeader } = require('./src/displayUtils');
const moment = require('moment');

const PRIVATE_KEYS = JSON.parse(fs.readFileSync('privateKeys.json', 'utf-8'));

function getKeypair(privateKey) {
  const decodedPrivateKey = base58.decode(privateKey);
  return solana.Keypair.fromSecretKey(decodedPrivateKey);
}

async function getToken(privateKey) {
  try {
    const { data } = await axios({
      url: 'https://odyssey-api-beta.sonic.game/auth/sonic/challenge',
      params: {
        wallet: getKeypair(privateKey).publicKey,
      },
      headers: HEADERS,
    });

    const sign = nacl.sign.detached(
      Buffer.from(data.data),
      getKeypair(privateKey).secretKey
    );
    const signature = Buffer.from(sign).toString('base64');
    const publicKey = getKeypair(privateKey).publicKey;
    const encodedPublicKey = Buffer.from(publicKey.toBytes()).toString(
      'base64'
    );
    const response = await axios({
      url: 'https://odyssey-api-beta.sonic.game/auth/sonic/authorize',
      method: 'POST',
      headers: HEADERS,
      data: {
        address: publicKey,
        address_encoded: encodedPublicKey,
        signature,
      },
    });

    return response.data.data.token;
  } catch (error) {
    console.log(`Error fetching token: ${error}`.red);
  }
}

async function getProfile(token) {
  try {
    const { data } = await axios({
      url: 'https://odyssey-api-beta.sonic.game/user/rewards/info',
      method: 'GET',
      headers: { ...HEADERS, Authorization: token },
    });

    return data.data;
  } catch (error) {
    console.log(`Error fetching profile: ${error}`.red);
  }
}

async function doTransactions(tx, keypair, retries = 3) {
  try {
    const bufferTransaction = tx.serialize();
    const signature = await connection.sendRawTransaction(bufferTransaction);
    await connection.confirmTransaction(signature);
    return signature;
  } catch (error) {
    if (retries > 0) {
      console.log(`Retrying transaction... (${retries} retries left)`.yellow);
      await new Promise((res) => setTimeout(res, 1000));
      return doTransactions(tx, keypair, retries - 1);
    } else {
      console.log(`Error in transaction: ${error}`.red);
      throw error;
    }
  }
}

async function openMysteryBox(token, keypair, retries = 3) {
  try {
    const { data } = await axios({
      url: 'https://odyssey-api-beta.sonic.game/user/rewards/mystery-box/build-tx',
      method: 'GET',
      headers: { ...HEADERS, Authorization: token },
    });

    const txBuffer = Buffer.from(data.data.hash, 'base64');
    const tx = solana.Transaction.from(txBuffer);
    tx.partialSign(keypair);
    const signature = await doTransactions(tx, keypair);
    const response = await axios({
      url: 'https://odyssey-api-beta.sonic.game/user/rewards/mystery-box/open',
      method: 'POST',
      headers: { ...HEADERS, Authorization: token },
      data: {
        hash: signature,
      },
    });

    return response.data;
  } catch (error) {
    if (retries > 0) {
      console.log(
        `Retrying opening mystery box... (${retries} retries left)`.yellow
      );
      await new Promise((res) => setTimeout(res, 1000));
      return openMysteryBox(token, keypair, retries - 1);
    } else {
      console.log(`Error opening mystery box: ${error}`.red);
      throw error;
    }
  }
}

async function dailyClaim(token) {
  let counter = 1;
  const maxCounter = 3;

  try {
    const fetchDailyResponse = await fetchDaily(token);

    console.log(
      `[ ${moment().format(
        'HH:mm:ss'
      )} ] Your total transactions: ${fetchDailyResponse}`.blue
    );

    if (fetchDailyResponse > 10) {
      while (counter <= maxCounter) {
        try {
          const { data } = await axios({
            url: 'https://odyssey-api.sonic.game/user/transactions/rewards/claim',
            method: 'POST',
            headers: { ...HEADERS, Authorization: token },
            data: {
              stage: counter,
            },
          });

          console.log(
            `[ ${moment().format(
              'HH:mm:ss'
            )} ] Daily claim for stage ${counter} has been successful! Stage: ${counter} | Status: ${
              data.data.claimed
            }`.green
          );

          counter++;
        } catch (error) {
          if (error.response.data.message === 'interact task not finished') {
            console.log(
              `[ ${moment().format(
                'HH:mm:ss'
              )} ] Error claiming for stage ${counter}: ${
                error.response.data.message
              }`.red
            );
            counter++;
          } else if (
            error.response &&
            (error.response.data.code === 100015 ||
              error.response.data.code === 100016)
          ) {
            console.log(
              `[ ${moment().format(
                'HH:mm:ss'
              )} ] Already claimed for stage ${counter}, proceeding to the next stage...`
                .cyan
            );
            counter++;
          } else {
            console.log(
              `[ ${moment().format('HH:mm:ss')} ] Error claiming: ${
                error.response.data.message
              }`.red
            );
          }
        } finally {
          await delay(1000);
        }
      }

      console.log(`All stages processed or max stage reached.`.green);
    } else {
      throw new Error('Not enough transactions to claim rewards.');
    }
  } catch (error) {
    console.log(
      `[ ${moment().format('HH:mm:ss')} ] Error in daily claim: ${
        error.message
      }`.red
    );
  }
}

async function dailyLogin(token, keypair, retries = 3) {
  try {
    const { data } = await axios({
      url: 'https://odyssey-api-beta.sonic.game/user/check-in/transaction',
      method: 'GET',
      headers: { ...HEADERS, Authorization: token },
    });

    const txBuffer = Buffer.from(data.data.hash, 'base64');
    const tx = solana.Transaction.from(txBuffer);
    tx.partialSign(keypair);
    const signature = await doTransactions(tx, keypair);

    const response = await axios({
      url: 'https://odyssey-api-beta.sonic.game/user/check-in',
      method: 'POST',
      headers: { ...HEADERS, Authorization: token },
      data: {
        hash: signature,
      },
    });

    return response.data;
  } catch (error) {
    if (error.response.data.message === 'current account already checked in') {
      console.log(
        `[ ${moment().format('HH:mm:ss')} ] Error in daily login: ${
          error.response.data.message
        }`.red
      );
    } else {
      console.log(
        `[ ${moment().format('HH:mm:ss')} ] Error claiming: ${
          error.response.data.message
        }`.red
      );
    }
  }
}

async function fetchDaily(token) {
  try {
    const { data } = await axios({
      url: 'https://odyssey-api-beta.sonic.game/user/transactions/state/daily',
      method: 'GET',
      headers: { ...HEADERS, Authorization: token },
    });

    return data.data.total_transactions;
  } catch (error) {
    console.log(
      `[ ${moment().format('HH:mm:ss')} ] Error in daily fetching: ${
        error.response.data.message
      }`.red
    );
  }
}

async function processPrivateKey(privateKey, method) {
  try {
    const publicKey = getKeypair(privateKey).publicKey.toBase58();
    const token = await getToken(privateKey);
    const profile = await getProfile(token);

    if (profile.wallet_balance > 0) {
      const balance = profile.wallet_balance / solana.LAMPORTS_PER_SOL;
      const ringBalance = profile.ring;
      const availableBoxes = profile.ring_monitor;
      console.log(
        `Hello ${publicKey}! Welcome to our bot. Here are your details:`.green
      );
      console.log(`Solana Balance: ${balance} SOL`.green);
      console.log(`Ring Balance: ${ringBalance}`.green);
      console.log(`Available Box(es): ${availableBoxes}`.green);
      console.log('');

      switch (method) {
        case '1':
          console.log(`[ ${moment().format('HH:mm:ss')} ] Please wait...`.yellow);
          await dailyClaim(token);
          console.log(
            `[ ${moment().format('HH:mm:ss')} ] All tasks completed!`.cyan
          );
          break;
        case '2':
          console.log(
            `[ ${moment().format(
              'HH:mm:ss'
            )} ] We are proceeding with your daily login!`.yellow
          );
          await dailyLogin(token, getKeypair(privateKey));
          break;
        case '3':
          await openMysteryBox(token, getKeypair(privateKey));
          break;
        default:
          console.log('Invalid method!'.red);
      }
    } else {
      console.log(`No balance found for ${publicKey}`.yellow);
    }
  } catch (error) {
    throw new Error(`Error in processing private key: ${error.message}`);
  }
}

(async () => {
  try {
    displayHeader();
    const methods = ['3', '1', '2']; // لیستی از متدها

    const failedKeys = []; // لیستی برای ثبت کلیدهای خصوصی که با شکست مواجه شدند

    for (let i = 0; i < PRIVATE_KEYS.length; i++) {
      const privateKey = PRIVATE_KEYS[i];
      let attempts = 0;  // تعداد تلاش‌ها
      const maxAttempts = 3;  // تعداد تلاش‌های مجاز

      while (attempts < maxAttempts) {
        try {
          console.log(`Processing private key ${i + 1}, attempt ${attempts + 1}`.yellow);

          // برای هر کلید خصوصی، تمامی متدها را اجرا کنید
          for (const method of methods) {
            await processPrivateKey(privateKey, method);
          }

          // اگر عملیات موفق بود، حلقه را ترک کنید
          break;

        } catch (error) {
          attempts++;
          console.log(`Error processing private key ${i + 1}: ${error}`.red);

          if (attempts >= maxAttempts) {
            console.log(`Failed after ${maxAttempts} attempts for key ${i + 1}.`.red);
            failedKeys.push({ index: i + 1, privateKey });
          } else {
            console.log(`Retrying for private key ${i + 1} (Attempt ${attempts + 1})...`.yellow);
          }
        }
      }
    }

    console.log('All private keys processed.'.cyan);

    if (failedKeys.length > 0) {
      console.log(`Failed to process the following private keys after ${maxAttempts} attempts:`.red);
      failedKeys.forEach((keyInfo) => {
        console.log(`- Key ${keyInfo.index}`.yellow);
      });
    }
  } catch (error) {
    console.log(`Error in bot operation: ${error}`.red);
  } finally {
    console.log(
      'Thanks for having us! Subscribe: https://t.me/HappyCuanAirdrop'.magenta
    );
  }
})();
