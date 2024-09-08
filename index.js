const fs = require('fs');
const bs58 = require('bs58');
const colors = require('colors');
const { Keypair, PublicKey } = require('@solana/web3.js');
const {
  sendSol,
  connection,
  LAMPORTS_PER_SOL,
  delay,
} = require('./src/solanaUtils');

// تابع برای تبدیل Base58 به Uint8Array
function base58ToUint8Array(base58String) {
  return bs58.decode(base58String);
}

// تابع برای تبدیل کلید خصوصی به آدرس عمومی
function getPublicKeyFromPrivateKey(privateKeyBase58) {
  try {
    const secretKey = base58ToUint8Array(privateKeyBase58);
    const keypair = Keypair.fromSecretKey(secretKey);
    return keypair.publicKey.toString();
  } catch (error) {
    throw new Error(`Error in getPublicKeyFromPrivateKey: ${error.message}`);
  }
}

// تابع برای تبدیل کلید خصوصی به Keypair
function getKeypairFromPrivateKey(privateKeyBase58) {
  try {
    const secretKey = base58ToUint8Array(privateKeyBase58);
    return Keypair.fromSecretKey(secretKey);
  } catch (error) {
    throw new Error(`Error in getKeypairFromPrivateKey: ${error.message}`);
  }
}

// تابع برای تولید مقدار تصادفی بین min و max
function getRandomAmount(min, max) {
  return (Math.random() * (max - min) + min).toFixed(8);
}

// تابع برای تولید تأخیر تصادفی بین min و max
function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// تابع برای تلاش مجدد ارسال SOL در صورت بروز خطا
async function sendWithRetry(fromKeypair, toPublicKey, amount, maxRetries = 3) {
  let attempts = 0;
  while (attempts < maxRetries) {
    try {
      await sendSol(fromKeypair, toPublicKey, amount);
      return; // اگر موفق شد، تابع را ترک کنید
    } catch (error) {
      attempts++;
      console.error(colors.red(`Attempt ${attempts} failed to send SOL to ${toPublicKey.toString()}:`), error);
      if (attempts >= maxRetries) {
        console.error(colors.red(`All ${maxRetries} attempts failed. Moving to next transaction.`));
      }
      await delay(getRandomDelay(100, 500)); // تأخیر تصادفی بین تلاش‌ها
    }
  }
}

// بررسی وجود فایل wallets.json
const walletsFilePath = 'wallets.json';
let walletsData = [];

// مرحله ۱: اگر wallets.json وجود نداشته باشد، آدرس‌ها را از privateKeys.json تولید می‌کنیم
if (!fs.existsSync(walletsFilePath) || JSON.parse(fs.readFileSync(walletsFilePath, 'utf-8')).length === 0) {
  console.log(colors.yellow('No wallet addresses found. Generating from privateKeys.json...'));
  
  // خواندن کلیدهای خصوصی از فایل privateKeys.json
  const privateKeys = JSON.parse(fs.readFileSync('privateKeys.json', 'utf-8'));

  // تبدیل کلیدهای خصوصی به آدرس‌های عمومی و ذخیره در wallets.json
  walletsData = privateKeys.map(privateKeyBase58 => {
    return {
      address: getPublicKeyFromPrivateKey(privateKeyBase58),
      privateKey: privateKeyBase58
    };
  });

  // ذخیره آدرس‌ها و کلیدهای خصوصی در فایل wallets.json
  fs.writeFileSync(walletsFilePath, JSON.stringify(walletsData, null, 2));
  console.log(colors.green('Addresses and private keys have been saved to wallets.json'));
} else {
  // اگر wallets.json وجود دارد، اطلاعات را از آن می‌خوانیم
  console.log(colors.green('Wallet addresses found in wallets.json. Skipping key generation.'));
  walletsData = JSON.parse(fs.readFileSync(walletsFilePath, 'utf-8'));
}

(async () => {
  // مرحله ۲: شروع انجام تراکنش‌ها

  // حداقل موجودی برای اجتناب از هزینه‌ی اجاره
  let rentExemptionAmount;
  try {
    rentExemptionAmount =
      (await connection.getMinimumBalanceForRentExemption(0)) / LAMPORTS_PER_SOL;
    console.log(
      colors.yellow(
        `Minimum balance required for rent exemption: ${rentExemptionAmount} SOL`
      )
    );
  } catch (error) {
    console.error(
      colors.red(
        'Failed to fetch minimum balance for rent exemption. Using default value.'
      )
    );
    rentExemptionAmount = 0.001; // مقدار پیش‌فرض در صورت خطا
  }

  // ارسال 100 تراکنش برای هر کلید خصوصی
  const numTransactions = 100;
  const numWallets = walletsData.length;

  for (let txIndex = 0; txIndex < numTransactions; txIndex++) {
    console.log(colors.yellow(`Starting transaction batch ${txIndex + 1} of ${numTransactions}`));

    // برای هر کلید خصوصی تراکنش انجام دهید
    for (const senderWallet of walletsData) {
      const fromKeypair = getKeypairFromPrivateKey(senderWallet.privateKey);

      // انتخاب تصادفی آدرس گیرنده
      const recipientAddress = walletsData[Math.floor(Math.random() * numWallets)].address;
      const toPublicKey = new PublicKey(recipientAddress);

      // تولید مقدار تصادفی بین 0.00001 و 0.00009
      const amountToSend = parseFloat(getRandomAmount(0.00001, 0.00009));
      
      // تولید تأخیر تصادفی بین 1 تا 20 میلی‌ثانیه
      const delayBetweenTx = getRandomDelay(1, 20);

      try {
        await sendWithRetry(fromKeypair, toPublicKey, amountToSend);
        console.log(
          colors.green(
            `Successfully sent ${amountToSend} SOL from ${fromKeypair.publicKey.toString()} to ${recipientAddress}`
          )
        );
      } catch (error) {
        console.error(colors.red(`Failed to send SOL to ${recipientAddress}:`), error);
      }
      await delay(delayBetweenTx);
    }
  }
})();
