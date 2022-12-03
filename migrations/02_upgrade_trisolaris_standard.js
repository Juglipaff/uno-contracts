const Farm = artifacts.require('UnoFarmTrisolarisStandard')
const AssetRouter = artifacts.require('UnoAssetRouterTrisolarisStandard')

require('dotenv').config()
const ethers = require('ethers')
const { prepareUpgrade } = require('@openzeppelin/truffle-upgrades')
const fs = require('fs/promises')
const path = require('path')
const { AdminClient } = require('defender-admin-client')

const client = new AdminClient({ apiKey: process.env.DEFENDER_ACCOUNT, apiSecret: process.env.DEFENDER_PASSWORD })

async function readAddress(app) {
    const data = await fs.readFile(path.resolve(__dirname, './addresses/addresses.json'))
    const json = JSON.parse(data)

    return json[app]
}

module.exports = async (deployer, network) => {
    if (network !== 'aurora') return

    const multisig = await readAddress('multisig')
    const timelockAddress = await readAddress('timelock')
    {
        // AssetRouter upgrade
        const UnoAssetRouter = await readAddress('trisolarisStandard-router')
        const impl = await prepareUpgrade(UnoAssetRouter, AssetRouter, { deployer })
        console.log('New Router implementation:', impl) // UpgradeTo(newImplementation)

        const ABI = ['function UpgradeTo(address newImplementation)']
        const data = (new ethers.utils.Interface(ABI)).encodeFunctionData('UpgradeTo', [impl])
        const timelock = {
            target: UnoAssetRouter,
            value: '0',
            data,
            salt: ethers.BigNumber.from(ethers.utils.randomBytes(32))._hex,
            address: timelockAddress,
            delay: '172800'
        }
        timelock.operationId = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'bytes', 'bytes32', 'bytes32'],
            [timelock.target, timelock.value, timelock.data, '0x0000000000000000000000000000000000000000000000000000000000000000', timelock.salt]
        ))

        const proposal = await client.createProposal({
            contractId: `aurora-${UnoAssetRouter}`, // Target contract
            title: 'Remove payable from withdrawETH', // Title of the proposal
            description: 'Remove payable modifier from withdrawETH', // Description of the proposal
            type: 'custom', // Use 'custom' for custom admin actions
            targetFunction: { name: 'upgradeTo', inputs: [{ type: 'address', name: 'newImplementation' }] }, // Function ABI
            functionInputs: [impl], // Arguments to the function
            via: multisig, // Address to execute proposal
            viaType: 'Gnosis Safe', // 'Gnosis Safe', 'Gnosis Multisig', or 'EOA'
            timelock,
            metadata: { sendValue: '0' },
            isArchived: false
        })
        console.log('Proposal:', proposal.url)
    }

    {
        // Farm upgrade
        const UnoFarmFactory = await readAddress('trisolarisStandard-factory')

        await deployer.deploy(Farm)
        const impl = Farm.address
        console.log('New Farm implementation:', impl) // UpgradeFarms(newImplementation)

        const ABI = ['function UpgradeFarms(address newImplementation)']
        const data = (new ethers.utils.Interface(ABI)).encodeFunctionData('UpgradeFarms', [impl])
        const timelock = {
            target: UnoFarmFactory,
            value: '0',
            data,
            salt: ethers.BigNumber.from(ethers.utils.randomBytes(32))._hex,
            address: timelockAddress,
            delay: '172800'
        }
        timelock.operationId = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(
            ['address', 'uint256', 'bytes', 'bytes32', 'bytes32'],
            [timelock.target, timelock.value, timelock.data, '0x0000000000000000000000000000000000000000000000000000000000000000', timelock.salt]
        ))

        const proposal = await client.createProposal({
            contractId: `aurora-${UnoFarmFactory}`, // Target contract
            title: 'Remove payable from withdrawETH', // Title of the proposal
            description: 'Remove payable modifier from withdrawETH', // Description of the proposal
            type: 'custom', // Use 'custom' for custom admin actions
            targetFunction: { name: 'UpgradeFarms', inputs: [{ type: 'address', name: 'newImplementation' }] }, // Function ABI
            functionInputs: [impl], // Arguments to the function
            via: multisig, // Address to execute proposal
            viaType: 'Gnosis Safe', // 'Gnosis Safe', 'Gnosis Multisig', or 'EOA'
            timelock,
            metadata: { sendValue: '0' },
            isArchived: false
        })
        console.log('Proposal:', proposal.url)
    }
}
