# Sonic Odyssey Bot

Sonic Odyssey Bot is an application designed for interacting with the Sonic Odyssey platform. It supports multiple features including sending SOL (Solana) cryptocurrency transactions, claiming rewards, opening mystery boxes, and daily login operations.

## Features

- **Transaction Sending**: Sends SOL transactions from multiple accounts to the same addresses but randomly.
- **Daily Login**: Automates the daily login process.
- **Claim Box**: Automates the process of claiming rewards boxes.
- **Open Box**: Automates the process of opening mystery boxes.
- **Input Methods**: Supports input private keys.
- **Performance**: First, it performs 100 transactions for each wallet (so that the robot cannot be identified in any way) and then > Daily Login > Claim Box > Open Box

## Prerequisites

- Node.js installed on your machine
- `npm` or `yarn` package manager

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/dante4rt/sonic-odyssey-bot.git
   ```

2. Navigate into the project directory:

   ```bash
   cd sonic-odyssey-bot
   ```

3. Install dependencies:

   ```bash
   npm install
   # or
   yarn install
   ```

4. Prepare input files:

   - Create `nano privateKeys.json` with an array of private keys (base58 encoded).


   Example `privateKeys.json`:
   ```json
   [
     "base58_private_key_1",
     "base58_private_key_2",
     "base58_private_key_3"
   ]
   ```

## Usage

Run the bot using Node.js:

```bash
npm start
```

or

```bash
npm run claim
```


## Donations

If you would like to support the development of this project, you can make a donation using the following addresses:

- **EVM**: `0x83F129E662B21cF035bc9510f65eb29C75b69155`

## Contributing

Contributions are welcome! Feel free to open issues or pull requests for any improvements or fixes.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
