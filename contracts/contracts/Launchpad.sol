// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./Presale.sol";

/// @title Launchpad — factory that deploys Presale sales for any project.
/// A creator pays an optional flat fee, supplies the sale parameters and the
/// tokens to sell, and the launchpad deploys a Presale owned by the creator
/// and funds it with the tokens needed to cover the hard cap.
contract Launchpad is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct SaleParams {
        address token;
        uint256 rate; // token wei per 1 OPN (1e18 wei)
        uint256 softCap; // OPN wei
        uint256 hardCap; // OPN wei
        uint256 minPerWallet; // OPN wei
        uint256 maxPerWallet; // OPN wei
        uint64 startTime;
        uint64 endTime;
    }

    struct SaleInfo {
        address presale;
        address token;
        address creator;
        uint64 startTime;
        uint64 endTime;
    }

    uint256 public creationFee; // flat fee in OPN wei
    address public feeRecipient;
    SaleInfo[] public sales;

    mapping(address => uint256[]) public salesByCreator; // creator => indices

    event SaleCreated(
        uint256 indexed saleId,
        address indexed presale,
        address indexed creator,
        address token
    );
    event CreationFeeUpdated(uint256 fee);
    event FeeRecipientUpdated(address recipient);

    constructor(uint256 creationFee_, address feeRecipient_, address owner_) Ownable(owner_) {
        require(feeRecipient_ != address(0), "recipient=0");
        creationFee = creationFee_;
        feeRecipient = feeRecipient_;
    }

    function allSalesLength() external view returns (uint256) {
        return sales.length;
    }

    function getSalesByCreator(address creator) external view returns (uint256[] memory) {
        return salesByCreator[creator];
    }

    /// Creates a Presale and funds it with `tokenAmountForHardCap` tokens.
    /// Caller must approve this launchpad to pull the required tokens first.
    function createSale(SaleParams calldata p) external payable nonReentrant returns (address) {
        require(msg.value >= creationFee, "fee");

        Presale presale = new Presale(
            p.token,
            p.rate,
            p.softCap,
            p.hardCap,
            p.minPerWallet,
            p.maxPerWallet,
            p.startTime,
            p.endTime,
            msg.sender
        );

        uint256 tokensNeeded = (p.hardCap * p.rate) / 1e18;
        IERC20(p.token).safeTransferFrom(msg.sender, address(presale), tokensNeeded);

        uint256 saleId = sales.length;
        sales.push(
            SaleInfo({
                presale: address(presale),
                token: p.token,
                creator: msg.sender,
                startTime: p.startTime,
                endTime: p.endTime
            })
        );
        salesByCreator[msg.sender].push(saleId);

        if (creationFee > 0) {
            (bool ok, ) = feeRecipient.call{value: creationFee}("");
            require(ok, "fee transfer failed");
        }
        // Refund any overpayment of the creation fee.
        uint256 refund = msg.value - creationFee;
        if (refund > 0) {
            (bool ok, ) = msg.sender.call{value: refund}("");
            require(ok, "refund failed");
        }

        emit SaleCreated(saleId, address(presale), msg.sender, p.token);
        return address(presale);
    }

    function setCreationFee(uint256 fee) external onlyOwner {
        creationFee = fee;
        emit CreationFeeUpdated(fee);
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        require(recipient != address(0), "recipient=0");
        feeRecipient = recipient;
        emit FeeRecipientUpdated(recipient);
    }
}
