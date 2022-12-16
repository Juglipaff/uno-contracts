// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {IUnoFarmQuickswapDual as Farm} from './IUnoFarmQuickswapDual.sol'; 
import '../../../interfaces/IUnoFarmFactory.sol';
import '../../../interfaces/IUnoAccessManager.sol'; 
import '@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol';

interface IUnoAssetRouterQuickswapDual {
    event Deposit(address indexed lpPool, address indexed sender, address indexed recipient, uint256 amount);
    event Withdraw(address indexed lpPool, address indexed sender, address indexed recipient, uint256 amount);
    event Distribute(address indexed lpPool, uint256 reward);

    event FeeChanged(uint256 previousFee, uint256 newFee);

    function farmFactory() external view returns(IUnoFarmFactory);
    function accessManager() external view returns(IUnoAccessManager);
    function fee() external view returns(uint256);

    function initialize(address _accessManager, address _farmFactory) external;

    function deposit(address lpStakingPool, uint256 amountA, uint256 amountB, uint256 amountAMin, uint256 amountBMin, uint256 amountLP, address recipient) external returns(uint256 sentA, uint256 sentB, uint256 liquidity);
    function depositETH(address lpStakingPool, uint256 amountToken, uint256 amountTokenMin, uint256 amountETHMin, uint256 amountLP, address recipient) external payable returns(uint256 sentToken, uint256 sentETH, uint256 liquidity);
    function depositSingleAsset(address lpStakingPool, address token, uint256 amount, bytes[2] calldata swapData, uint256 amountAMin, uint256 amountBMin, uint256 amountLP, address recipient) external returns(uint256 sent, uint256 liquidity);
    function depositSingleETH(address lpStakingPool, bytes[2] calldata swapData, uint256 amountAMin, uint256 amountBMin, uint256 amountLP, address recipient) external payable returns(uint256 sentETH, uint256 liquidity);

    function withdraw(address lpStakingPool, uint256 amount, uint256 amountAMin, uint256 amountBMin, bool withdrawLP, address recipient) external returns(uint256 amountA, uint256 amountB);
    function withdrawETH(address lpStakingPool, uint256 amount, uint256 amountTokenMin, uint256 amountETHMin, address recipient) external returns(uint256 amountToken, uint256 amountETH);

    function distribute(
        address lpStakingPool,
        Farm.SwapInfo[4] calldata swapInfos,
        Farm.SwapInfo[2] calldata feeSwapInfos,
        address feeTo
    ) external;

    function userStake(address _address, address lpStakingPool) external view returns (uint256 stakeLP, uint256 stakeA, uint256 stakeB);
    function totalDeposits(address lpStakingPool) external view returns (uint256 totalDepositsLP, uint256 totalDepositsA, uint256 totalDepositsB);
    function getTokens(address lpStakingPool) external view returns(IERC20Upgradeable[] memory tokens);

    function setFee(uint256 _fee) external;

    function paused() external view returns(bool);
    function pause() external;
    function unpause() external;

    function upgradeTo(address newImplementation) external;
}
