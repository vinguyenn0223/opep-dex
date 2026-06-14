// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title Presale — sells a token for native OPN at a fixed rate.
/// Contributions are accepted between start and end. If softCap is reached,
/// buyers claim tokens after the sale and the owner withdraws raised OPN.
/// If softCap is not reached, buyers get a full refund.
contract Presale is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    uint256 public immutable rate; // token units (wei) per 1 OPN (wei)
    uint256 public immutable softCap; // in wei of OPN
    uint256 public immutable hardCap; // in wei of OPN
    uint256 public immutable minPerWallet; // in wei of OPN
    uint256 public immutable maxPerWallet; // in wei of OPN
    uint64 public immutable startTime;
    uint64 public immutable endTime;

    uint256 public totalRaised;
    bool public finalized;
    bool public ownerWithdrawn;

    mapping(address => uint256) public contributed; // OPN wei per buyer
    mapping(address => bool) public claimed;

    event Contributed(address indexed buyer, uint256 amount);
    event Claimed(address indexed buyer, uint256 tokenAmount);
    event Refunded(address indexed buyer, uint256 amount);
    event Finalized(bool softCapReached, uint256 totalRaised);
    event OwnerWithdrawn(uint256 amount);
    event UnsoldTokensRecovered(uint256 amount);

    constructor(
        address token_,
        uint256 rate_,
        uint256 softCap_,
        uint256 hardCap_,
        uint256 minPerWallet_,
        uint256 maxPerWallet_,
        uint64 startTime_,
        uint64 endTime_,
        address owner_
    ) Ownable(owner_) {
        require(token_ != address(0), "token=0");
        require(rate_ > 0, "rate=0");
        require(hardCap_ >= softCap_ && softCap_ > 0, "bad caps");
        require(maxPerWallet_ >= minPerWallet_ && maxPerWallet_ > 0, "bad wallet caps");
        require(startTime_ < endTime_ && endTime_ > block.timestamp, "bad times");
        token = IERC20(token_);
        rate = rate_;
        softCap = softCap_;
        hardCap = hardCap_;
        minPerWallet = minPerWallet_;
        maxPerWallet = maxPerWallet_;
        startTime = startTime_;
        endTime = endTime_;
    }

    function tokenAmountFor(uint256 opnAmount) public view returns (uint256) {
        return (opnAmount * rate) / 1e18;
    }

    function contribute() external payable nonReentrant {
        require(block.timestamp >= startTime, "not started");
        require(block.timestamp <= endTime, "ended");
        require(msg.value > 0, "no value");
        require(totalRaised + msg.value <= hardCap, "hardcap");

        uint256 newContribution = contributed[msg.sender] + msg.value;
        require(newContribution >= minPerWallet, "below min");
        require(newContribution <= maxPerWallet, "above max");

        contributed[msg.sender] = newContribution;
        totalRaised += msg.value;
        emit Contributed(msg.sender, msg.value);
    }

    function softCapReached() public view returns (bool) {
        return totalRaised >= softCap;
    }

    function saleEnded() public view returns (bool) {
        return block.timestamp > endTime || totalRaised >= hardCap;
    }

    /// Anyone can finalize once the sale window closes (or hardcap hit).
    function finalize() external {
        require(!finalized, "finalized");
        require(saleEnded(), "not ended");
        finalized = true;
        emit Finalized(softCapReached(), totalRaised);
    }

    function claim() external nonReentrant {
        require(finalized, "not finalized");
        require(softCapReached(), "softcap failed: refund");
        require(!claimed[msg.sender], "claimed");
        uint256 amount = contributed[msg.sender];
        require(amount > 0, "nothing");
        claimed[msg.sender] = true;
        uint256 tokenAmount = tokenAmountFor(amount);
        token.safeTransfer(msg.sender, tokenAmount);
        emit Claimed(msg.sender, tokenAmount);
    }

    function refund() external nonReentrant {
        require(finalized, "not finalized");
        require(!softCapReached(), "softcap reached");
        uint256 amount = contributed[msg.sender];
        require(amount > 0, "nothing");
        contributed[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "refund failed");
        emit Refunded(msg.sender, amount);
    }

    function ownerWithdraw() external onlyOwner nonReentrant {
        require(finalized, "not finalized");
        require(softCapReached(), "softcap failed");
        require(!ownerWithdrawn, "withdrawn");
        ownerWithdrawn = true;
        uint256 amount = address(this).balance;
        (bool ok, ) = owner().call{value: amount}("");
        require(ok, "withdraw failed");
        emit OwnerWithdrawn(amount);
    }

    /// Recover tokens not sold (or all tokens if the sale failed).
    function recoverUnsoldTokens() external onlyOwner {
        require(finalized, "not finalized");
        uint256 sold = softCapReached() ? tokenAmountFor(totalRaised) : 0;
        uint256 balance = token.balanceOf(address(this));
        uint256 recoverable = balance - sold;
        require(recoverable > 0, "nothing");
        token.safeTransfer(owner(), recoverable);
        emit UnsoldTokensRecovered(recoverable);
    }
}
