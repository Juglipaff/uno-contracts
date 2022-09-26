// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;
 
import '../../interfaces/IUniswapV2Pair.sol';
import '../../interfaces/IUniswapV2Router.sol';
import '../../interfaces/IStakingRewards.sol';
import '@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol';

contract UnoFarmQuickswap is Initializable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    /**
     * @dev DistributionInfo:
     * {block} - Distribution block number.
     * {rewardPerDepositAge} - Distribution reward divided by {totalDepositAge}. 
     * {cumulativeRewardAgePerDepositAge} - Sum of {rewardPerDepositAge}s multiplied by distribution interval.
     */
    struct DistributionInfo {
        uint256 block;
        uint256 rewardPerDepositAge;
        uint256 cumulativeRewardAgePerDepositAge;
    }
    /**
     * @dev UserInfo:
     * {stake} - Amount of LP tokens deposited by the user.
     * {depositAge} - User deposits multiplied by blocks the deposit has been in. 
     * {reward} - Amount of LP tokens entitled to the user.
     * {lastDistribution} - Distribution ID before the last user deposit.
     * {lastUpdate} - Deposit update block.
     */
    struct UserInfo {
        uint256 stake;
        uint256 depositAge;
        uint256 reward;
        uint32 lastDistribution;
        uint256 lastUpdate;
    }
    /**
     * @dev SwapInfo:
     * {route} - Array of token addresses describing swap routes.
     * {amountOutMin} - The minimum amount of output token that must be received for the transaction not to revert.
     */
    struct SwapInfo{
        address[] route;
        uint256 amountOutMin;
    }
    /**
     * @dev FeeInfo:
     * {feeTo} - Address to transfer fees to.
     * {fee} - Fee percentage to collect (10^18 == 100%). 
     */
    struct FeeInfo {
        address feeTo;
        uint256 fee;
    }

    /**
     * @dev Tokens Used:
     * {rewardToken} - Token generated by staking.
     * {lpPair} - Token that the strategy maximizes. The same token that users deposit in the {lpStakingPool}.
     * {tokenA, tokenB} - Tokens that the strategy maximizes.
     */
    address public rewardToken;
    address public lpPair;
    address public tokenA;
    address public tokenB;

    /**
     * @dev Third Party Contracts:
     * {quickswapRouter} - Contract that executes swaps.
     * {lpStakingPool} - Contract that distibutes {rewardToken}.
     */
    IUniswapV2Router01 private constant quickswapRouter = IUniswapV2Router01(0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff); 
    IStakingRewards private lpStakingPool;

    /**
     * @dev Contract Variables:
     * {totalDeposits} - Total deposits made by users.
     * {totalDepositAge} - Deposits multiplied by blocks the deposit has been in. Flushed every reward distribution.
     * {totalDepositLastUpdate} - Last {totalDepositAge} update block.

     * {distributionID} - Current distribution ID.
     * {userInfo} - Info on each user.
     * {distributionInfo} - Info on each distribution.

     * {fractionMultiplier} - Used to store decimal values.
     */
    uint256 private totalDeposits;
    uint256 private totalDepositAge;
    uint256 private totalDepositLastUpdate;

    uint32 private distributionID;
    mapping(address => UserInfo) private userInfo;
    mapping(uint32 => DistributionInfo) private distributionInfo;

    uint256 private constant fractionMultiplier = uint256(1 ether);

    /**
     * @dev Contract Variables:
     * {assetRouter} - The contract from which calls to this farm are made.
     */
    address public assetRouter;
    modifier onlyAssetRouter(){
        require(msg.sender == assetRouter, 'CALLER_NOT_ASSET_ROUTER');
        _;
    }

    // ============ Methods ============

    function initialize(address _lpStakingPool, address _assetRouter) external initializer {
        require (_lpStakingPool != address(0), 'BAD_LP_POOL');
        require (_assetRouter != address(0), 'BAD_ASSET_ROUTER');

        __ReentrancyGuard_init();
        assetRouter = _assetRouter;

        lpStakingPool = IStakingRewards(_lpStakingPool);
        lpPair = address(lpStakingPool.stakingToken());

        rewardToken = lpStakingPool.rewardsToken();

        tokenA = IUniswapV2Pair(lpPair).token0();
        tokenB = IUniswapV2Pair(lpPair).token1();

        distributionInfo[0] = DistributionInfo({
            block: block.number,
            rewardPerDepositAge: 0,
            cumulativeRewardAgePerDepositAge: 0
        });
        distributionID = 1;
        totalDepositLastUpdate = block.number;

        IERC20(lpPair).approve(_lpStakingPool, type(uint256).max);
        IERC20(lpPair).approve(address(quickswapRouter), type(uint256).max);
        IERC20(rewardToken).approve(address(quickswapRouter), type(uint256).max);
        IERC20(tokenA).approve(address(quickswapRouter), type(uint256).max);
        IERC20(tokenB).approve(address(quickswapRouter), type(uint256).max);
    }

    /**
     * @dev Function that makes the deposits.
     * Deposits provided tokens in the Liquidity Pool, then stakes generated LP tokens in the {lpStakingPool}.
     */
    function deposit(uint256 amountA, uint256 amountB, uint256 amountAMin, uint256 amountBMin, uint256 amountLP, address origin, address recipient) external nonReentrant onlyAssetRouter returns(uint256 sentA, uint256 sentB, uint256 liquidity){
        uint256 addedLiquidity;
        if(amountA > 0 && amountB > 0){
            (sentA, sentB, addedLiquidity) = quickswapRouter.addLiquidity(tokenA, tokenB, amountA, amountB, amountAMin, amountBMin, address(this), block.timestamp);
        }
        liquidity = addedLiquidity + amountLP;
        require(liquidity > 0, 'NO_LIQUIDITY_PROVIDED');

        _updateDeposit(recipient);
        userInfo[recipient].stake += liquidity;
        totalDeposits += liquidity;
            
        lpStakingPool.stake(liquidity);
        IERC20Upgradeable(tokenA).safeTransfer(origin, amountA - sentA);
        IERC20Upgradeable(tokenB).safeTransfer(origin, amountB - sentB);
    }

    /**
     * @dev Withdraws funds from {origin} and sends them to the {recipient}.
     */
    function withdraw(uint256 amount, uint256 amountAMin, uint256 amountBMin, bool withdrawLP, address origin, address recipient) external nonReentrant onlyAssetRouter returns(uint256 amountA, uint256 amountB){
        require(amount > 0, 'INSUFFICIENT_AMOUNT');

        _updateDeposit(origin);
        UserInfo storage user = userInfo[origin];
        // Subtract amount from user.reward first, then subtract remainder from user.stake.
        if(amount > user.reward){
            uint256 balance = user.stake + user.reward;
            require(amount <= balance, 'INSUFFICIENT_BALANCE');
            user.stake = balance - amount;
            totalDeposits = totalDeposits + user.reward - amount;
            user.reward = 0;
        } else {
            user.reward -= amount;
        }

        lpStakingPool.withdraw(amount);
        if(withdrawLP){
            IERC20Upgradeable(lpPair).safeTransfer(recipient, amount);
            return (0, 0);
        }
        (amountA, amountB) = quickswapRouter.removeLiquidity(tokenA, tokenB, amount, amountAMin, amountBMin, recipient, block.timestamp);
    }

    /**
     * @dev Core function of the strat, in charge of updating, collecting and re-investing rewards.
     * 1. It claims rewards from the {lpStakingPool}.
     * 2. It swaps {rewardToken} token for {tokenA} & {tokenB}.
     * 3. It deposits new LP tokens back to the {lpStakingPool}.
     */
    function distribute(
        SwapInfo[2] calldata swapInfos,
        SwapInfo calldata feeSwapInfo,
        FeeInfo calldata feeInfo
    ) external onlyAssetRouter nonReentrant returns(uint256 reward){
        require(totalDeposits > 0, 'NO_LIQUIDITY');
        require(distributionInfo[distributionID - 1].block != block.number, 'CANT_CALL_ON_THE_SAME_BLOCK');

        lpStakingPool.getReward();
        
        collectFees(feeSwapInfo, feeInfo);
        uint256 rewardTokenHalf = IERC20(rewardToken).balanceOf(address(this)) / 2;
        if (tokenA != rewardToken) {
            address[] calldata route = swapInfos[0].route;
            require(route[0] == rewardToken && route[route.length - 1] == tokenA, 'BAD_REWARD_TOKEN_A_ROUTE');
            quickswapRouter.swapExactTokensForTokens(rewardTokenHalf, swapInfos[0].amountOutMin, route, address(this), block.timestamp);
        }
        if (tokenB != rewardToken) {
            address[] calldata route = swapInfos[1].route;
            require(route[0] == rewardToken && route[route.length - 1] == tokenB, 'BAD_REWARD_TOKEN_B_ROUTE');
            quickswapRouter.swapExactTokensForTokens(rewardTokenHalf, swapInfos[1].amountOutMin, route, address(this), block.timestamp);
        }

        (,,reward) = quickswapRouter.addLiquidity(tokenA, tokenB, IERC20(tokenA).balanceOf(address(this)), IERC20(tokenB).balanceOf(address(this)), swapInfos[0].amountOutMin, swapInfos[1].amountOutMin, address(this), block.timestamp);

        uint256 rewardPerDepositAge = reward * fractionMultiplier / (totalDepositAge + totalDeposits * (block.number - totalDepositLastUpdate));
        uint256 cumulativeRewardAgePerDepositAge = distributionInfo[distributionID - 1].cumulativeRewardAgePerDepositAge + rewardPerDepositAge * (block.number - distributionInfo[distributionID - 1].block);

        distributionInfo[distributionID] = DistributionInfo({
            block: block.number,
            rewardPerDepositAge: rewardPerDepositAge,
            cumulativeRewardAgePerDepositAge: cumulativeRewardAgePerDepositAge
        });

        distributionID += 1;
        totalDepositLastUpdate = block.number;
        totalDepositAge = 0;

        lpStakingPool.stake(reward);
    }

    /**
     * @dev Swaps and sends fees to feeTo.
     */
    function collectFees(SwapInfo calldata feeSwapInfo, FeeInfo calldata feeInfo) internal {
        if(feeInfo.feeTo != address(0)){
            uint256 feeAmount = IERC20Upgradeable(rewardToken).balanceOf(address(this)) * feeInfo.fee / fractionMultiplier;
            if(feeAmount > 0){
                address[] calldata route = feeSwapInfo.route;
                if(route.length > 0 && route[0] != route[route.length - 1]){
                    require(route[0] == rewardToken, 'BAD_FEE_TOKEN_ROUTE');
                    quickswapRouter.swapExactTokensForTokens(feeAmount, feeSwapInfo.amountOutMin, route, feeInfo.feeTo, block.timestamp);
                    return;
                }
                IERC20Upgradeable(rewardToken).safeTransfer(feeInfo.feeTo, feeAmount);
            }
        }
    }

    /**
     * @dev Returns total funds staked by the {_address}.
     */
    function userBalance(address _address) external view returns (uint256) {
        return userInfo[_address].stake + userReward(_address);
    }

    /**
     * @dev Returns total funds locked in the farm.
     */
    function getTotalDeposits() external view returns (uint256 _totalDeposits) {
        if(totalDeposits > 0){
            _totalDeposits = lpStakingPool.balanceOf(address(this));
        }
    }

    function _updateDeposit(address _address) internal {
        UserInfo storage user = userInfo[_address];
        // Accumulate deposit age within the current distribution period.
        if (user.lastDistribution == distributionID) {
            // Add deposit age from previous deposit age update to now.
            user.depositAge += user.stake * (block.number - user.lastUpdate);
        } else {
            // A reward has been distributed, update user.reward.
            user.reward = userReward(_address);
            // Count fresh deposit age from previous reward distribution to now.
            user.depositAge = user.stake * (block.number - distributionInfo[distributionID - 1].block);
        }

        user.lastDistribution = distributionID;
        user.lastUpdate = block.number;

        // Same with total deposit age.
        totalDepositAge += (block.number - totalDepositLastUpdate) * totalDeposits;
        totalDepositLastUpdate = block.number;
    }

    function userReward(address _address) internal view returns (uint256) {
        UserInfo memory user = userInfo[_address];
        if (user.lastDistribution == distributionID) {
            // Return user.reward if the distribution after the last user deposit did not happen yet.
            return user.reward;
        }
        DistributionInfo memory lastUserDistributionInfo = distributionInfo[user.lastDistribution];
        uint256 userDepositAge = user.depositAge + user.stake * (lastUserDistributionInfo.block - user.lastUpdate);
        // Calculate reward between the last user deposit and the distribution after that.
        uint256 rewardBeforeDistibution = userDepositAge * lastUserDistributionInfo.rewardPerDepositAge / fractionMultiplier;
        // Calculate reward from the distributions that have happened after the last user deposit.
        uint256 rewardAfterDistribution = user.stake * (distributionInfo[distributionID - 1].cumulativeRewardAgePerDepositAge - lastUserDistributionInfo.cumulativeRewardAgePerDepositAge) / fractionMultiplier;
        return user.reward + rewardBeforeDistibution + rewardAfterDistribution;
    }
}
