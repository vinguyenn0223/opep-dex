// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title MerkleAirdrop — claim a fixed token amount against a Merkle root.
/// Each leaf is keccak256(abi.encodePacked(index, account, amount)). Claims are
/// tracked with a packed bitmap so each index can be claimed exactly once. The
/// owner sets the root, funds the contract, and may sweep leftovers after the
/// claim window closes.
contract MerkleAirdrop is Ownable {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    bytes32 public merkleRoot;
    uint64 public claimDeadline;

    mapping(uint256 => uint256) private claimedBitMap;

    event Claimed(uint256 indexed index, address indexed account, uint256 amount);
    event MerkleRootUpdated(bytes32 root);
    event ClaimDeadlineUpdated(uint64 deadline);
    event Swept(uint256 amount);

    constructor(
        address token_,
        bytes32 merkleRoot_,
        uint64 claimDeadline_,
        address owner_
    ) Ownable(owner_) {
        require(token_ != address(0), "token=0");
        token = IERC20(token_);
        merkleRoot = merkleRoot_;
        claimDeadline = claimDeadline_;
    }

    function isClaimed(uint256 index) public view returns (bool) {
        uint256 wordIndex = index / 256;
        uint256 bitIndex = index % 256;
        uint256 word = claimedBitMap[wordIndex];
        uint256 mask = (1 << bitIndex);
        return word & mask == mask;
    }

    function _setClaimed(uint256 index) private {
        uint256 wordIndex = index / 256;
        uint256 bitIndex = index % 256;
        claimedBitMap[wordIndex] |= (1 << bitIndex);
    }

    function claim(
        uint256 index,
        address account,
        uint256 amount,
        bytes32[] calldata merkleProof
    ) external {
        require(claimDeadline == 0 || block.timestamp <= claimDeadline, "claim closed");
        require(!isClaimed(index), "already claimed");

        bytes32 node = keccak256(abi.encodePacked(index, account, amount));
        require(MerkleProof.verify(merkleProof, merkleRoot, node), "invalid proof");

        _setClaimed(index);
        token.safeTransfer(account, amount);
        emit Claimed(index, account, amount);
    }

    function setMerkleRoot(bytes32 root) external onlyOwner {
        merkleRoot = root;
        emit MerkleRootUpdated(root);
    }

    function setClaimDeadline(uint64 deadline) external onlyOwner {
        claimDeadline = deadline;
        emit ClaimDeadlineUpdated(deadline);
    }

    /// Sweep remaining tokens back to the owner after the claim window closes.
    function sweep() external onlyOwner {
        require(claimDeadline != 0 && block.timestamp > claimDeadline, "window open");
        uint256 balance = token.balanceOf(address(this));
        require(balance > 0, "nothing");
        token.safeTransfer(owner(), balance);
        emit Swept(balance);
    }
}
