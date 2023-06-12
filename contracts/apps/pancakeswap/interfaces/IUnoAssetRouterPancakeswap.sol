// SPDX-License-Identifier: MIT
pragma solidity 0.8.10;

import {IUnoFarmPancakeswap as Farm} from './IUnoFarmPancakeswap.sol'; 
import '../../../interfaces/IUnoAssetRouter.sol';

interface IUnoAssetRouterPancakeswap is IUnoAssetRouter {
    function distribute(
        address lpPair,
        Farm.SwapInfo[2] calldata swapInfos,
        Farm.SwapInfo calldata feeSwapInfo,
        address feeTo
    ) external returns(uint256 reward);
}
