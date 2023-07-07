// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import './interfaces/IUnoFarmVelodrome.sol';
import "../../interfaces/IPool.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract UnoFarmVelodrome is Initializable, ReentrancyGuardUpgradeable, IUnoFarmVelodrome {
	using SafeERC20 for IERC20;
	/**
	 * @dev Tokens Used:
	 * {rewardToken} - Token generated by staking (JOE).
	 * {lpPool} - Token that the strategy maximizes. The same token that users deposit in the {MasterChef}.
	 * {tokenA, tokenB} - Tokens that the strategy maximizes.
	 */
	address public rewardToken;
	address public lpPool;
	address public tokenA;
	address public tokenB;

	/**
	 * @dev Third Party Contracts:
	 * {velodromeRouter} - The contract that executes swaps.
	 * {gauge} - Contract that distributes reward tokens.
	 */
	IRouter private constant velodromeRouter = IRouter(0xa062aE8A9c5e11aaA026fc2670B0D65cCc8B2858);
    IGauge public gauge;

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
	bool public isStable;

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
	modifier onlyAssetRouter() {
 		if(msg.sender != assetRouter) revert CALLER_NOT_ASSET_ROUTER();
		_;
	}

	// ============ Methods ============

	function initialize(address _gauge, address _assetRouter) external initializer {
        if(_gauge == address(0)) revert INVALID_GAUGE();
        if(_assetRouter == address(0)) revert INVALID_ASSET_ROUTER();

		__ReentrancyGuard_init();
		assetRouter = _assetRouter;

		gauge = IGauge(_gauge);
		lpPool = gauge.stakingToken();
		isStable = IPool(lpPool).stable();

		rewardToken = gauge.rewardToken();
		tokenA = IPool(lpPool).token0();
		tokenB = IPool(lpPool).token1();

		distributionInfo[0] = DistributionInfo({ 
			block: block.number, 
			rewardPerDepositAge: 0, 
			cumulativeRewardAgePerDepositAge: 0 
		});
		distributionID = 1;
		totalDepositLastUpdate = block.number;

		IERC20(lpPool).approve(_gauge, type(uint256).max);
		IERC20(lpPool).approve(address(velodromeRouter), type(uint256).max);
		IERC20(rewardToken).approve(address(velodromeRouter), type(uint256).max);
		IERC20(tokenA).approve(address(velodromeRouter), type(uint256).max);
		IERC20(tokenB).approve(address(velodromeRouter), type(uint256).max);
	}

	/**
	 * @dev Function that makes the deposits.
	 * Stakes {amount} of LP tokens from this contract's balance in the {MasterChef}.
	 */
	function deposit(uint256 amount, address recipient) external nonReentrant onlyAssetRouter{
        if(amount == 0) revert NO_LIQUIDITY_PROVIDED();

		_updateDeposit(recipient);
		userInfo[recipient].stake += amount;
		totalDeposits += amount;

		gauge.deposit(amount);
	}

	/**
	 * @dev Withdraws funds from {origin} and sends them to the {recipient}.
	 */
	function withdraw(
		uint256 amount,
		address origin,
		address recipient
	) external nonReentrant onlyAssetRouter {
        if(amount == 0) revert INSUFFICIENT_AMOUNT();

		_updateDeposit(origin);
		UserInfo storage user = userInfo[origin];
		// Subtract amount from user.reward first, then subtract remainder from user.stake.
		if (amount > user.reward) {
			uint256 balance = user.stake + user.reward;
            if(amount > balance) revert INSUFFICIENT_BALANCE();

			user.stake = balance - amount;
			totalDeposits = totalDeposits + user.reward - amount;
			user.reward = 0;
		} else {
			user.reward -= amount;
		}

		gauge.withdraw(amount);
		IERC20(lpPool).safeTransfer(recipient, amount);
	}

    /**
     * @dev Core function of the strat, in charge of updating, collecting and re-investing rewards.
     * 1. It claims rewards from the {gauge}.
     * 2. It swaps reward tokens for {tokens}.
     * 3. It deposits new tokens back to the {gauge}.
     */
	function distribute(
		SwapInfo[2] calldata swapInfos,
		FeeInfo calldata feeInfo
	) external onlyAssetRouter nonReentrant returns (uint256 reward) {
		if(totalDeposits == 0) revert NO_LIQUIDITY();
        if(distributionInfo[distributionID - 1].block == block.number) revert CALL_ON_THE_SAME_BLOCK();

		gauge.getReward(address(this));

        uint256 balance = IERC20(rewardToken).balanceOf(address(this));
        balance -= _collectFees(IERC20(rewardToken), balance, feeInfo);
        uint256 rewardTokenHalf = balance / 2;

		if (rewardTokenHalf > 0) {
			if (tokenA != rewardToken) {
				IRouter.Route[] calldata route = swapInfos[0].route;
				if(route[0].from != rewardToken || route[route.length - 1].to != tokenA) revert INVALID_ROUTE(rewardToken, tokenA);
				velodromeRouter.swapExactTokensForTokens(rewardTokenHalf, swapInfos[0].amountOutMin, route, address(this), block.timestamp);
			}

			if (tokenB != rewardToken) {
				IRouter.Route[] calldata route = swapInfos[1].route;
                if(route[0].from != rewardToken || route[route.length - 1].to != tokenB) revert INVALID_ROUTE(rewardToken, tokenB);
				velodromeRouter.swapExactTokensForTokens(rewardTokenHalf, swapInfos[1].amountOutMin, route, address(this), block.timestamp);
			}
		}

		(,,reward) = velodromeRouter.addLiquidity(tokenA, tokenB, isStable, IERC20(tokenA).balanceOf(address(this)), IERC20(tokenB).balanceOf(address(this)), swapInfos[0].amountOutMin, swapInfos[1].amountOutMin, address(this), block.timestamp);

		uint256 rewardPerDepositAge = (reward * fractionMultiplier) / (totalDepositAge + totalDeposits * (block.number - totalDepositLastUpdate));
		uint256 cumulativeRewardAgePerDepositAge = distributionInfo[distributionID - 1].cumulativeRewardAgePerDepositAge + rewardPerDepositAge * (block.number - distributionInfo[distributionID - 1].block);

		distributionInfo[distributionID] = DistributionInfo({ block: block.number, rewardPerDepositAge: rewardPerDepositAge, cumulativeRewardAgePerDepositAge: cumulativeRewardAgePerDepositAge });

		distributionID += 1;
		totalDepositLastUpdate = block.number;
		totalDepositAge = 0;

        gauge.deposit(reward);
	}

    /**
	 * @dev Sends fees to feeTo.
	 */
	function _collectFees(IERC20 token, uint256 balance, FeeInfo calldata feeInfo) internal returns(uint256 feeAmount) {
		if (feeInfo.feeTo != address(0)) {
			feeAmount = balance * feeInfo.fee / fractionMultiplier;
			if (feeAmount > 0) {
				token.safeTransfer(feeInfo.feeTo, feeAmount);
			}
		}
	}

	/**
	 * @dev Returns total funds staked by the {_address}.
	 */
	function userBalance(address _address) external view returns (uint256) {
		return userInfo[_address].stake + _userReward(_address);
	}

	/**
	 * @dev Returns total funds locked in the farm.
	 */
	function getTotalDeposits() external view returns (uint256 _totalDeposits) {
		if (totalDeposits > 0) {
			_totalDeposits = gauge.balanceOf(address(this));
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
			user.reward = _userReward(_address);
			// Count fresh deposit age from previous reward distribution to now.
			user.depositAge = user.stake * (block.number - distributionInfo[distributionID - 1].block);
		}

		user.lastDistribution = distributionID;
		user.lastUpdate = block.number;

		// Same with total deposit age.
		totalDepositAge += (block.number - totalDepositLastUpdate) * totalDeposits;
		totalDepositLastUpdate = block.number;
	}

	function _userReward(address _address) internal view returns (uint256) {
		UserInfo memory user = userInfo[_address];
		if (user.lastDistribution == distributionID) {
			// Return user.reward if the distribution after the last user deposit did not happen yet.
			return user.reward;
		}
		DistributionInfo memory lastUserDistributionInfo = distributionInfo[user.lastDistribution];
		uint256 userDepositAge = user.depositAge + user.stake * (lastUserDistributionInfo.block - user.lastUpdate);
		// Calculate reward between the last user deposit and the distribution after that.
		uint256 rewardBeforeDistibution = (userDepositAge * lastUserDistributionInfo.rewardPerDepositAge) / fractionMultiplier;
		// Calculate reward from the distributions that have happened after the last user deposit.
		uint256 rewardAfterDistribution = (user.stake * (distributionInfo[distributionID - 1].cumulativeRewardAgePerDepositAge - lastUserDistributionInfo.cumulativeRewardAgePerDepositAge)) / fractionMultiplier;
		return user.reward + rewardBeforeDistibution + rewardAfterDistribution;
	}
}
