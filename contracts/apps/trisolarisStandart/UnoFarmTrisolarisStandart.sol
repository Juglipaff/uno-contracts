// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../../interfaces/IUniswapV2Pair.sol";
import "../../interfaces/IUniswapV2Router02.sol";
import "../../interfaces/IUniversalMasterChef.sol";
import "../../interfaces/IComplexRewarder.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract UnoFarmTrisolarisStandart is Initializable, ReentrancyGuardUpgradeable {
    using SafeERC20Upgradeable for IERC20Upgradeable;
    /**
     * @dev DistributionInfo:
     * {_block} - Distribution block number.
     * {rewardPerDepositAge} - Distribution reward divided by {totalDepositAge}.
     * {cumulativeRewardAgePerDepositAge} - Sum of {rewardPerDepositAge}s multiplied by distribution interval.
     */
    struct DistributionInfo {
        uint256 _block;
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
     * @dev MASTERCHEF_TYPE:
     * {V1} - 1st version of the MasterChef.
     * {V2} - 2st version of the MasterChef.
     */
    enum MASTERCHEF_TYPE {
        V1,
        V2
    }
    /**
     * @dev Tokens Used:
     * {rewardToken} - Token generated by staking (SUSHI).
     * {rewarderToken} - Token generated by ComplexRewarderTime contract.
     * {lpPair} - Token that the strategy maximizes. The same token that users deposit in the {MasterChef}.
     * {tokenA, tokenB} - Tokens that the strategy maximizes.
     */
    address public rewardToken;
    address public rewarderToken;
    address public lpPair;
    address public tokenA;
    address public tokenB;
    /**
     * @dev MasterChef addresses:
     * {MasterChefV1} - Address of the 1st version of the MasterChef.
     * {MasterChefV2} - Address of the 2st version of the MasterChef.
     */
    address private constant MasterChefV1 = address(0x1f1Ed214bef5E83D8f5d0eB5D7011EB965D0D79B);
    address private constant MasterChefV2 = address(0x3838956710bcc9D122Dd23863a0549ca8D5675D6);

    /**
     * @dev Third Party Contracts:
     * {trisolarisRouter} - The contract that executes swaps.
     * {MasterChef} -The contract that distibutes {rewardToken}.
     */
    IUniswapV2Router02 private constant trisolarisRouter = IUniswapV2Router02(0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506);
    IUniversalMasterChef private MasterChef;
    IComplexRewarder private ComplexRewarder;

    /**
     * @dev Contract Variables:
     * {pid} - Pool ID.

     * {totalDeposits} - Total deposits made by users.
     * {totalDepositAge} - Deposits multiplied by blocks the deposit has been in. Flushed every reward distribution.
     * {totalDepositLastUpdate} - Last {totalDepositAge} update block.

     * {distributionID} - Current distribution ID.
     * {userInfo} - Info on each user.
     * {distributionInfo} - Info on each distribution.

     * {fractionMultiplier} - Used to store decimal values.

     * {masterChefType} - MasterChef type in use.
     */
    uint256 public pid;

    uint256 private totalDeposits;
    uint256 private totalDepositAge;
    uint256 private totalDepositLastUpdate;

    uint32 private distributionID;
    mapping(address => UserInfo) private userInfo;
    mapping(uint32 => DistributionInfo) private distributionInfo;

    uint256 private constant fractionMultiplier = uint256(1 ether);

    MASTERCHEF_TYPE private masterChefType;

    /**
     * @dev Contract Variables:
     * {assetRouter} - The contract from which calls to this farm are made.
     */
    address public assetRouter;
    modifier onlyAssetRouter() {
        require(msg.sender == assetRouter, "CALLER_NOT_ASSET_ROUTER");
        _;
    }

    // ============ Methods ============

    function initialize(address _lpPair, address _assetRouter) external initializer {
        __ReentrancyGuard_init();
        assetRouter = _assetRouter;

        (pid, masterChefType) = getPoolInfo(_lpPair);
        lpPair = _lpPair;

        if (masterChefType == MASTERCHEF_TYPE.V1) {
            MasterChef = IUniversalMasterChef(MasterChefV1);
            rewardToken = MasterChef.tri();
        } else {
            MasterChef = IUniversalMasterChef(MasterChefV2);
            rewardToken = MasterChef.TRI();
        }

        ComplexRewarder = IComplexRewarder(MasterChef.rewarder(pid));
        if (address(ComplexRewarder) != address(0)) {
            (IERC20[] memory rewarderTokenArray, ) = ComplexRewarder.pendingTokens(pid, address(0), 0);
            rewarderToken = address(rewarderTokenArray[0]);
        }

        tokenA = IUniswapV2Pair(lpPair).token0();
        tokenB = IUniswapV2Pair(lpPair).token1();

        distributionInfo[0] = DistributionInfo(block.number, 0, 0);
        distributionID = 1;
        totalDepositLastUpdate = block.number;

        IERC20(lpPair).approve(address(MasterChef), type(uint256).max);
        IERC20(lpPair).approve(address(trisolarisRouter), type(uint256).max);
        IERC20(rewardToken).approve(address(trisolarisRouter), type(uint256).max);
        IERC20(rewarderToken).approve(address(trisolarisRouter), type(uint256).max);
        IERC20(tokenA).approve(address(trisolarisRouter), type(uint256).max);
        IERC20(tokenB).approve(address(trisolarisRouter), type(uint256).max);
    }

    /**
     * @dev Function that makes the deposits.
     * Deposits provided tokens in the Liquidity Pool, then stakes generated LP tokens in the {MasterChef}.
     */
    function deposit(
        uint256 amountA,
        uint256 amountB,
        uint256 amountAMin,
        uint256 amountBMin,
        uint256 amountLP,
        address origin,
        address recipient
    )
        external
        nonReentrant
        onlyAssetRouter
        returns (
            uint256 sentA,
            uint256 sentB,
            uint256 liquidity
        )
    {
        uint256 addedLiquidity;
        if (amountA > 0 && amountB > 0) {
            (sentA, sentB, addedLiquidity) = trisolarisRouter.addLiquidity(tokenA, tokenB, amountA, amountB, amountAMin, amountBMin, address(this), block.timestamp);
        }
        liquidity = addedLiquidity + amountLP;
        require(liquidity > 0, "NO_LIQUIDITY_PROVIDED");

        _updateDeposit(recipient);
        userInfo[recipient].stake += liquidity;
        totalDeposits += liquidity;

        if (masterChefType == MASTERCHEF_TYPE.V2) {
            MasterChef.deposit(pid, liquidity, address(this));
        } else {
            MasterChef.deposit(pid, liquidity);
        }

        IERC20Upgradeable(tokenA).safeTransfer(origin, amountA - sentA);
        IERC20Upgradeable(tokenB).safeTransfer(origin, amountB - sentB);
    }

    /**
     * @dev Withdraws funds from {origin} and sends them to the {recipient}.
     */
    function withdraw(
        uint256 amount,
        uint256 amountAMin,
        uint256 amountBMin,
        bool withdrawLP,
        address origin,
        address recipient
    ) external nonReentrant onlyAssetRouter returns (uint256 amountA, uint256 amountB) {
        require(amount > 0, "INSUFFICIENT_AMOUNT");

        _updateDeposit(origin);
        UserInfo storage user = userInfo[origin];
        // Subtract amount from user.reward first, then subtract remainder from user.stake.
        if (amount > user.reward) {
            user.stake = user.stake + user.reward - amount;
            totalDeposits = totalDeposits + user.reward - amount;
            user.reward = 0;
        } else {
            user.reward -= amount;
        }

        if (masterChefType == MASTERCHEF_TYPE.V2) {
            MasterChef.withdraw(pid, amount, address(this));
        } else {
            MasterChef.withdraw(pid, amount);
        }

        if (withdrawLP) {
            IERC20Upgradeable(lpPair).safeTransfer(recipient, amount);
            return (0, 0);
        }
        (amountA, amountB) = trisolarisRouter.removeLiquidity(tokenA, tokenB, amount, amountAMin, amountBMin, recipient, block.timestamp);
    }

    /**
     * @dev Core function of the strat, in charge of updating, collecting and re-investing rewards.
     * 1. It claims rewards from the {MasterChef}.
     * 2. It swaps {rewardToken} token for {tokenA} & {tokenB}.
     * 3. It deposits new LP tokens back to the {MasterChef}.
     */
    function distribute(
        address[] calldata rewardTokenToTokenARoute,
        address[] calldata rewardTokenToTokenBRoute,
        address[] calldata rewarderTokenToTokenARoute,
        address[] calldata rewarderTokenToTokenBRoute,
        uint256[4] memory amountsOutMin
    ) external onlyAssetRouter nonReentrant returns (uint256 reward) {
        require(totalDeposits > 0, "NO_LIQUIDITY");
        require(distributionInfo[distributionID - 1]._block != block.number, "CANT_CALL_ON_THE_SAME_BLOCK");
        require(rewardTokenToTokenARoute[0] == rewardToken && rewardTokenToTokenARoute[rewardTokenToTokenARoute.length - 1] == tokenA, "BAD_REWARD_TOKEN_A_ROUTE");
        require(rewardTokenToTokenBRoute[0] == rewardToken && rewardTokenToTokenBRoute[rewardTokenToTokenBRoute.length - 1] == tokenB, "BAD_REWARD_TOKEN_B_ROUTE");
        require(rewarderTokenToTokenARoute[0] == rewarderToken && rewarderTokenToTokenARoute[rewarderTokenToTokenARoute.length - 1] == tokenA, "BAD_REWARDER_TOKEN_A_ROUTE");
        require(rewarderTokenToTokenBRoute[0] == rewarderToken && rewarderTokenToTokenBRoute[rewarderTokenToTokenBRoute.length - 1] == tokenB, "BAD_REWARDER_TOKEN_B_ROUTE");

        if (masterChefType == MASTERCHEF_TYPE.V2) {
            MasterChef.harvest(pid, address(this));
        } else {
            MasterChef.harvest(pid);
        }

        {
            // scope to avoid stack too deep errors
            uint256 rewardTokenHalf = IERC20(rewardToken).balanceOf(address(this)) / 2;
            if (tokenA != rewardToken) {
                trisolarisRouter.swapExactTokensForTokens(rewardTokenHalf, amountsOutMin[0], rewardTokenToTokenARoute, address(this), block.timestamp);
            }

            if (tokenB != rewardToken) {
                trisolarisRouter.swapExactTokensForTokens(rewardTokenHalf, amountsOutMin[1], rewardTokenToTokenBRoute, address(this), block.timestamp);
            }
        }

        {
            // scope to avoid stack too deep errors
            uint256 rewarderTokenHalf = IERC20(rewarderToken).balanceOf(address(this)) / 2;
            if (tokenA != rewarderToken) {
                trisolarisRouter.swapExactTokensForTokens(rewarderTokenHalf, amountsOutMin[2], rewarderTokenToTokenARoute, address(this), block.timestamp);
            }

            if (tokenB != rewarderToken) {
                trisolarisRouter.swapExactTokensForTokens(rewarderTokenHalf, amountsOutMin[3], rewarderTokenToTokenBRoute, address(this), block.timestamp);
            }
        }

        (, , reward) = trisolarisRouter.addLiquidity(tokenA, tokenB, IERC20(tokenA).balanceOf(address(this)), IERC20(tokenB).balanceOf(address(this)), 1, 1, address(this), block.timestamp);

        uint256 rewardPerDepositAge = (reward * fractionMultiplier) / (totalDepositAge + totalDeposits * (block.number - totalDepositLastUpdate));
        uint256 cumulativeRewardAgePerDepositAge = distributionInfo[distributionID - 1].cumulativeRewardAgePerDepositAge +
            rewardPerDepositAge *
            (block.number - distributionInfo[distributionID - 1]._block);

        distributionInfo[distributionID] = DistributionInfo(block.number, rewardPerDepositAge, cumulativeRewardAgePerDepositAge);

        distributionID += 1;
        totalDepositLastUpdate = block.number;
        totalDepositAge = 0;

        MasterChef.deposit(pid, reward, address(this));
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
        if (totalDeposits > 0) {
            _totalDeposits = MasterChef.userInfo(pid, address(this)).amount;
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
            user.depositAge = user.stake * (block.number - distributionInfo[distributionID - 1]._block);
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
        uint256 userDepositAge = user.depositAge + user.stake * (lastUserDistributionInfo._block - user.lastUpdate);
        // Calculate reward between the last user deposit and the distribution after that.
        uint256 rewardBeforeDistibution = (userDepositAge * lastUserDistributionInfo.rewardPerDepositAge) / fractionMultiplier;
        // Calculate reward from the distributions that have happened after the last user deposit.
        uint256 rewardAfterDistribution = (user.stake * (distributionInfo[distributionID - 1].cumulativeRewardAgePerDepositAge - lastUserDistributionInfo.cumulativeRewardAgePerDepositAge)) /
            fractionMultiplier;
        return user.reward + rewardBeforeDistibution + rewardAfterDistribution;
    }

    /**
     * @dev Get pid and MasterChef version by iterating over all pools and MasterChefs and comparing pids.
     */
    function getPoolInfo(address _lpPair) internal view returns (uint256 _pid, MASTERCHEF_TYPE _masterChefType) {
        bool poolExists = false;

        IUniversalMasterChef masterChefV1 = IUniversalMasterChef(MasterChefV1);
        IUniversalMasterChef masterChefV2 = IUniversalMasterChef(MasterChefV2);

        uint256 poolLengthV1 = masterChefV1.poolLength();
        uint256 poolLengthV2 = masterChefV2.poolLength();

        // there are more pools assigned to V2, so it makes sense to start with it
        for (uint256 i = 0; i < poolLengthV2; i++) {
            if (masterChefV2.lpToken(i) == _lpPair) {
                _pid = i;
                poolExists = true;
                _masterChefType = MASTERCHEF_TYPE.V2;
                break;
            }
        }
        if (!poolExists) {
            for (uint256 i = 0; i < poolLengthV1; i++) {
                if (masterChefV1.poolInfo(i).lpToken == _lpPair) {
                    _pid = i;
                    poolExists = true;
                    _masterChefType = MASTERCHEF_TYPE.V1;
                    break;
                }
            }
        }
        require(poolExists, "The pool with the given pair token doesn't exist");
        return (_pid, _masterChefType);
    }
}
