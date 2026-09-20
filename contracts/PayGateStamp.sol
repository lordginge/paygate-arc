// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title PayGateStamp — the credit mint.
/// Every fill settled through PayGate is stamped on-chain: payment id, terms
/// hash, buyer, seller, and an optional buyerRef for custodial/trial flows
/// where the settling wallet is not the end user's. Append-only, publicly
/// auditable. Key doctrine: owner (cold) appoints stampers (hot); stampers
/// can only write stamps and hold no funds.
contract PayGateStamp {
    event FillStamped(
        bytes32 indexed paymentId,
        bytes32 indexed termsHash,
        address indexed buyer,
        address seller,
        bytes32 buyerRef,
        uint64 timestamp
    );
    event StamperSet(address indexed stamper, bool allowed);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    address public owner;
    mapping(address => bool) public isStamper;

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier onlyStamper() {
        require(isStamper[msg.sender], "not stamper");
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function setStamper(address stamper, bool allowed) external onlyOwner {
        require(stamper != address(0), "zero stamper");
        isStamper[stamper] = allowed;
        emit StamperSet(stamper, allowed);
    }

    function stamp(
        bytes32 paymentId,
        bytes32 termsHash,
        address buyer,
        address seller,
        bytes32 buyerRef
    ) external onlyStamper {
        emit FillStamped(paymentId, termsHash, buyer, seller, buyerRef, uint64(block.timestamp));
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}
