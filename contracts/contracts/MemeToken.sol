// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title OpnPepe (OPEPE) — meme token for the OPN Chain DEX.
/// Fixed supply minted once at deploy; no further minting possible.
contract MemeToken is ERC20Burnable, Ownable {
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        address treasury_
    ) ERC20(name_, symbol_) Ownable(msg.sender) {
        _mint(treasury_, totalSupply_);
    }
}
