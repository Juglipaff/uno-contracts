// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import "../interfaces/IUniswapV2Pair.sol";
import "../interfaces/IUniswapV2Router.sol";
import "../interfaces/IMiniChefV2.sol";
import "../interfaces/IRewarder.sol";
import "../interfaces/IMiniChefUtils.sol";
import "../utils/UniswapV2ERC20.sol"; 
import "../utils/OwnableUpgradeableNoTransfer.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

contract SushiswapFarmUpgradeable is UniswapV2ERC20, UUPSUpgradeable, Initializable, OwnableUpgradeableNoTransfer, ReentrancyGuard {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     * @dev Tokens Used:
     * {rewardToken} - Token generated by staking (SUSHI).
     * {rewarderToken} - Token generated by ComplexRewarderTime contract.
     * {lpPair} - Token that the strategy maximizes. The same token that users deposit in the {lpStakingPool}.
     * {tokenA, tokenB} - Tokens that the strategy maximizes.
     */
    address public rewardToken;
    address public rewarderToken;
    address public lpPair;
    address public tokenA;
    address public tokenB;

    /**
     * @dev Third Party Contracts:
     * {sushiswapRouter} - The contract that executes swaps.
     * {MiniChef} -The contract that distibutes {rewardToken}.
     */
    IUniswapV2Router01 private constant sushiswapRouter = IUniswapV2Router01(0x1b02dA8Cb0d097eB8D57A175b88c7D8b47997506);
    IMiniChefV2 private constant MiniChef = IMiniChefV2(0x0769fd68dFb93167989C6f7254cd0D766Fb2841F);
    IMiniChefUtils private constant MiniChefUtils = IMiniChefUtils(0xBeE6dbb6606bb65953a24c254945cA95aEb22671);
    
    /**
     * @dev Contract Variables:
     *
     *
     *
     */
    uint256 private pid;

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

    function initialize(address _lpPair) external initializer {
        __Ownable_init();

        pid = MiniChefUtils.getPid(_lpPair);

        rewardToken = MiniChef.SUSHI();
        (IERC20[] memory rewarderTokenArray, ) = IRewarder(MiniChef.rewarder(pid)).pendingTokens(pid, address(0), 0);
        rewarderToken = address(rewarderTokenArray[0]);

        lpPair = MiniChef.lpToken(pid);

        tokenA = IUniswapV2Pair(lpPair).token0();
        tokenB = IUniswapV2Pair(lpPair).token1();

        uint256 MAX_UINT = uint256(2**256 - 1);
        IERC20(lpPair).approve(address(MiniChef), MAX_UINT);
        IERC20(lpPair).approve(address(sushiswapRouter), MAX_UINT);
        IERC20(rewardToken).approve(address(sushiswapRouter), MAX_UINT);
        IERC20(rewarderToken).approve(address(sushiswapRouter), MAX_UINT);
        IERC20(tokenA).approve(address(sushiswapRouter), MAX_UINT);
        IERC20(tokenB).approve(address(sushiswapRouter), MAX_UINT);

        lastRewardBlock = block.number;
        lastRewardPeriod = 1200000; //this is somewhere around 1 month at the time of writing this contract
    }

    /**
     * @dev Function that makes the deposits.95
     * If it's not the first deposit, withdraws {lpStakingPool} and deposits new tokens with the old ones.
     */
    function deposit(uint256 amountA, uint256 amountB, uint256 amountLP, address recipient) external onlyOwner nonReentrant returns(uint256 sentA, uint256 sentB, uint256 liquidity){
        uint256 addedLiquidity;
        if(amountA > 0 && amountB > 0){
            (sentA, sentB, addedLiquidity) = sushiswapRouter.addLiquidity(tokenA, tokenB, amountA, amountB, 0, 0, address(this), block.timestamp + 600);
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

        MiniChef.deposit(pid, liquidity, address(this));
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

        MiniChef.withdraw(pid, amount, address(this));
        if(withdrawLP){
            IERC20Upgradeable(lpPair).safeTransfer(recipient, amount);
            return (0, 0);
        }
        (amountA, amountB) = sushiswapRouter.removeLiquidity(tokenA, tokenB, amount, 0, 0, recipient, block.timestamp + 600);
    }

    function _mintLP(uint256 blocksTillReward, uint256 totalExpectedDepositAge, address recipient) internal {
        if (totalSupply == 0) {
            _mint(recipient, fractionMultiplier);
            return;
        }
        if (balanceOf[recipient] == totalSupply) {
            return;
        }
        uint256 userNewShare = _calculateUserNewShare(blocksTillReward, totalExpectedDepositAge, recipient);
        _mint(recipient, fractionMultiplier * (userNewShare * totalSupply / fractionMultiplier - balanceOf[recipient]) / (fractionMultiplier - userNewShare));
    }

    function _burnLP(uint256 blocksTillReward, uint256 totalExpectedDepositAge, address origin) internal {
        if(userDeposit[origin] == 0){
            _burn(origin, balanceOf[origin]);
            return;
        }
        if (balanceOf[origin] == totalSupply) {
            return;
        }
        uint256 userNewShare = _calculateUserNewShare(blocksTillReward, totalExpectedDepositAge, origin);
        _burn(origin, fractionMultiplier * (balanceOf[origin] - userNewShare * totalSupply / fractionMultiplier) / (fractionMultiplier - userNewShare));
    }

    function _calculateUserNewShare (uint256 blocksTillReward, uint256 totalExpectedDepositAge, address _address) internal view returns(uint256) {
        uint256 userExpectedReward = expectedReward * (userDeposit[_address] * blocksTillReward + userDepositAge[_address]) / totalExpectedDepositAge;
        return fractionMultiplier * (userDeposit[_address] + userExpectedReward) / (totalDeposits + expectedReward);
    }

    function _updateDeposit(address _address) internal {
        if (userDepositChanged[_address][lastRewardBlock]) {
            userDepositAge[_address] += (block.number - userDALastUpdated[_address]) * userDeposit[_address];
        } else {
            // a reward has been distributed, update user deposit
            userDeposit[_address] = userBalance(_address);
            userDepositAge[_address] = (block.number - lastRewardBlock) * userDeposit[_address];
            userDepositChanged[_address][lastRewardBlock] = true;
        }

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
     * 2. It swaps the {rewardToken} & {rewarderToken} token for {tokenA} & {tokenB}.
     * 3. It deposits the new LP tokens back in the {lpStakingPool}.
     */
    function distribute(address[] calldata rewarderTokenToTokenARoute, address[] calldata rewarderTokenToTokenBRoute, address[] calldata rewardTokenToTokenARoute, address[] calldata rewardTokenToTokenBRoute) external onlyOwner nonReentrant{
        require(totalDeposits > 0);

        MiniChef.harvest(pid, address(this));
        uint256 rewarderTokenHalf = IERC20(rewarderToken).balanceOf(address(this)) / 2;
        uint256 rewardTokenHalf = IERC20(rewardToken).balanceOf(address(this)) / 2;

        uint256 deadline = block.timestamp + 600;
        
        if (tokenA != rewarderToken) {
            sushiswapRouter.swapExactTokensForTokens(rewarderTokenHalf, 0, rewarderTokenToTokenARoute, address(this), deadline);
        }

        if (tokenB != rewarderToken) {
            sushiswapRouter.swapExactTokensForTokens(rewarderTokenHalf, 0, rewarderTokenToTokenBRoute, address(this), deadline);
        }

        if (tokenA != rewardToken) {
            sushiswapRouter.swapExactTokensForTokens(rewardTokenHalf, 0, rewardTokenToTokenARoute, address(this), deadline);
        }

        if (tokenB != rewardToken) {
            sushiswapRouter.swapExactTokensForTokens(rewardTokenHalf, 0, rewardTokenToTokenBRoute, address(this), deadline);
        }

        sushiswapRouter.addLiquidity(tokenA, tokenB, IERC20(tokenA).balanceOf(address(this)), IERC20(tokenB).balanceOf(address(this)), 1, 1, address(this), deadline);

        uint256 reward = IERC20(lpPair).balanceOf(address(this));
        if (reward > 0) {
            totalDeposits += reward;
            MiniChef.deposit(pid, reward, address(this));
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