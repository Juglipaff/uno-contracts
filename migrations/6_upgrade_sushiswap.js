const { prepareUpgrade } = require('@openzeppelin/truffle-upgrades')

const Farm = artifacts.require('UnoFarmSushiswap')
const AssetRouter = artifacts.require('UnoAssetRouterSushiswap')

module.exports = async function (deployer, network) {
    if (network != "polygon") return

    //AssetRouter upgrade
    const assetRouter = await AssetRouter.deployed()
    const impl = await prepareUpgrade(assetRouter.address, AssetRouter, { deployer })

    //Farm upgrade
    await deployer.deploy(Farm) 

    console.log('New Router implementation:', impl)         //UpgradeTo(newImplementation)
    console.log('New Farm implementation:', Farm.address)   //UpgradeFarms(newImplementation)
    //Create proposals using Openzeppelin Defender UI
}