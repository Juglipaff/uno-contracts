const {
    expectRevert, expectEvent, BN, constants
} = require('@openzeppelin/test-helpers')
const { deployProxy } = require('@openzeppelin/truffle-upgrades')

const AccessManager = artifacts.require('UnoAccessManager')
const FarmFactory = artifacts.require('UnoFarmFactory')

const Farm = artifacts.require('UnoFarmTrisolarisStable')
const IUniswapV2Pair = artifacts.require('IUniswapV2Pair')
const AssetRouter = artifacts.require('UnoAssetRouterTrisolarisStable')

const pool = '0x458459E48dbAC0C8Ca83F8D0b7b29FEfE60c3970' // USDC-USDT-USN

const DAIHolder = '0xD0B53c43D3E0B58909c38487AA0C3af7DFa2d8C0'// has to be unlocked and hold 0xe3520349F477A5F6EB06107066048508498A291b

approxeq = (bn1, bn2, epsilon, message) => {
    const amountDelta = bn1.sub(bn2).add(epsilon)
    assert.ok(!amountDelta.isNeg(), message)
}

contract('UnoAssetRouterTrisolarisStableSingleAssetWithdraw', (accounts) => {
    const admin = accounts[0]

    let accessManager; let assetRouter
    let DAIToken

    before(async () => {
        const implementation = await Farm.new({ from: admin })
        accessManager = await AccessManager.new({ from: admin })
        assetRouter = await deployProxy(AssetRouter, { kind: 'uups', initializer: false })
        await FarmFactory.new(implementation.address, accessManager.address, assetRouter.address, { from: admin })
        DAIToken = await IUniswapV2Pair.at('0xe3520349F477A5F6EB06107066048508498A291b')
    })

    describe('Single Asset Withdraw', () => {
        describe('withdraw token', () => {
            let stakeLPBefore
            let tokenBalanceBefore

            before(async () => {
                const DAIAmount = new BN('1000000000000000000000') // 1000$
                await DAIToken.approve(assetRouter.address, DAIAmount, { from: DAIHolder }) // change

                const tokensData = []
                tokensData[0] = `0x12aa3caf00000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf07000000000000000000000000e3520349f477a5f6eb06107066048508498a291b000000000000000000000000b12bfca5a55806aaf64e99521918a4bf0fc4080200000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf07000000000000000000000000${assetRouter.address.substring(2).toLowerCase()}000000000000000000000000000000000000000000000011e3ab8395c6e800000000000000000000000000000000000000000000000000000000000008b95ec80000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000055e00000000000000000000000000000000000000000000000000000000054000a0c9e75c480000000000000403020100000000000000000000000000000000000000051200039100021000018100a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c20e3520349f477a5f6eb06107066048508498a291b2c4d78a40bab1a6cbb4b59297cd7b2eba21128ef6ae4071138002dc6c02c4d78a40bab1a6cbb4b59297cd7b2eba21128ef2639f48ace89298fa2e874ef2e26d4576058ae6d0000000000000000000000000000000000000000000000000000000000ebaf17e3520349f477a5f6eb06107066048508498a291b00206ae40711b8002dc6c02639f48ace89298fa2e874ef2e26d4576058ae6d2f41af687164062f118297ca10751f4b55478ae1000000000000000000000000000000000000000000000000001fcd0d2fb5107a4988a896b1227218e4a686fde5eabdcabd91571f00206ae4071138002dc6c02f41af687164062f118297ca10751f4b55478ae11111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000000dc5b5ac9bdeed33cd01541e1eed10f90519d2c06fe3feb0c20e3520349f477a5f6eb06107066048508498a291bbb310ef4fac855f2f49d8fb35a2da8f639b3464e6ae4071138002dc6c0bb310ef4fac855f2f49d8fb35a2da8f639b3464e1111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000001c9608ae3520349f477a5f6eb06107066048508498a291b00a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c20e3520349f477a5f6eb06107066048508498a291b28058325c9d1779b74f5b6ae9ecd83e30bc961b16ae4071138002dc6c028058325c9d1779b74f5b6ae9ecd83e30bc961b103b666f3488a7992b2385b12df7f35156d7b29cd0000000000000000000000000000000000000000000f4dc1bd8fdd98025c88b5e3520349f477a5f6eb06107066048508498a291b00206ae4071138002dc6c003b666f3488a7992b2385b12df7f35156d7b29cd2fe064b6c7d274082aa5d2624709bc9ae7d16c770000000000000000000000000000000000000000000000000000000002962055c42c30ac6cc15fac9bd938618bcaa1a1fae8501d00206ae40711b8002dc6c02fe064b6c7d274082aa5d2624709bc9ae7d16c771111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000002929c624988a896b1227218e4a686fde5eabdcabd91571f00a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c20e3520349f477a5f6eb06107066048508498a291b3f239d83af94f836b93910d29704def88542e2a76ae4071138002dc6c03f239d83af94f836b93910d29704def88542e2a763da4db6ef4e7c62168ab03982399f9588fcd198000000000000000000000000000000000000000000000000008141c4e722ecb0e3520349f477a5f6eb06107066048508498a291b00206ae4071138002dc6c063da4db6ef4e7c62168ab03982399f9588fcd19820f8aefb5697b77e0bb835a8518be70775cda1b000000000000000000000000000000000000000000014ba7509d718f6d006d5e2c9bdeed33cd01541e1eed10f90519d2c06fe3feb00206ae4071138002dc6c020f8aefb5697b77e0bb835a8518be70775cda1b01111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000003810681c42c30ac6cc15fac9bd938618bcaa1a1fae8501d0000cfee7c08`
                tokensData[1] = `0x12aa3caf00000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf07000000000000000000000000e3520349f477a5f6eb06107066048508498a291b0000000000000000000000004988a896b1227218e4a686fde5eabdcabd91571f00000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf07000000000000000000000000${assetRouter.address.substring(2).toLowerCase()}000000000000000000000000000000000000000000000011e3ab8395c6e800000000000000000000000000000000000000000000000000000000000008b322e80000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000055e00000000000000000000000000000000000000000000000000000000054000a0c9e75c480000000000000403020100000000000000000000000000000000000000051200039100021000018100a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c20e3520349f477a5f6eb06107066048508498a291bbb310ef4fac855f2f49d8fb35a2da8f639b3464e6ae4071138002dc6c0bb310ef4fac855f2f49d8fb35a2da8f639b3464e2f41af687164062f118297ca10751f4b55478ae10000000000000000000000000000000000000000000000000000000000ef060ee3520349f477a5f6eb06107066048508498a291b00206ae40711b8002dc6c02f41af687164062f118297ca10751f4b55478ae12639f48ace89298fa2e874ef2e26d4576058ae6d0000000000000000000000000000000000000000000000000021ec940fba7fe0b12bfca5a55806aaf64e99521918a4bf0fc4080200206ae4071138002dc6c02639f48ace89298fa2e874ef2e26d4576058ae6d1111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000000decabbc9bdeed33cd01541e1eed10f90519d2c06fe3feb0c20e3520349f477a5f6eb06107066048508498a291b2c4d78a40bab1a6cbb4b59297cd7b2eba21128ef6ae4071138002dc6c02c4d78a40bab1a6cbb4b59297cd7b2eba21128ef1111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000001bca899e3520349f477a5f6eb06107066048508498a291b00a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c20e3520349f477a5f6eb06107066048508498a291b28058325c9d1779b74f5b6ae9ecd83e30bc961b16ae4071138002dc6c028058325c9d1779b74f5b6ae9ecd83e30bc961b120f8aefb5697b77e0bb835a8518be70775cda1b00000000000000000000000000000000000000000000f4dc1bd8fdd98025c88b5e3520349f477a5f6eb06107066048508498a291b00206ae4071138002dc6c020f8aefb5697b77e0bb835a8518be70775cda1b02fe064b6c7d274082aa5d2624709bc9ae7d16c77000000000000000000000000000000000000000000000000000000000296b977c42c30ac6cc15fac9bd938618bcaa1a1fae8501d00206ae4071138002dc6c02fe064b6c7d274082aa5d2624709bc9ae7d16c771111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000002962f4db12bfca5a55806aaf64e99521918a4bf0fc4080200a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c20e3520349f477a5f6eb06107066048508498a291b3f239d83af94f836b93910d29704def88542e2a76ae4071138002dc6c03f239d83af94f836b93910d29704def88542e2a763da4db6ef4e7c62168ab03982399f9588fcd198000000000000000000000000000000000000000000000000008141c4e722ecb0e3520349f477a5f6eb06107066048508498a291b00206ae4071138002dc6c063da4db6ef4e7c62168ab03982399f9588fcd19803b666f3488a7992b2385b12df7f35156d7b29cd00000000000000000000000000000000000000000014ba7509d718f6d006d5e2c9bdeed33cd01541e1eed10f90519d2c06fe3feb00206ae4071138002dc6c003b666f3488a7992b2385b12df7f35156d7b29cd1111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000003818047c42c30ac6cc15fac9bd938618bcaa1a1fae8501d0000cfee7c08`
                tokensData[2] = `0x12aa3caf00000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf07000000000000000000000000e3520349f477a5f6eb06107066048508498a291b0000000000000000000000005183e1b1091804bc2602586919e6880ac1cf28960000000000000000000000003f239d83af94f836b93910d29704def88542e2a7000000000000000000000000${assetRouter.address.substring(2).toLowerCase()}000000000000000000000000000000000000000000000011e3ab8395c6e80000000000000000000000000000000000000000000000000002eb5a9463c2468fc10000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000017700000000000000000000000000000000000000000000000000000000015900a007e5c0d20000000000000000000000000000000000000000000001350000ce00006700206ae4071138002dc6c03f239d83af94f836b93910d29704def88542e2a763da4db6ef4e7c62168ab03982399f9588fcd19800000000000000000000000000000000000000000000000001195331f597646be3520349f477a5f6eb06107066048508498a291b00206ae4071138002dc6c063da4db6ef4e7c62168ab03982399f9588fcd198a36df7c571beba7b3fb89f25dfc990eac75f525a0000000000000000000000000000000000000000002d0e21407faa42d45d1a88c9bdeed33cd01541e1eed10f90519d2c06fe3feb00206ae4071138002dc6c0a36df7c571beba7b3fb89f25dfc990eac75f525a1111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000002eb5a9463c2468fc1c42c30ac6cc15fac9bd938618bcaa1a1fae8501d000000000000000000cfee7c08`
                await assetRouter.depositSingleAsset(pool, DAIToken.address, DAIAmount, tokensData, 0, DAIHolder, { from: DAIHolder })

                tokenBalanceBefore = await DAIToken.balanceOf(DAIHolder)
                stakeLPBefore = await assetRouter.userStake(DAIHolder, pool)
            })
            it('fires events', async () => {
                const tokensData = []
                tokensData[0] = `0x12aa3caf00000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf07000000000000000000000000b12bfca5a55806aaf64e99521918a4bf0fc40802000000000000000000000000e3520349f477a5f6eb06107066048508498a291b00000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf07000000000000000000000000${assetRouter.address.substring(2).toLowerCase()}0000000000000000000000000000000000000000000000000000000005f5e1000000000000000000000000000000000000000000000000029681ce0b834eb4ed0000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000055e00000000000000000000000000000000000000000000000000000000054000a0c9e75c480000000000000303030100000000000000000000000000000000000000051200048300030200018100a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c20b12bfca5a55806aaf64e99521918a4bf0fc408022f41af687164062f118297ca10751f4b55478ae16ae40711b8002dc6c02f41af687164062f118297ca10751f4b55478ae12639f48ace89298fa2e874ef2e26d4576058ae6d000000000000000000000000000000000000000000000000000accc140f4217ab12bfca5a55806aaf64e99521918a4bf0fc4080200206ae4071138002dc6c02639f48ace89298fa2e874ef2e26d4576058ae6d2c4d78a40bab1a6cbb4b59297cd7b2eba21128ef000000000000000000000000000000000000000000000000000000000049bcd5c9bdeed33cd01541e1eed10f90519d2c06fe3feb00206ae40711b8002dc6c02c4d78a40bab1a6cbb4b59297cd7b2eba21128ef1111111254eeb25477b68fb85ed929f73a96058200000000000000000000000000000000000000000000000041b419895c423ba64988a896b1227218e4a686fde5eabdcabd91571f00a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c20b12bfca5a55806aaf64e99521918a4bf0fc4080220f8aefb5697b77e0bb835a8518be70775cda1b06ae40711b8002dc6c020f8aefb5697b77e0bb835a8518be70775cda1b063da4db6ef4e7c62168ab03982399f9588fcd198000000000000000000000000000000000000000000052a97b3036d8437afb580b12bfca5a55806aaf64e99521918a4bf0fc4080200206ae40711b8002dc6c063da4db6ef4e7c62168ab03982399f9588fcd1983f239d83af94f836b93910d29704def88542e2a700000000000000000000000000000000000000000000000000200b58341ed30bc42c30ac6cc15fac9bd938618bcaa1a1fae8501d00206ae40711b8002dc6c03f239d83af94f836b93910d29704def88542e2a71111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000000c67b61b4251b6ce5c9bdeed33cd01541e1eed10f90519d2c06fe3feb00a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c20b12bfca5a55806aaf64e99521918a4bf0fc408022fe064b6c7d274082aa5d2624709bc9ae7d16c776ae4071138002dc6c02fe064b6c7d274082aa5d2624709bc9ae7d16c7703b666f3488a7992b2385b12df7f35156d7b29cd0000000000000000000000000000000000000000000000000000000000e4b321b12bfca5a55806aaf64e99521918a4bf0fc4080200206ae40711b8002dc6c003b666f3488a7992b2385b12df7f35156d7b29cd28058325c9d1779b74f5b6ae9ecd83e30bc961b10000000000000000000000000000000000000000000529905254974022250a9b4988a896b1227218e4a686fde5eabdcabd91571f00206ae40711b8002dc6c028058325c9d1779b74f5b6ae9ecd83e30bc961b11111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000000c6d32b7855a200d6c42c30ac6cc15fac9bd938618bcaa1a1fae8501d0c20b12bfca5a55806aaf64e99521918a4bf0fc40802bb310ef4fac855f2f49d8fb35a2da8f639b3464e6ae40711b8002dc6c0bb310ef4fac855f2f49d8fb35a2da8f639b3464e1111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000000c77f2755ac4f0b8bb12bfca5a55806aaf64e99521918a4bf0fc408020000cfee7c08`
                tokensData[1] = `0x12aa3caf00000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf070000000000000000000000004988a896b1227218e4a686fde5eabdcabd91571f000000000000000000000000e3520349f477a5f6eb06107066048508498a291b00000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf07000000000000000000000000${assetRouter.address.substring(2).toLowerCase()}0000000000000000000000000000000000000000000000000000000005f5e10000000000000000000000000000000000000000000000000294f60505084cfc7d0000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000055e00000000000000000000000000000000000000000000000000000000054000a0c9e75c480000000000000403020100000000000000000000000000000000000000051200039100021000018100a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c204988a896b1227218e4a686fde5eabdcabd91571f2639f48ace89298fa2e874ef2e26d4576058ae6d6ae40711b8002dc6c02639f48ace89298fa2e874ef2e26d4576058ae6d2f41af687164062f118297ca10751f4b55478ae1000000000000000000000000000000000000000000000000000ab28809ba8ab64988a896b1227218e4a686fde5eabdcabd91571f00206ae4071138002dc6c02f41af687164062f118297ca10751f4b55478ae1bb310ef4fac855f2f49d8fb35a2da8f639b3464e00000000000000000000000000000000000000000000000000000000004adaddc9bdeed33cd01541e1eed10f90519d2c06fe3feb00206ae40711b8002dc6c0bb310ef4fac855f2f49d8fb35a2da8f639b3464e1111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000000431cd724081e794ab12bfca5a55806aaf64e99521918a4bf0fc408020c204988a896b1227218e4a686fde5eabdcabd91571f2c4d78a40bab1a6cbb4b59297cd7b2eba21128ef6ae40711b8002dc6c02c4d78a40bab1a6cbb4b59297cd7b2eba21128ef1111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000000855716c7a19205354988a896b1227218e4a686fde5eabdcabd91571f00a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c204988a896b1227218e4a686fde5eabdcabd91571f2fe064b6c7d274082aa5d2624709bc9ae7d16c776ae40711b8002dc6c02fe064b6c7d274082aa5d2624709bc9ae7d16c7720f8aefb5697b77e0bb835a8518be70775cda1b00000000000000000000000000000000000000000000000000000000000e3ae7d4988a896b1227218e4a686fde5eabdcabd91571f00206ae40711b8002dc6c020f8aefb5697b77e0bb835a8518be70775cda1b028058325c9d1779b74f5b6ae9ecd83e30bc961b10000000000000000000000000000000000000000000523a84edf7996562ffefbb12bfca5a55806aaf64e99521918a4bf0fc4080200206ae40711b8002dc6c028058325c9d1779b74f5b6ae9ecd83e30bc961b11111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000000c5f77dbeaad1e36cc42c30ac6cc15fac9bd938618bcaa1a1fae8501d00a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c204988a896b1227218e4a686fde5eabdcabd91571f03b666f3488a7992b2385b12df7f35156d7b29cd6ae40711b8002dc6c003b666f3488a7992b2385b12df7f35156d7b29cd63da4db6ef4e7c62168ab03982399f9588fcd19800000000000000000000000000000000000000000006e373d11dba815d8aae7b4988a896b1227218e4a686fde5eabdcabd91571f00206ae40711b8002dc6c063da4db6ef4e7c62168ab03982399f9588fcd1983f239d83af94f836b93910d29704def88542e2a7000000000000000000000000000000000000000000000000002ab9692c25aabbc42c30ac6cc15fac9bd938618bcaa1a1fae8501d00206ae40711b8002dc6c03f239d83af94f836b93910d29704def88542e2a71111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000001068a995ab3ca9a91c9bdeed33cd01541e1eed10f90519d2c06fe3feb0000cfee7c08`
                tokensData[2] = `0x12aa3caf00000000000000000000000057da811a9ef9b79dbc2ea6f6dc39368a8da1cf070000000000000000000000005183e1b1091804bc2602586919e6880ac1cf2896000000000000000000000000e3520349f477a5f6eb06107066048508498a291b000000000000000000000000a36df7c571beba7b3fb89f25dfc990eac75f525a000000000000000000000000${assetRouter.address.substring(2).toLowerCase()}000000000000000000000000000000000000000000000002b5e3af16b1880000000000000000000000000000000000000000000000000000fe927b6ec66cc928000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001100000000000000000000000000000000000000000000000000000000000f200a007e5c0d20000000000000000000000000000000000000000000000000000ce00006700206ae40711b8002dc6c0a36df7c571beba7b3fb89f25dfc990eac75f525a28058325c9d1779b74f5b6ae9ecd83e30bc961b100000000000000000000000000000000000000000006ad32da55b074f74e68f35183e1b1091804bc2602586919e6880ac1cf289600206ae40711b8002dc6c028058325c9d1779b74f5b6ae9ecd83e30bc961b11111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000000fe927b6ec66cc928c42c30ac6cc15fac9bd938618bcaa1a1fae8501d00000000000000000000000000000000cfee7c08`

                const receipt = await assetRouter.withdrawSingleAsset(pool, stakeLPBefore, DAIToken.address, tokensData, DAIHolder, { from: DAIHolder })
                expectEvent(receipt, 'Withdraw', {
                    lpPool: pool, sender: DAIHolder, recipient: DAIHolder, amount: stakeLPBefore
                })
            })
            it('deposits tokens to balance', async () => {
                const tokenBalanceAfter = await DAIToken.balanceOf(DAIHolder)

                const tokenDiff = tokenBalanceAfter.sub(tokenBalanceBefore)
                assert.ok(tokenDiff.gt(new BN(0)), 'Dai Balance not increased')
            })
            it('updates stakes', async () => {
                const stakeLP = await assetRouter.userStake(DAIHolder, pool)
                assert.equal(stakeLP.toString(), '0', 'Stake not withdrawn')
            })
            it('updates totalDeposits', async () => {
                const totalDepositsLP = await assetRouter.totalDeposits(pool)
                assert.equal(totalDepositsLP.toString(), '0', 'Stake not withdrawn')
            })
        })
    })
})
