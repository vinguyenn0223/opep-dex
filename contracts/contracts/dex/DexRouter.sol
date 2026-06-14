// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "./interfaces.sol";
import "./DexLibrary.sol";

interface IWOPN {
    function deposit() external payable;
    function withdraw(uint256) external;
    function transfer(address to, uint256 value) external returns (bool);
}

contract DexRouter {
    address public immutable factory;
    address public immutable WOPN;

    modifier ensure(uint256 deadline) {
        require(deadline >= block.timestamp, "DexRouter: EXPIRED");
        _;
    }

    constructor(address _factory, address _WOPN) {
        factory = _factory;
        WOPN = _WOPN;
    }

    receive() external payable {
        require(msg.sender == WOPN, "DexRouter: ONLY_WOPN"); // only accept native via WOPN withdraw
    }

    // ---------- internal token transfers ----------
    function _safeTransferFrom(address token, address from, address to, uint256 value) private {
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20Dex.transferFrom.selector, from, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "DexRouter: TRANSFER_FROM_FAILED");
    }

    function _safeTransfer(address token, address to, uint256 value) private {
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(IERC20Dex.transfer.selector, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "DexRouter: TRANSFER_FAILED");
    }

    function _safeTransferOPN(address to, uint256 value) private {
        (bool success, ) = to.call{value: value}("");
        require(success, "DexRouter: OPN_TRANSFER_FAILED");
    }

    // ---------- ADD LIQUIDITY ----------
    function _addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin
    ) internal returns (uint256 amountA, uint256 amountB) {
        if (IDexFactory(factory).getPair(tokenA, tokenB) == address(0)) {
            IDexFactory(factory).createPair(tokenA, tokenB);
        }
        (uint256 reserveA, uint256 reserveB) = DexLibrary.getReserves(factory, tokenA, tokenB);
        if (reserveA == 0 && reserveB == 0) {
            (amountA, amountB) = (amountADesired, amountBDesired);
        } else {
            uint256 amountBOptimal = DexLibrary.quote(amountADesired, reserveA, reserveB);
            if (amountBOptimal <= amountBDesired) {
                require(amountBOptimal >= amountBMin, "DexRouter: INSUFFICIENT_B_AMOUNT");
                (amountA, amountB) = (amountADesired, amountBOptimal);
            } else {
                uint256 amountAOptimal = DexLibrary.quote(amountBDesired, reserveB, reserveA);
                assert(amountAOptimal <= amountADesired);
                require(amountAOptimal >= amountAMin, "DexRouter: INSUFFICIENT_A_AMOUNT");
                (amountA, amountB) = (amountAOptimal, amountBDesired);
            }
        }
    }

    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256 amountA, uint256 amountB, uint256 liquidity) {
        (amountA, amountB) = _addLiquidity(tokenA, tokenB, amountADesired, amountBDesired, amountAMin, amountBMin);
        address pair = DexLibrary.pairFor(factory, tokenA, tokenB);
        _safeTransferFrom(tokenA, msg.sender, pair, amountA);
        _safeTransferFrom(tokenB, msg.sender, pair, amountB);
        liquidity = IDexPair(pair).mint(to);
    }

    function addLiquidityOPN(
        address token,
        uint256 amountTokenDesired,
        uint256 amountTokenMin,
        uint256 amountOPNMin,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256 amountToken, uint256 amountOPN, uint256 liquidity) {
        (amountToken, amountOPN) =
            _addLiquidity(token, WOPN, amountTokenDesired, msg.value, amountTokenMin, amountOPNMin);
        address pair = DexLibrary.pairFor(factory, token, WOPN);
        _safeTransferFrom(token, msg.sender, pair, amountToken);
        IWOPN(WOPN).deposit{value: amountOPN}();
        assert(IWOPN(WOPN).transfer(pair, amountOPN));
        liquidity = IDexPair(pair).mint(to);
        if (msg.value > amountOPN) _safeTransferOPN(msg.sender, msg.value - amountOPN);
    }

    // ---------- REMOVE LIQUIDITY ----------
    function removeLiquidity(
        address tokenA,
        address tokenB,
        uint256 liquidity,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountA, uint256 amountB) {
        address pair = DexLibrary.pairFor(factory, tokenA, tokenB);
        _safeTransferFrom(pair, msg.sender, pair, liquidity);
        (uint256 amount0, uint256 amount1) = IDexPair(pair).burn(to);
        (address token0, ) = DexLibrary.sortTokens(tokenA, tokenB);
        (amountA, amountB) = tokenA == token0 ? (amount0, amount1) : (amount1, amount0);
        require(amountA >= amountAMin, "DexRouter: INSUFFICIENT_A_AMOUNT");
        require(amountB >= amountBMin, "DexRouter: INSUFFICIENT_B_AMOUNT");
    }

    function removeLiquidityOPN(
        address token,
        uint256 liquidity,
        uint256 amountTokenMin,
        uint256 amountOPNMin,
        address to,
        uint256 deadline
    ) public ensure(deadline) returns (uint256 amountToken, uint256 amountOPN) {
        (amountToken, amountOPN) = removeLiquidity(
            token, WOPN, liquidity, amountTokenMin, amountOPNMin, address(this), deadline
        );
        _safeTransfer(token, to, amountToken);
        IWOPN(WOPN).withdraw(amountOPN);
        _safeTransferOPN(to, amountOPN);
    }

    // ---------- SWAP ----------
    function _swap(uint256[] memory amounts, address[] memory path, address _to) internal {
        for (uint256 i; i < path.length - 1; i++) {
            (address input, address output) = (path[i], path[i + 1]);
            (address token0, ) = DexLibrary.sortTokens(input, output);
            uint256 amountOut = amounts[i + 1];
            (uint256 amount0Out, uint256 amount1Out) =
                input == token0 ? (uint256(0), amountOut) : (amountOut, uint256(0));
            address to = i < path.length - 2 ? DexLibrary.pairFor(factory, output, path[i + 2]) : _to;
            IDexPair(DexLibrary.pairFor(factory, input, output)).swap(amount0Out, amount1Out, to, new bytes(0));
        }
    }

    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = DexLibrary.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "DexRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        _safeTransferFrom(path[0], msg.sender, DexLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapTokensForExactTokens(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        amounts = DexLibrary.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, "DexRouter: EXCESSIVE_INPUT_AMOUNT");
        _safeTransferFrom(path[0], msg.sender, DexLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        _swap(amounts, path, to);
    }

    function swapExactOPNForTokens(
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256[] memory amounts) {
        require(path[0] == WOPN, "DexRouter: INVALID_PATH");
        amounts = DexLibrary.getAmountsOut(factory, msg.value, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "DexRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        IWOPN(WOPN).deposit{value: amounts[0]}();
        assert(IWOPN(WOPN).transfer(DexLibrary.pairFor(factory, path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
    }

    function swapExactTokensForOPN(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WOPN, "DexRouter: INVALID_PATH");
        amounts = DexLibrary.getAmountsOut(factory, amountIn, path);
        require(amounts[amounts.length - 1] >= amountOutMin, "DexRouter: INSUFFICIENT_OUTPUT_AMOUNT");
        _safeTransferFrom(path[0], msg.sender, DexLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        _swap(amounts, path, address(this));
        IWOPN(WOPN).withdraw(amounts[amounts.length - 1]);
        _safeTransferOPN(to, amounts[amounts.length - 1]);
    }

    function swapTokensForExactOPN(
        uint256 amountOut,
        uint256 amountInMax,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external ensure(deadline) returns (uint256[] memory amounts) {
        require(path[path.length - 1] == WOPN, "DexRouter: INVALID_PATH");
        amounts = DexLibrary.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= amountInMax, "DexRouter: EXCESSIVE_INPUT_AMOUNT");
        _safeTransferFrom(path[0], msg.sender, DexLibrary.pairFor(factory, path[0], path[1]), amounts[0]);
        _swap(amounts, path, address(this));
        IWOPN(WOPN).withdraw(amounts[amounts.length - 1]);
        _safeTransferOPN(to, amounts[amounts.length - 1]);
    }

    function swapOPNForExactTokens(
        uint256 amountOut,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external payable ensure(deadline) returns (uint256[] memory amounts) {
        require(path[0] == WOPN, "DexRouter: INVALID_PATH");
        amounts = DexLibrary.getAmountsIn(factory, amountOut, path);
        require(amounts[0] <= msg.value, "DexRouter: EXCESSIVE_INPUT_AMOUNT");
        IWOPN(WOPN).deposit{value: amounts[0]}();
        assert(IWOPN(WOPN).transfer(DexLibrary.pairFor(factory, path[0], path[1]), amounts[0]));
        _swap(amounts, path, to);
        if (msg.value > amounts[0]) _safeTransferOPN(msg.sender, msg.value - amounts[0]);
    }

    // ---------- VIEW HELPERS ----------
    function quote(uint256 amountA, uint256 reserveA, uint256 reserveB) external pure returns (uint256) {
        return DexLibrary.quote(amountA, reserveA, reserveB);
    }

    function getAmountsOut(uint256 amountIn, address[] memory path) external view returns (uint256[] memory) {
        return DexLibrary.getAmountsOut(factory, amountIn, path);
    }

    function getAmountsIn(uint256 amountOut, address[] memory path) external view returns (uint256[] memory) {
        return DexLibrary.getAmountsIn(factory, amountOut, path);
    }
}
