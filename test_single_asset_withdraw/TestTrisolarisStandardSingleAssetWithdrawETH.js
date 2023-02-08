const {
    expectRevert, expectEvent, BN, constants
} = require('@openzeppelin/test-helpers')
const { deployProxy } = require('@openzeppelin/truffle-upgrades')

const IUniswapV2Pair = artifacts.require('IUniswapV2Pair')

const AccessManager = artifacts.require('UnoAccessManager')
const FarmFactory = artifacts.require('UnoFarmFactory')

const Farm = artifacts.require('UnoFarmTrisolarisStandard')
const AssetRouter = artifacts.require('UnoAssetRouterTrisolarisStandard')

const pool = '0x2fe064B6c7D274082aa5d2624709bC9AE7D16C77' // usdt usdc

const DAIHolder = '0xD0B53c43D3E0B58909c38487AA0C3af7DFa2d8C0'// has to be unlocked and hold 0xf28164A485B0B2C90639E47b0f377b4a438a16B1

approxeq = (bn1, bn2, epsilon, message) => {
    const amountDelta = bn1.sub(bn2).add(epsilon)
    assert.ok(!amountDelta.isNeg(), message)
}

contract('UnoAssetRouterTrisolarisStandardSingleAssetWithdrawETH', (accounts) => {
    const admin = accounts[0]

    let accessManager
    let assetRouter
    let DAIToken

    before(async () => {
        const implementation = await Farm.new({ from: admin })
        accessManager = await AccessManager.new({ from: admin })// accounts[0] is admin
        assetRouter = await deployProxy(AssetRouter, { kind: 'uups', initializer: false })
        await FarmFactory.new(implementation.address, accessManager.address, assetRouter.address, { from: admin })
        DAIToken = await IUniswapV2Pair.at('0xe3520349F477A5F6EB06107066048508498A291b')
    })

    describe('Single Asset Withdraw', () => {
        describe('withdraw ETH', () => {
            let stakeLPBefore
            let ethBalanceBefore
            let ethSpentOnGas

            before(async () => {
                const DAIAmount = new BN('1000000000000000000000') // 1000$
                await DAIToken.approve(assetRouter.address, DAIAmount, { from: DAIHolder })
                const tokenAData = `0x12aa3caf00000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf07000000000000000000000000e3520349f477a5f6eb06107066048508498a291b0000000000000000000000004988a896b1227218e4a686fde5eabdcabd91571f00000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf07000000000000000000000000${assetRouter.address.substring(2).toLowerCase()}00000000000000000000000000000000000000000000001b1ae4d6e2ef500000000000000000000000000000000000000000000000000000000000000c9e9af00000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000055e00000000000000000000000000000000000000000000000000000000054000a0c9e75c480000000000000403020100000000000000000000000000000000000000051200039100021000018100a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c20e3520349f477a5f6eb06107066048508498a291bbb310ef4fac855f2f49d8fb35a2da8f639b3464e6ae4071138002dc6c0bb310ef4fac855f2f49d8fb35a2da8f639b3464e2f41af687164062f118297ca10751f4b55478ae1000000000000000000000000000000000000000000000000000000000161eadce3520349f477a5f6eb06107066048508498a291b00206ae40711b8002dc6c02f41af687164062f118297ca10751f4b55478ae12639f48ace89298fa2e874ef2e26d4576058ae6d0000000000000000000000000000000000000000000000000031c79e63c4defab12bfca5a55806aaf64e99521918a4bf0fc4080200206ae4071138002dc6c02639f48ace89298fa2e874ef2e26d4576058ae6d1111111254eeb25477b68fb85ed929f73a96058200000000000000000000000000000000000000000000000000000000014394a6c9bdeed33cd01541e1eed10f90519d2c06fe3feb0c20e3520349f477a5f6eb06107066048508498a291b2c4d78a40bab1a6cbb4b59297cd7b2eba21128ef6ae4071138002dc6c02c4d78a40bab1a6cbb4b59297cd7b2eba21128ef1111111254eeb25477b68fb85ed929f73a96058200000000000000000000000000000000000000000000000000000000027c8ff3e3520349f477a5f6eb06107066048508498a291b00a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c20e3520349f477a5f6eb06107066048508498a291b28058325c9d1779b74f5b6ae9ecd83e30bc961b16ae4071138002dc6c028058325c9d1779b74f5b6ae9ecd83e30bc961b120f8aefb5697b77e0bb835a8518be70775cda1b000000000000000000000000000000000000000000015fc8c37d9794d7af35c99e3520349f477a5f6eb06107066048508498a291b00206ae4071138002dc6c020f8aefb5697b77e0bb835a8518be70775cda1b02fe064b6c7d274082aa5d2624709bc9ae7d16c770000000000000000000000000000000000000000000000000000000003c1abfcc42c30ac6cc15fac9bd938618bcaa1a1fae8501d00206ae4071138002dc6c02fe064b6c7d274082aa5d2624709bc9ae7d16c771111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000003c0d5c9b12bfca5a55806aaf64e99521918a4bf0fc4080200a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c20e3520349f477a5f6eb06107066048508498a291b3f239d83af94f836b93910d29704def88542e2a76ae4071138002dc6c03f239d83af94f836b93910d29704def88542e2a763da4db6ef4e7c62168ab03982399f9588fcd19800000000000000000000000000000000000000000000000000ba54e837e9bc71e3520349f477a5f6eb06107066048508498a291b00206ae4071138002dc6c063da4db6ef4e7c62168ab03982399f9588fcd19803b666f3488a7992b2385b12df7f35156d7b29cd0000000000000000000000000000000000000000001dda32a5af5a6ecfff7bc9c9bdeed33cd01541e1eed10f90519d2c06fe3feb00206ae4071138002dc6c003b666f3488a7992b2385b12df7f35156d7b29cd1111111254eeb25477b68fb85ed929f73a96058200000000000000000000000000000000000000000000000000000000051da08dc42c30ac6cc15fac9bd938618bcaa1a1fae8501d0000cfee7c08`
                const tokenBData = `0x12aa3caf00000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf07000000000000000000000000e3520349f477a5f6eb06107066048508498a291b000000000000000000000000b12bfca5a55806aaf64e99521918a4bf0fc4080200000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf07000000000000000000000000${assetRouter.address.substring(2).toLowerCase()}00000000000000000000000000000000000000000000001b1ae4d6e2ef500000000000000000000000000000000000000000000000000000000000000ca89cac0000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000055e00000000000000000000000000000000000000000000000000000000054000a0c9e75c480000000000000403020100000000000000000000000000000000000000051200039100021000018100a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c20e3520349f477a5f6eb06107066048508498a291b2c4d78a40bab1a6cbb4b59297cd7b2eba21128ef6ae4071138002dc6c02c4d78a40bab1a6cbb4b59297cd7b2eba21128ef2639f48ace89298fa2e874ef2e26d4576058ae6d00000000000000000000000000000000000000000000000000000000015a60f2e3520349f477a5f6eb06107066048508498a291b00206ae40711b8002dc6c02639f48ace89298fa2e874ef2e26d4576058ae6d2f41af687164062f118297ca10751f4b55478ae1000000000000000000000000000000000000000000000000002cd7dd1ed7de084988a896b1227218e4a686fde5eabdcabd91571f00206ae4071138002dc6c02f41af687164062f118297ca10751f4b55478ae11111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000001380f5dc9bdeed33cd01541e1eed10f90519d2c06fe3feb0c20e3520349f477a5f6eb06107066048508498a291bbb310ef4fac855f2f49d8fb35a2da8f639b3464e6ae4071138002dc6c0bb310ef4fac855f2f49d8fb35a2da8f639b3464e1111111254eeb25477b68fb85ed929f73a96058200000000000000000000000000000000000000000000000000000000029770a3e3520349f477a5f6eb06107066048508498a291b00a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c20e3520349f477a5f6eb06107066048508498a291b28058325c9d1779b74f5b6ae9ecd83e30bc961b16ae4071138002dc6c028058325c9d1779b74f5b6ae9ecd83e30bc961b103b666f3488a7992b2385b12df7f35156d7b29cd00000000000000000000000000000000000000000015fc8c37d9794d7af35c99e3520349f477a5f6eb06107066048508498a291b00206ae4071138002dc6c003b666f3488a7992b2385b12df7f35156d7b29cd2fe064b6c7d274082aa5d2624709bc9ae7d16c770000000000000000000000000000000000000000000000000000000003c4a407c42c30ac6cc15fac9bd938618bcaa1a1fae8501d00206ae40711b8002dc6c02fe064b6c7d274082aa5d2624709bc9ae7d16c771111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000003bf84314988a896b1227218e4a686fde5eabdcabd91571f00a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c20e3520349f477a5f6eb06107066048508498a291b3f239d83af94f836b93910d29704def88542e2a76ae4071138002dc6c03f239d83af94f836b93910d29704def88542e2a763da4db6ef4e7c62168ab03982399f9588fcd19800000000000000000000000000000000000000000000000000ba54e837e9bc71e3520349f477a5f6eb06107066048508498a291b00206ae4071138002dc6c063da4db6ef4e7c62168ab03982399f9588fcd19820f8aefb5697b77e0bb835a8518be70775cda1b00000000000000000000000000000000000000000001dda32a5af5a6ecfff7bc9c9bdeed33cd01541e1eed10f90519d2c06fe3feb00206ae4071138002dc6c020f8aefb5697b77e0bb835a8518be70775cda1b01111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000000000000000519987bc42c30ac6cc15fac9bd938618bcaa1a1fae8501d0000cfee7c08`
                await assetRouter.depositSingleAsset(pool, DAIToken.address, DAIAmount, [tokenAData, tokenBData], 0, 0, DAIHolder, { from: DAIHolder })

                ethBalanceBefore = new BN(await web3.eth.getBalance(DAIHolder));
                ({
                    stakeLP: stakeLPBefore
                } = await assetRouter.userStake(DAIHolder, pool))
            })
            it('fires events', async () => {
                const tokenAData = `0x12aa3caf00000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf070000000000000000000000004988a896b1227218e4a686fde5eabdcabd91571f000000000000000000000000c9bdeed33cd01541e1eed10f90519d2c06fe3feb00000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf07000000000000000000000000${assetRouter.address.substring(2).toLowerCase()}000000000000000000000000000000000000000000000000000000000ee6b280000000000000000000000000000000000000000000000000010b99edcb2bd5cb0000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000028000000000000000000000000000000000000000000000000000000000026200a0c9e75c480000000000000000090100000000000000000000000000000000000000000000000000023400011a00a007e5c0d20000000000000000000000000000000000000000000000000000f600008f0c204988a896b1227218e4a686fde5eabdcabd91571f2fe064b6c7d274082aa5d2624709bc9ae7d16c776ae40711b8002dc6c02fe064b6c7d274082aa5d2624709bc9ae7d16c772f41af687164062f118297ca10751f4b55478ae10000000000000000000000000000000000000000000000000000000000bdbc664988a896b1227218e4a686fde5eabdcabd91571f00206ae40711b8002dc6c02f41af687164062f118297ca10751f4b55478ae11111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000000001ac9b88763adcfb12bfca5a55806aaf64e99521918a4bf0fc4080200a007e5c0d20000000000000000000000000000000000000000000000000000f600008f0c204988a896b1227218e4a686fde5eabdcabd91571f03b666f3488a7992b2385b12df7f35156d7b29cd6ae40711b8002dc6c003b666f3488a7992b2385b12df7f35156d7b29cd63da4db6ef4e7c62168ab03982399f9588fcd19800000000000000000000000000000000000000000026dd1ec12b49f53b9cd1c24988a896b1227218e4a686fde5eabdcabd91571f00206ae40711b8002dc6c063da4db6ef4e7c62168ab03982399f9588fcd1981111111254eeb25477b68fb85ed929f73a96058200000000000000000000000000000000000000000000000000f0d03543c827fcc42c30ac6cc15fac9bd938618bcaa1a1fae8501dcfee7c08`
                const tokenBData = `0x12aa3caf00000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf07000000000000000000000000b12bfca5a55806aaf64e99521918a4bf0fc40802000000000000000000000000c9bdeed33cd01541e1eed10f90519d2c06fe3feb00000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf07000000000000000000000000${assetRouter.address.substring(2).toLowerCase()}000000000000000000000000000000000000000000000000000000000ee6b280000000000000000000000000000000000000000000000000010c7baa29298d5b000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001f50000000000000000000000000000000000000000000000000000000001d700a0c9e75c48000000000000000009010000000000000000000000000000000000000000000000000001a900008f0c20b12bfca5a55806aaf64e99521918a4bf0fc408022f41af687164062f118297ca10751f4b55478ae16ae40711b8002dc6c02f41af687164062f118297ca10751f4b55478ae11111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000000001aedaab3f5d5cab12bfca5a55806aaf64e99521918a4bf0fc4080200a007e5c0d20000000000000000000000000000000000000000000000000000f600008f0c20b12bfca5a55806aaf64e99521918a4bf0fc4080220f8aefb5697b77e0bb835a8518be70775cda1b06ae40711b8002dc6c020f8aefb5697b77e0bb835a8518be70775cda1b063da4db6ef4e7c62168ab03982399f9588fcd19800000000000000000000000000000000000000000026fbc59d6632abd8412aabb12bfca5a55806aaf64e99521918a4bf0fc4080200206ae40711b8002dc6c063da4db6ef4e7c62168ab03982399f9588fcd1981111111254eeb25477b68fb85ed929f73a96058200000000000000000000000000000000000000000000000000f18dff7533b791c42c30ac6cc15fac9bd938618bcaa1a1fae8501d0000000000000000000000cfee7c08`
                const receipt = await assetRouter.withdrawSingleETH(pool, stakeLPBefore, [tokenAData, tokenBData], DAIHolder, { from: DAIHolder })

                const gasUsed = new BN(receipt.receipt.gasUsed)
                const effectiveGasPrice = new BN(receipt.receipt.effectiveGasPrice)

                ethSpentOnGas = gasUsed.mul(effectiveGasPrice)

                expectEvent(receipt, 'Withdraw', {
                    lpPool: pool, sender: DAIHolder, recipient: DAIHolder, amount: stakeLPBefore
                })
            })
            it('withdraws ETH from balance', async () => {
                const ethBalanceAfter = new BN(await web3.eth.getBalance(DAIHolder))

                const ethDiff = ethBalanceAfter.sub(ethBalanceBefore.add(ethSpentOnGas))
                assert.ok(ethDiff.gt(new BN(0)), 'Eth Balance not increased')
            })
            it('updates stakes', async () => {
                const { stakeLP } = await assetRouter.userStake(DAIHolder, pool)
                assert.equal(stakeLP.toString(), '0', 'Stake not withdrawn')
            })
            it('updates totalDeposits', async () => {
                const { totalDepositsLP } = await assetRouter.totalDeposits(pool)
                assert.equal(totalDepositsLP.toString(), '0', 'Stake not withdrawn')
            })
        })
    })
})
