require('dotenv').config()
const HDWalletProvider = require('@truffle/hdwallet-provider')

module.exports = {
    contracts_build_directory: './build',

    api_keys: {
        snowtrace: process.env.SNOWTRACE
    },

    networks: {
        optimism: {
            provider: new HDWalletProvider({
                privateKeys: [process.env.PRIVATE_KEY],
                providerOrUrl: 'https://rpc.ankr.com/avalanche',
                chainId: 10,
                pollingInterval: 30000
            }),
            networkCheckTimeout: 10000,
            network_id: 10,
            addressIndex: 0,
            timeoutBlocks: 200
        },
        test: {
            host: '127.0.0.1',
            port: 8545,
            gas: 7500000,
            gasPrice: 1000000000,
            network_id: 10,
            networkCheckTimeout: 10000,
            timeoutBlocks: 200
        }
    },
    plugins: ['truffle-contract-size', 'truffle-plugin-verify'],
    compilers: {
        solc: {
            version: '0.8.10',
            settings: {
                optimizer: {
                    enabled: true,
                    runs: 200
                }
            }
        }
    },

    db: {
        enabled: false
    }
}
