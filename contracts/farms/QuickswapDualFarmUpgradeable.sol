// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../interfaces/IUniswapV2Pair.sol";
import "../interfaces/IUniswapV2Router.sol";
import "../interfaces/IStakingDualRewards.sol";
import "../utils/UniswapV2ERC20.sol"; 
import "../utils/OwnableUpgradeableNoTransfer.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

contract QuickswapDualFarmUpgradeable is UniswapV2ERC20, UUPSUpgradeable, Initializable, OwnableUpgradeableNoTransfer, ReentrancyGuard {
    using SafeERC20Upgradeable for IERC20Upgradeable;

      /**
     * @dev Tokens Used:
     * {rewardTokenA, rewardTokenB} - Tokens generated by staking.
     * {lpPair} - Token that the strategy maximizes. The same token that users deposit in the {lpStakingPool}.
     * {tokenA, tokenB} - Tokens that the strategy maximizes.
     */
    address public rewardTokenA;
    address public rewardTokenB;
    address public lpPair;
    address public tokenA;
    address public tokenB;
    
    /**
     * @dev Third Party Contracts:
     * {quickswapRouter} - The contract that executes swaps.
     * {lpStakingPool} - The contract that distibutes {rewardTokenA, rewardTokenB}.
     */
    IUniswapV2Router01 private constant quickswapRouter = IUniswapV2Router01(0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff);
    IStakingDualRewards private lpStakingPool;
    
    /**
     * @dev Contract Variables:
     * 
     * 
     * 
     * 
     * 
     */
    uint256 private expectedRewardBlock;
    uint256 private expectedReward;
    uint256 private lastRewardBlock;
    uint256 private lastRewardPeriod;

    mapping(address => uint256) private userDeposit;
    mapping(address => uint256) private userDepositAge;
    mapping(address => uint256) private userDALastUpdated;
    mapping(address => mapping(uint256 => bool)) private userDepositChanged;

    uint256 public totalDeposits;
    uint256 private totalDepositAge;
    uint256 private totalDALastUpdated;

    uint256 private constant fractionMultiplier = 10**decimals;

    // ============ Methods ============
    
    function initialize(address _lpStakingPool) external initializer {
        __Ownable_init();

        lpStakingPool = IStakingDualRewards(_lpStakingPool);
        lpPair = address(lpStakingPool.stakingToken());
        
        rewardTokenA = lpStakingPool.rewardsTokenA();
        rewardTokenB = lpStakingPool.rewardsTokenB();
        
        tokenA = IUniswapV2Pair(lpPair).token0();
        tokenB = IUniswapV2Pair(lpPair).token1();
        
        uint256 MAX_UINT = uint256(2**256 - 1);
        IERC20(lpPair).approve(_lpStakingPool, MAX_UINT);
        IERC20(lpPair).approve(address(quickswapRouter), MAX_UINT);
        IERC20(rewardTokenA).approve(address(quickswapRouter), MAX_UINT);
        IERC20(rewardTokenB).approve(address(quickswapRouter), MAX_UINT);
        IERC20(tokenA).approve(address(quickswapRouter), MAX_UINT);
        IERC20(tokenB).approve(address(quickswapRouter), MAX_UINT);

        lastRewardBlock = block.number;
        lastRewardPeriod = 1200000; //this is somewhere around 1 month at the time of writing this contract
    }

    /**
     * @dev Function that makes the deposits.
     * If it's not the first deposit, withdraws {lpStakingPool} and deposits new tokens with the old ones.
     *
     * note: user's actual fair reward may differ from these calculations because new deposits
     * in the same reward interval will change the total expected deposit age, so there's no way
     * to reliably & precisely predict the correct reward distribution, but this approach still
     * provides results good enough and remains practical
     */
    function deposit(uint256 amountA, uint256 amountB, uint256 amountLP, address recipient) external onlyOwner nonReentrant returns(uint256 sentA, uint256 sentB, uint256 liquidity){
        uint256 addedLiquidity;
        if(amountA > 0 && amountB > 0) {
            (sentA, sentB, addedLiquidity) = quickswapRouter.addLiquidity(tokenA, tokenB, amountA, amountB, 0, 0, address(this), block.timestamp + 600);
        }
        liquidity = addedLiquidity + amountLP;
        require(liquidity > 0);

        _updateDeposit(recipient);
        
        uint256 blocksTillReward;
        if(expectedRewardBlock > block.number){
            blocksTillReward = expectedRewardBlock - block.number;
        }else{
            blocksTillReward = lastRewardPeriod / 2;
        }

        uint256 totalExpectedDepositAgePrev = totalDeposits * blocksTillReward + totalDepositAge;
        uint256 totalExpectedDepositAge = liquidity * blocksTillReward + totalExpectedDepositAgePrev;
        // update deposit amounts
        userDeposit[recipient] += liquidity;
        totalDeposits += liquidity;
        // expected reward will increase proportionally to the increase of total expected deposit age
        if (totalExpectedDepositAgePrev > 0) {
            expectedReward = expectedReward * totalExpectedDepositAge / totalExpectedDepositAgePrev;
        }

        _mintLP(blocksTillReward, totalExpectedDepositAge, recipient);
            
        lpStakingPool.stake(liquidity);
        IERC20Upgradeable(tokenA).safeTransfer(recipient, amountA - sentA);
        IERC20Upgradeable(tokenB).safeTransfer(recipient, amountB - sentB);
    }

     /**
     * @dev Withdraws funds and sends them to the {recipient}.
     */
    function withdraw(address origin, uint256 amount, bool withdrawLP, address recipient) external onlyOwner nonReentrant returns(uint256 amountA, uint256 amountB){
        require(amount > 0 && userDeposit[origin] > 0);
        
        _updateDeposit(origin);

        uint256 blocksTillReward;
        if(expectedRewardBlock > block.number){
            blocksTillReward = expectedRewardBlock - block.number;
        }else{
            blocksTillReward = lastRewardPeriod / 2;
        }

        uint256 totalExpectedDepositAgePrev = totalDeposits * blocksTillReward + totalDepositAge;
        uint256 totalExpectedDepositAge = totalExpectedDepositAgePrev - amount * blocksTillReward;
        // update deposit amounts
        userDeposit[origin] -= amount;
        totalDeposits -= amount;
        // expected reward will decrease proportionally to the decrease of total expected deposit age
        expectedReward = expectedReward * totalExpectedDepositAge / totalExpectedDepositAgePrev;

        _burnLP(blocksTillReward, totalExpectedDepositAge, origin);

        lpStakingPool.withdraw(amount);
        if(withdrawLP){
            IERC20Upgradeable(lpPair).safeTransfer(recipient, amount);
            return (0, 0);
        }
        (amountA, amountB) = quickswapRouter.removeLiquidity(tokenA, tokenB, amount, 0, 0, recipient, block.timestamp + 600);
    }

    function _mintLP(uint256 blocksTillReward, uint256 totalExpectedDepositAge, address recipient) internal {
        if (totalSupply == 0) {
            _mint(recipient, 10**decimals);
            return;
        }
        if (balanceOf[recipient] == totalSupply) {
            return;
        }
        uint256 userExpectedReward = expectedReward * (userDeposit[recipient] * blocksTillReward + userDepositAge[recipient]) / totalExpectedDepositAge;
        uint256 userNewShare = fractionMultiplier * (userDeposit[recipient] + userExpectedReward) / (totalDeposits + expectedReward);
        _mint(recipient, fractionMultiplier * (userNewShare * totalSupply / fractionMultiplier - balanceOf[recipient]) / (fractionMultiplier - userNewShare));
    }

    function _burnLP(uint256 blocksTillReward, uint256 totalExpectedDepositAge, address origin) internal{
        if(userDeposit[origin] == 0){
            _burn(origin, balanceOf[origin]);
            return;
        }
        if (balanceOf[origin] == totalSupply) {
            return;
        }
        uint256 userExpectedReward = expectedReward * (userDeposit[origin] * blocksTillReward + userDepositAge[origin]) / totalExpectedDepositAge;
        uint256 userNewShare = fractionMultiplier * (userDeposit[origin] + userExpectedReward) / (totalDeposits + expectedReward);
        _burn(origin, fractionMultiplier * (balanceOf[origin] - userNewShare * totalSupply / fractionMultiplier) / (fractionMultiplier - userNewShare));
    }

    function _updateDeposit(address _address) internal {
        if (userDepositChanged[_address][lastRewardBlock]) {
            // add deposit age from previous deposit age update till now
            userDepositAge[_address] += (block.number - userDALastUpdated[_address]) * userDeposit[_address];
        } else {
            // a reward has been distributed, update user deposit
            userDeposit[_address] = userBalance(_address);
            // count fresh deposit age from that reward distribution till now
            userDepositAge[_address] = (block.number - lastRewardBlock) * userDeposit[_address];
            userDepositChanged[_address][lastRewardBlock] = true;
        }

        // same with total deposit age
        if (totalDALastUpdated > lastRewardBlock) {
            totalDepositAge += (block.number - totalDALastUpdated) * totalDeposits;
        } else {
            totalDepositAge = (block.number - lastRewardBlock) * totalDeposits;
        }

        userDALastUpdated[_address] = block.number;
        totalDALastUpdated = block.number;
    }

    /**
     * @dev Core function of the strat, in charge of updating, collecting and re-investing rewards.
     * 1. It claims rewards from the {lpStakingPool}.
     * 2. It swaps the {rewardTokenA} & {rewardTokenB} tokens for {tokenA} & {tokenB}.
     * 3. It deposits the new LP tokens back to the {lpStakingPool}.
     */
    function distribute(address[] calldata rewardTokenAToTokenARoute, address[] calldata rewardTokenAToTokenBRoute, address[] calldata rewardTokenBToTokenARoute, address[] calldata rewardTokenBToTokenBRoute) external onlyOwner nonReentrant{
        require(totalDeposits > 0);
                
        lpStakingPool.getReward();
        uint256 rewardTokenAHalf = IERC20(rewardTokenA).balanceOf(address(this))/2;
        uint256 rewardTokenBHalf = IERC20(rewardTokenB).balanceOf(address(this))/2;

        uint256 deadline = block.timestamp + 600;
                
        if (tokenA != rewardTokenA) {
            quickswapRouter.swapExactTokensForTokens(rewardTokenAHalf, 0, rewardTokenAToTokenARoute, address(this), deadline);
        }
        
        if (tokenB != rewardTokenA) {
            quickswapRouter.swapExactTokensForTokens(rewardTokenAHalf, 0, rewardTokenAToTokenBRoute, address(this), deadline);
        }
        
        if (tokenA != rewardTokenB) {
            quickswapRouter.swapExactTokensForTokens(rewardTokenBHalf, 0, rewardTokenBToTokenARoute, address(this), deadline);
        }
        
        if (tokenB != rewardTokenB) {
            quickswapRouter.swapExactTokensForTokens(rewardTokenBHalf, 0, rewardTokenBToTokenBRoute, address(this), deadline);
        }
        
        uint256 tokenABalance = IERC20(tokenA).balanceOf(address(this));
        uint256 tokenBBalance = IERC20(tokenB).balanceOf(address(this));
                
        quickswapRouter.addLiquidity(tokenA, tokenB, tokenABalance, tokenBBalance, 1, 1, address(this), deadline);
                
        uint256 reward = IERC20(lpPair).balanceOf(address(this));
        if (reward > 0) {
            totalDeposits += reward;
            lpStakingPool.stake(reward);
        }

        lastRewardPeriod = block.number - lastRewardBlock;
        _setExpectedReward(reward, block.number + lastRewardPeriod);
        lastRewardBlock = block.number;
    }

    function setExpectedReward(uint256 _amount, uint256 _block) external onlyOwner{
       _setExpectedReward(_amount, _block);
    }

    function _setExpectedReward(uint256 _amount, uint256 _block) internal {
        expectedReward = _amount;
        expectedRewardBlock = _block;
    }

    /**
     * @dev Returns total funds staked by the {_address}.
     */
    function userBalance(address _address) public view returns (uint256) {
        if (userDepositChanged[_address][lastRewardBlock]) {
            return userDeposit[_address];
        } else {
            if (totalSupply == 0) {
                return 0;
            }
            return totalDeposits * balanceOf[_address] / totalSupply;
        }
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {

    }
}