const {
    expectEvent, BN, constants
} = require('@openzeppelin/test-helpers')
const { deployProxy } = require('@openzeppelin/truffle-upgrades')

const IStakingRewards = artifacts.require('IStakingRewards')

const IUniswapV2Pair = artifacts.require('IUniswapV2Pair')
const IERC20 = artifacts.require('IERC20')

const AccessManager = artifacts.require('UnoAccessManager')
const FarmFactory = artifacts.require('UnoFarmFactory')

const Farm = artifacts.require('UnoFarmQuickswap')
const AssetRouter = artifacts.require('UnoAssetRouterQuickswap')

const pool = '0xAFB76771C98351Aa7fCA13B130c9972181612b54' // usdc usdt
const DAIHolder = '0x06959153B974D0D5fDfd87D561db6d8d4FA0bb0B'// has to be unlocked and hold 0xf28164A485B0B2C90639E47b0f377b4a438a16B1

contract('UnoAssetRouterQuickswapWithSwapWithdraw', (accounts) => {
    const admin = accounts[0]

    let accessManager; let assetRouter
    let DAIToken

    before(async () => {
        const implementation = await Farm.new({ from: admin })
        accessManager = await AccessManager.new({ from: admin })// accounts[0] is admin

        assetRouter = await deployProxy(AssetRouter, { kind: 'uups', initializer: false })
        await FarmFactory.new(implementation.address, accessManager.address, assetRouter.address, { from: admin })

        const stakingRewards = await IStakingRewards.at(pool)
        const lpToken = await IUniswapV2Pair.at(await stakingRewards.stakingToken())

        const tokenAAddress = await lpToken.token0()
        const tokenBAddress = await lpToken.token1()

        tokenA = await IERC20.at(tokenAAddress)
        tokenB = await IERC20.at(tokenBAddress)

        DAIToken = await IUniswapV2Pair.at('0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063')
    })

    describe('Single Asset Withdraw', () => {
        describe('withdraw token', () => {
            let stakeLPBefore
            let tokenBalanceBefore

            before(async () => {
                const DAIAmount = new BN('1000000000000000000000') // 1000$
                await DAIToken.approve(assetRouter.address, DAIAmount, { from: DAIHolder })
                const tokenAData = `0x12aa3caf000000000000000000000000cfd674f8731e801a4a15c1ae31770960e1afded10000000000000000000000008f3cf7ad23cd3cadbd9735aff958023239c6a0630000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa84174000000000000000000000000cfd674f8731e801a4a15c1ae31770960e1afded1000000000000000000000000${assetRouter.address.substring(2).toLowerCase()}00000000000000000000000000000000000000000000001b1ae4d6e2ef500000000000000000000000000000000000000000000000000000000000000eb3d9d1000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001150000000000000000000000000000000000000000000000f700006800004e80206c4eca278f3cf7ad23cd3cadbd9735aff958023239c6a06346a3a41bd932244dd08186e4c19f1a7e48cbcdf40000000000000000000000000000000000000000000000004563918244f400000020d6bdbf788f3cf7ad23cd3cadbd9735aff958023239c6a0630c208f3cf7ad23cd3cadbd9735aff958023239c6a063f04adbf75cdfc5ed26eea4bbbb991db002036bdd6ae4071138002dc6c0f04adbf75cdfc5ed26eea4bbbb991db002036bdd1111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000000000000000eb3d9d18f3cf7ad23cd3cadbd9735aff958023239c6a0630000000000000000000000b4eb6cb3`
                const tokenBData = `0x12aa3caf000000000000000000000000cfd674f8731e801a4a15c1ae31770960e1afded10000000000000000000000008f3cf7ad23cd3cadbd9735aff958023239c6a063000000000000000000000000c2132d05d31c914a87c6611c10748aeb04b58e8f000000000000000000000000cfd674f8731e801a4a15c1ae31770960e1afded1000000000000000000000000${assetRouter.address.substring(2).toLowerCase()}00000000000000000000000000000000000000000000001b1ae4d6e2ef500000000000000000000000000000000000000000000000000000000000000eaad1d70000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000025d00000000000000000000000000000000000000000000023f00006800004e80206c4eca278f3cf7ad23cd3cadbd9735aff958023239c6a06346a3a41bd932244dd08186e4c19f1a7e48cbcdf40000000000000000000000000000000000000000000000004563918244f400000020d6bdbf788f3cf7ad23cd3cadbd9735aff958023239c6a06300a0c9e75c48000000000000000006040000000000000000000000000000000000000000000000000001a900008f0c208f3cf7ad23cd3cadbd9735aff958023239c6a06359153f27eefe07e5ece4f9304ebba1da6f53ca886ae40711b8002dc6c059153f27eefe07e5ece4f9304ebba1da6f53ca881111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000005debad18f3cf7ad23cd3cadbd9735aff958023239c6a06300a007e5c0d20000000000000000000000000000000000000000000000000000f600008f0c208f3cf7ad23cd3cadbd9735aff958023239c6a063f04adbf75cdfc5ed26eea4bbbb991db002036bdd6ae4071138002dc6c0f04adbf75cdfc5ed26eea4bbbb991db002036bdd2cf7252e74036d1da831d11089d326296e64a7280000000000000000000000000000000000000000000000000000000008d2d4938f3cf7ad23cd3cadbd9735aff958023239c6a06300206ae40711b8002dc6c02cf7252e74036d1da831d11089d326296e64a7281111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000008cc17052791bca1f2de4661ed88a30c99a7a9449aa84174000000b4eb6cb3`// await fetchData(tokenBSwapParams);
                await assetRouter.depositWithSwap(pool, [tokenAData, tokenBData], DAIHolder, { from: DAIHolder })

                tokenBalanceBefore = await DAIToken.balanceOf(DAIHolder);
                ({
                    stakeLP: stakeLPBefore,
                    stakeA,
                    stakeB
                } = await assetRouter.userStake(DAIHolder, pool))
                console.log(stakeA.toString(), stakeB.toString())
            })
            it('fires events', async () => {
                const tokenAData = '0x12aa3caf000000000000000000000000cfd674f8731e801a4a15c1ae31770960e1afded10000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa841740000000000000000000000008f3cf7ad23cd3cadbd9735aff958023239c6a063000000000000000000000000cfd674f8731e801a4a15c1ae31770960e1afded100000000000000000000000006959153b974d0d5fdfd87d561db6d8d4fa0bb0b0000000000000000000000000000000000000000000000000000000017d7840000000000000000000000000000000000000000000000000aab97a82e217f1939000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001150000000000000000000000000000000000000000000000f700006800004e80206c4eca272791bca1f2de4661ed88a30c99a7a9449aa8417446a3a41bd932244dd08186e4c19f1a7e48cbcdf400000000000000000000000000000000000000000000000000000000003d09000020d6bdbf782791bca1f2de4661ed88a30c99a7a9449aa841740c202791bca1f2de4661ed88a30c99a7a9449aa84174f04adbf75cdfc5ed26eea4bbbb991db002036bdd6ae40711b8002dc6c0f04adbf75cdfc5ed26eea4bbbb991db002036bdd1111111254eeb25477b68fb85ed929f73a96058200000000000000000000000000000000000000000000000aab97a82e217f19392791bca1f2de4661ed88a30c99a7a9449aa841740000000000000000000000b4eb6cb3'
                const tokenBData = '0x12aa3caf000000000000000000000000cfd674f8731e801a4a15c1ae31770960e1afded1000000000000000000000000c2132d05d31c914a87c6611c10748aeb04b58e8f0000000000000000000000008f3cf7ad23cd3cadbd9735aff958023239c6a063000000000000000000000000cfd674f8731e801a4a15c1ae31770960e1afded100000000000000000000000006959153b974d0d5fdfd87d561db6d8d4fa0bb0b0000000000000000000000000000000000000000000000000000000017d7840000000000000000000000000000000000000000000000000aa98e0dca6d690473000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000003de0000000000000000000000000000000000000000000003c000006800004e80206c4eca27c2132d05d31c914a87c6611c10748aeb04b58e8f46a3a41bd932244dd08186e4c19f1a7e48cbcdf400000000000000000000000000000000000000000000000000000000003d09000020d6bdbf78c2132d05d31c914a87c6611c10748aeb04b58e8f00a0c9e75c480000000000000007020100000000000000000000000000000000000000000000032a00029b00011a00a007e5c0d20000000000000000000000000000000000000000000000000000f600008f0c20c2132d05d31c914a87c6611c10748aeb04b58e8fe89fae1b4ada2c869f05a0c96c87022dadc7709a6ae4071138002dc6c0e89fae1b4ada2c869f05a0c96c87022dadc7709a74214f5d8aa71b8dc921d8a963a1ba360505078100000000000000000000000000000000000000000000000113e5a9f38244440cc2132d05d31c914a87c6611c10748aeb04b58e8f00206ae4071138002dc6c074214f5d8aa71b8dc921d8a963a1ba36050507811111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000011086a466b026a022a3fa99a148fa48d14ed51d610c367c61876997f100a007e5c0d200000000000000000000000000000000000000000000015d0000f600008f0c20c2132d05d31c914a87c6611c10748aeb04b58e8f604229c960e5cacf2aaeac8be68ac07ba9df81c36ae4071138002dc6c0604229c960e5cacf2aaeac8be68ac07ba9df81c3adbf1854e5883eb8aa7baf50705338739e558e5b000000000000000000000000000000000000000000000003d60702772a169c23c2132d05d31c914a87c6611c10748aeb04b58e8f00206ae40711b8002dc6c0adbf1854e5883eb8aa7baf50705338739e558e5b4a35582a710e1f4b2030a3f826da20bfb6703c0900000000000000000000000000000000000000000000000000509d4ebb69af070d500b1d8e8ef31e21c99d1db9a6444d3adf127000206ae40711b8002dc6c04a35582a710e1f4b2030a3f826da20bfb6703c091111111254eeb25477b68fb85ed929f73a96058200000000000000000000000000000000000000000000000221887776546869c17ceb23fd6bc0add59e62ac25578270cff1b9f6190c20c2132d05d31c914a87c6611c10748aeb04b58e8f59153f27eefe07e5ece4f9304ebba1da6f53ca886ae4071138002dc6c059153f27eefe07e5ece4f9304ebba1da6f53ca881111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000007777ef1ed68d9fa8fc2132d05d31c914a87c6611c10748aeb04b58e8f0000b4eb6cb3'

                const receipt = await assetRouter.withdrawWithSwap(pool, stakeLPBefore, [tokenAData, tokenBData], DAIHolder, { from: DAIHolder })
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
                const { stakeLP } = await assetRouter.userStake(DAIHolder, pool)
                assert.equal(stakeLP.toString(), '0', 'Stake not withdrawn')
            })
            it('updates totalDeposits', async () => {
                const { totalDepositsLP } = await assetRouter.totalDeposits(pool)
                assert.equal(totalDepositsLP.toString(), '0', 'Stake not withdrawn')
            })
        })
        describe('withdraw ETH', () => {
            let stakeLPBefore
            let ethBalanceBefore
            let ethSpentOnGas

            before(async () => {
                const DAIAmount = new BN('1000000000000000000000') // 1000$
                await DAIToken.approve(assetRouter.address, DAIAmount, { from: DAIHolder })
                const tokenAData = `0x12aa3caf000000000000000000000000cfd674f8731e801a4a15c1ae31770960e1afded10000000000000000000000008f3cf7ad23cd3cadbd9735aff958023239c6a0630000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa84174000000000000000000000000cfd674f8731e801a4a15c1ae31770960e1afded1000000000000000000000000${assetRouter.address.substring(2).toLowerCase()}00000000000000000000000000000000000000000000001b1ae4d6e2ef500000000000000000000000000000000000000000000000000000000000000eb3d9d1000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000001400000000000000000000000000000000000000000000000000000000000000160000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001150000000000000000000000000000000000000000000000f700006800004e80206c4eca278f3cf7ad23cd3cadbd9735aff958023239c6a06346a3a41bd932244dd08186e4c19f1a7e48cbcdf40000000000000000000000000000000000000000000000004563918244f400000020d6bdbf788f3cf7ad23cd3cadbd9735aff958023239c6a0630c208f3cf7ad23cd3cadbd9735aff958023239c6a063f04adbf75cdfc5ed26eea4bbbb991db002036bdd6ae4071138002dc6c0f04adbf75cdfc5ed26eea4bbbb991db002036bdd1111111254eeb25477b68fb85ed929f73a960582000000000000000000000000000000000000000000000000000000000eb3d9d18f3cf7ad23cd3cadbd9735aff958023239c6a0630000000000000000000000b4eb6cb3`
                const tokenBData = `0x12aa3caf000000000000000000000000cfd674f8731e801a4a15c1ae31770960e1afded10000000000000000000000008f3cf7ad23cd3cadbd9735aff958023239c6a063000000000000000000000000c2132d05d31c914a87c6611c10748aeb04b58e8f000000000000000000000000cfd674f8731e801a4a15c1ae31770960e1afded1000000000000000000000000${assetRouter.address.substring(2).toLowerCase()}00000000000000000000000000000000000000000000001b1ae4d6e2ef500000000000000000000000000000000000000000000000000000000000000eaad1d70000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000025d00000000000000000000000000000000000000000000023f00006800004e80206c4eca278f3cf7ad23cd3cadbd9735aff958023239c6a06346a3a41bd932244dd08186e4c19f1a7e48cbcdf40000000000000000000000000000000000000000000000004563918244f400000020d6bdbf788f3cf7ad23cd3cadbd9735aff958023239c6a06300a0c9e75c48000000000000000006040000000000000000000000000000000000000000000000000001a900008f0c208f3cf7ad23cd3cadbd9735aff958023239c6a06359153f27eefe07e5ece4f9304ebba1da6f53ca886ae40711b8002dc6c059153f27eefe07e5ece4f9304ebba1da6f53ca881111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000005debad18f3cf7ad23cd3cadbd9735aff958023239c6a06300a007e5c0d20000000000000000000000000000000000000000000000000000f600008f0c208f3cf7ad23cd3cadbd9735aff958023239c6a063f04adbf75cdfc5ed26eea4bbbb991db002036bdd6ae4071138002dc6c0f04adbf75cdfc5ed26eea4bbbb991db002036bdd2cf7252e74036d1da831d11089d326296e64a7280000000000000000000000000000000000000000000000000000000008d2d4938f3cf7ad23cd3cadbd9735aff958023239c6a06300206ae40711b8002dc6c02cf7252e74036d1da831d11089d326296e64a7281111111254eeb25477b68fb85ed929f73a9605820000000000000000000000000000000000000000000000000000000008cc17052791bca1f2de4661ed88a30c99a7a9449aa84174000000b4eb6cb3`// await fetchData(tokenBSwapParams);
                await assetRouter.depositWithSwap(pool, [tokenAData, tokenBData], DAIHolder, { from: DAIHolder })

                ethBalanceBefore = new BN(await web3.eth.getBalance(DAIHolder));
                ({
                    stakeLP: stakeLPBefore
                } = await assetRouter.userStake(DAIHolder, pool))
            })
            it('fires events', async () => {
                const tokenAData = '0x12aa3caf000000000000000000000000cfd674f8731e801a4a15c1ae31770960e1afded10000000000000000000000002791bca1f2de4661ed88a30c99a7a9449aa84174000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee000000000000000000000000cfd674f8731e801a4a15c1ae31770960e1afded100000000000000000000000006959153b974d0d5fdfd87d561db6d8d4fa0bb0b0000000000000000000000000000000000000000000000000000000017d7840000000000000000000000000000000000000000000000001326f8c1dd8aaad0880000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000015300000000000000000000000000000000013500011f0000e300006800004e80206c4eca272791bca1f2de4661ed88a30c99a7a9449aa8417446a3a41bd932244dd08186e4c19f1a7e48cbcdf400000000000000000000000000000000000000000000000000000000003d09000020d6bdbf782791bca1f2de4661ed88a30c99a7a9449aa841740c202791bca1f2de4661ed88a30c99a7a9449aa841746e7a5fafcec6bb1e78bae2a1f0b612012bf148276ae4071118002dc6c06e7a5fafcec6bb1e78bae2a1f0b612012bf1482700000000000000000000000000000000000000000000001326f8c1dd8aaad0882791bca1f2de4661ed88a30c99a7a9449aa8417441010d500b1d8e8ef31e21c99d1db9a6444d3adf127000042e1a7d4d0000000000000000000000000000000000000000000000000000000000000000c0611111111254eeb25477b68fb85ed929f73a96058200000000000000000000000000b4eb6cb3'
                const tokenBData = '0x12aa3caf000000000000000000000000cfd674f8731e801a4a15c1ae31770960e1afded1000000000000000000000000c2132d05d31c914a87c6611c10748aeb04b58e8f000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee000000000000000000000000cfd674f8731e801a4a15c1ae31770960e1afded100000000000000000000000006959153b974d0d5fdfd87d561db6d8d4fa0bb0b0000000000000000000000000000000000000000000000000000000017d7840000000000000000000000000000000000000000000000001328e7665367ffcede0000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000014000000000000000000000000000000000000000000000000000000000000001600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000015300000000000000000000000000000000013500011f0000e300006800004e80206c4eca27c2132d05d31c914a87c6611c10748aeb04b58e8f46a3a41bd932244dd08186e4c19f1a7e48cbcdf400000000000000000000000000000000000000000000000000000000003d09000020d6bdbf78c2132d05d31c914a87c6611c10748aeb04b58e8f0c20c2132d05d31c914a87c6611c10748aeb04b58e8f604229c960e5cacf2aaeac8be68ac07ba9df81c36ae4071118002dc6c0604229c960e5cacf2aaeac8be68ac07ba9df81c300000000000000000000000000000000000000000000001328e7665367ffcedec2132d05d31c914a87c6611c10748aeb04b58e8f41010d500b1d8e8ef31e21c99d1db9a6444d3adf127000042e1a7d4d0000000000000000000000000000000000000000000000000000000000000000c0611111111254eeb25477b68fb85ed929f73a96058200000000000000000000000000b4eb6cb3'
                const receipt = await assetRouter.withdrawWithSwap(pool, stakeLPBefore, [tokenAData, tokenBData], DAIHolder, { from: DAIHolder })

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
