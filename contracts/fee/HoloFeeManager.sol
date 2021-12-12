// SPDX-License-Identifier: MIT

/* solhint-disable no-empty-blocks */
pragma solidity 0.8.6;

import { IUniswapV2Pair } from "../external/uniswap/IUniswapV2Pair.sol";
import { IUniswapV2Router02 } from "../external/uniswap/IUniswapV2Router02.sol";

import { IERC20 } from "../interfaces/IERC20.sol";
import { Ownable } from "../helpers/Ownable.sol";
import { FeeManager } from "../abstract/FeeManager.sol";

contract HoloFeeManager is FeeManager, Ownable {
    /// @notice address of wrapped BNB
    address public wBNB;

    /// @notice address of LP mint
    address public lpMint;

    /// @notice uniswap V2 pair address
    IUniswapV2Pair public uniswapPair;
    /// @notice uniswap V2 router
    IUniswapV2Router02 public uniswapRouter;

    /// @notice min amount of tokens to trigger sync
    uint256 public minTokens;

    /// @notice fee distribution
    uint256 public burnFeeAlloc = 0;
    uint256 public lpFeeAlloc = 100;
    uint256 public totalFeeAlloc = burnFeeAlloc + lpFeeAlloc;

    constructor(address _token, address _wBNB) FeeManager(_token) {
        require(_wBNB != address(0), "_wBNB address cannot be 0");
        wBNB = _wBNB;
        minTokens = 500 * 10**18;
    }

    function setUniswap(address _uniswapPair, address _uniswapRouter) external onlyOwner {
        require(_uniswapPair != address(0), "_uniswapPair address cannot be 0");
        require(_uniswapRouter != address(0), "_uniswapRouter address cannot be 0");
        uniswapPair = IUniswapV2Pair(_uniswapPair);
        uniswapRouter = IUniswapV2Router02(_uniswapRouter);

        IERC20(token).approve(address(uniswapRouter), 0);
        IERC20(token).approve(address(uniswapRouter), type(uint256).max);
        IERC20(wBNB).approve(address(uniswapRouter), 0);
        IERC20(wBNB).approve(address(uniswapRouter), type(uint256).max);
    }

    function canSyncFee(address, address recipient) external view override returns (bool shouldSyncFee) {
        if (recipient == address(uniswapPair)) {
            shouldSyncFee = true;
        }
    }

    function _syncFee() internal override {
        uint256 totalAmount = IERC20(token).balanceOf(address(this));
        uint256 burnAmount;

        if (totalAmount >= minTokens && totalFeeAlloc > 0) {
            burnAmount = (totalAmount * burnFeeAlloc) / totalFeeAlloc;

            if (burnAmount > 0) {
                IERC20(token).burn(burnAmount);
            }

            uint256 lpAmount = totalAmount - burnAmount;

            if (lpAmount >= 2) {
                uint256 swapAmount = lpAmount / 2;
                uint256 liquidityAmount = lpAmount - swapAmount;

                // swap half for BNB
                uint256 preBNB = IERC20(wBNB).balanceOf(address(this));
                _swapTokens(swapAmount);
                uint256 postBNB = IERC20(wBNB).balanceOf(address(this));

                // add other half with received BNB
                _addTokensToLiquidity(liquidityAmount, postBNB - preBNB);
            }
        }
    }

    function _swapTokens(uint256 amount) private {
        address[] memory path = new address[](2);

        path[0] = token;
        path[1] = wBNB;

        try uniswapRouter.swapExactTokensForTokens(amount, 0, path, address(this), block.timestamp) {} catch {}
    }

    function _addTokensToLiquidity(uint256 tokenAmount, uint256 wBNBAmount) private {
        if (tokenAmount != 0 && wBNBAmount != 0) {
            address destination = (lpMint != address(0)) ? lpMint : address(this);

            try uniswapRouter.addLiquidity(token, wBNB, tokenAmount, wBNBAmount, 0, 0, destination, block.timestamp) {} catch {}
        }
    }

    function setLpMint(address _lpMint) public onlyOwner {
        lpMint = _lpMint;
    }

    function setMinTokens(uint256 _minTokens) public onlyOwner {
        require(_minTokens >= 100, "not less then 100");
        minTokens = _minTokens;
    }

    function setFeeAlloc(uint256 _burnFeeAlloc, uint256 _lpFeeAlloc) public onlyOwner {
        require(_burnFeeAlloc >= 0 && _burnFeeAlloc <= 100, "_burnFeeAlloc is outside of range 0-100");
        require(_lpFeeAlloc >= 0 && _lpFeeAlloc <= 100, "_lpFeeAlloc is outside of range 0-100");
        burnFeeAlloc = _burnFeeAlloc;
        lpFeeAlloc = _lpFeeAlloc;
        totalFeeAlloc = burnFeeAlloc + lpFeeAlloc;
    }

    function recoverBNB() external onlyOwner {
        payable(owner).transfer(address(this).balance);
    }

    function recoverBep20(address _token) external onlyOwner {
        uint256 amt = IERC20(_token).balanceOf(address(this));
        require(amt > 0, "nothing to recover");
        IBadErc20(_token).transfer(owner, amt);
    }
}

interface IBadErc20 {
    function transfer(address _recipient, uint256 _amount) external;
}
